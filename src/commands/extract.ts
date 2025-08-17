import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { readConfig } from '../config/config'
import { isSupportedFileType, normalizeFileType, type SupportedFileType } from '../config/fileTypes'
import { extractStrings } from '../extraction/extract'
import { streamCsvStrings } from '../extraction/formats/csv'
import type { Telemetry } from '../telemetry/telemetry'
import { chooseLargeOutputAction, confirmManyDocuments } from '../ui/largeOutput'
import type { Notifier } from '../ui/notifier'
import { type CsvPromptOptions, promptCsvOptionsIfNeeded, promptForFileType } from '../ui/prompts'
import type { StatusBar } from '../ui/statusBar'
import { splitCsvLine } from '../utils/csv'
import { detectEnvExtension } from '../utils/filename'
import { dedupe, sortStrings } from '../utils/text'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

// Helper to detect multiline strings in results
function countMultilineStrings(strings: readonly string[]): number {
	return strings.filter((s) => s.includes('\n') || s.includes('\r')).length
}

// Helper function to build TextDocumentShowOptions based on config
function getShowDocumentOptions(
	config: ReturnType<typeof readConfig>,
	baseOptions: Partial<vscode.TextDocumentShowOptions> = {},
): vscode.TextDocumentShowOptions {
	const options: vscode.TextDocumentShowOptions = { ...baseOptions }
	if (config.openResultsSideBySide) {
		options.viewColumn = vscode.ViewColumn.Beside
	}
	return options
}

// Helper type for extraction context
type ExtractionContext = Readonly<{
	document: vscode.TextDocument
	text: string
	fileType: SupportedFileType
	csvOptions: CsvPromptOptions
	config: ReturnType<typeof readConfig>
	deps: {
		telemetry: Telemetry
		notifier: Notifier
		statusBar: StatusBar
	}
}>

// Initial validation and setup
async function validateAndPrepareExtraction(
	deps: ExtractionContext['deps'],
): Promise<Pick<ExtractionContext, 'document' | 'text' | 'fileType'> | null> {
	// Wait for active editor with retry for large files
	let editor = vscode.window.activeTextEditor
	if (!editor) {
		// Retry once after a short delay for large files that might still be loading
		await new Promise((resolve) => setTimeout(resolve, 100))
		editor = vscode.window.activeTextEditor
	}

	if (!editor) {
		deps.notifier.error(localize('runtime.message.error.no-editor', 'No active editor'))
		return null
	}

	const document = editor.document
	// Infer file type from filename (.env variants) or prompt if unknown
	let fileType = normalizeFileType(detectEnvExtension(document.fileName))
	if (!fileType) {
		const chosen = await promptForFileType()
		if (!chosen) return null
		fileType = chosen
	}
	if (!isSupportedFileType(fileType)) {
		const chosen = await promptForFileType()
		if (!chosen) return null
		fileType = chosen as SupportedFileType
	}

	const text = document.getText()
	if (text.trim().length === 0) {
		deps.notifier.info(localize('runtime.message.info.file-empty', 'File is empty'))
		return null
	}

	return { document, text, fileType }
}

// Handle CSV multi-column fan-out extraction
async function handleCsvMultiColumnExtraction(
	context: ExtractionContext,
	token: vscode.CancellationToken,
): Promise<boolean> {
	const { text, csvOptions, config, deps } = context

	if (!csvOptions.selectAllColumns && (!csvOptions.csvColumnIndexes || csvOptions.csvColumnIndexes.length <= 1)) {
		return false // Not multi-column
	}

	// Determine target column indexes
	const firstNonEmptyLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
	const columnCount = splitCsvLine(firstNonEmptyLine).length
	const targetIndexes: readonly number[] = csvOptions.selectAllColumns
		? Array.from({ length: columnCount }, (_, i) => i)
		: (csvOptions.csvColumnIndexes ?? [])

	// Estimate total output lines for safety warning
	const totalLinesInDoc = text.split(/\r?\n/).length
	const rowsEstimate = Math.max(totalLinesInDoc - (csvOptions.csvHasHeader ? 1 : 0), 0)
	const estimatedTotal = rowsEstimate * targetIndexes.length

	if (
		config.safetyEnabled &&
		(targetIndexes.length >= config.manyDocumentsThreshold || estimatedTotal > config.largeOutputLinesThreshold)
	) {
		const ok = await confirmManyDocuments(targetIndexes.length, estimatedTotal)
		if (!ok) return true // Handled (cancelled)
	}

	const streamingEnabled = config.csvStreamingEnabled

	if (streamingEnabled) {
		await handleStreamingMultiColumn(context, targetIndexes, token)
	} else {
		await handleNonStreamingMultiColumn(context, targetIndexes, token)
	}

	deps.telemetry.event('extracted', { count: 'multi', type: 'csv' })
	deps.statusBar.flash(localize('runtime.status.csv-opened', 'CSV opened (no auto‑copy)'))
	deps.notifier.showCsvNoCopy()
	return true // Handled
}

// Streaming multi-column helper
async function handleStreamingMultiColumn(
	context: ExtractionContext,
	targetIndexes: readonly number[],
	token: vscode.CancellationToken,
): Promise<void> {
	const { text, csvOptions, config, deps } = context

	for (const idx of targetIndexes) {
		if (token.isCancellationRequested) return

		try {
			const doc = await vscode.workspace.openTextDocument({
				content: '',
				language: 'plaintext',
			})
			const editorForResults = await vscode.window.showTextDocument(
				doc,
				getShowDocumentOptions(config, {
					preview: false,
					preserveFocus: true,
				}),
			)
			const seen = config.dedupeEnabled ? new Set<string>() : undefined
			let pending: string[] = []

			const flush = async (): Promise<void> => {
				if (pending.length === 0) return
				const toAppend = `${pending.join('\n')}\n`
				pending = []
				await editorForResults.edit((eb) => {
					const end = new vscode.Position(editorForResults.document.lineCount, 0)
					eb.insert(end, toAppend)
				})
			}

			const batchSize = 500
			let lastFlush = Date.now()
			const streamOpts = {
				csvColumnIndex: idx,
				onParseError: (message: string): void => {
					if (config.showParseErrors) deps.notifier.error(message)
				},
				...(typeof csvOptions.csvHasHeader === 'boolean' && {
					csvHasHeader: csvOptions.csvHasHeader,
				}),
			}

			for await (const s of streamCsvStrings(text, streamOpts)) {
				if (token.isCancellationRequested) return
				if (seen?.has(s)) continue
				seen?.add(s)
				pending.push(s)
				const now = Date.now()
				if (pending.length >= batchSize || now - lastFlush > 100) {
					await flush()
					lastFlush = now
				}
			}
			await flush()
		} catch (error: unknown) {
			if (error instanceof Error) {
				deps.notifier.error(localize('runtime.message.error.open-results', 'Could not open results'))
			}
		}
	}
}

// Non-streaming multi-column helper
async function handleNonStreamingMultiColumn(
	context: ExtractionContext,
	targetIndexes: readonly number[],
	token: vscode.CancellationToken,
): Promise<void> {
	const { text, csvOptions, config, deps } = context
	const shouldDedupe = config.dedupeEnabled
	const sortEnabled = config.sortEnabled
	const sortMode = config.sortMode

	for (const idx of targetIndexes) {
		if (token.isCancellationRequested) return

		const perColumnOptions = {
			onParseError: (message: string): void => {
				if (config.showParseErrors) deps.notifier.error(message)
			},
			csvColumnIndex: idx,
			...(typeof csvOptions.csvHasHeader === 'boolean' && {
				csvHasHeader: csvOptions.csvHasHeader,
			}),
		}

		const perColumn = extractStrings(text, 'csv', perColumnOptions)
		const deduped = shouldDedupe ? dedupe(perColumn) : perColumn
		const finalForColumn = sortEnabled ? sortStrings(deduped, sortMode) : deduped

		if (finalForColumn.length === 0) continue

		try {
			const doc = await vscode.workspace.openTextDocument({
				content: finalForColumn.join('\n'),
				language: 'plaintext',
			})
			await vscode.window.showTextDocument(
				doc,
				getShowDocumentOptions(config, {
					preview: false,
					preserveFocus: true,
				}),
			)
		} catch (error: unknown) {
			if (error instanceof Error) {
				deps.notifier.error(localize('runtime.message.error.open-results', 'Could not open results'))
			}
		}
	}
}

// Handle CSV single streaming extraction
async function handleCsvStreamingExtraction(
	context: ExtractionContext,
	token: vscode.CancellationToken,
): Promise<boolean> {
	const { text, csvOptions, config, deps, fileType } = context

	if (fileType !== 'csv' || !config.csvStreamingEnabled) {
		return false // Not streaming CSV
	}

	try {
		const doc = await vscode.workspace.openTextDocument({
			content: '',
			language: 'plaintext',
		})
		const editorForResults = await vscode.window.showTextDocument(
			doc,
			getShowDocumentOptions(config, {
				preview: false,
			}),
		)
		const seen = config.dedupeEnabled ? new Set<string>() : undefined
		let pending: string[] = []

		const flush = async (): Promise<void> => {
			if (pending.length === 0) return
			const toAppend = `${pending.join('\n')}\n`
			pending = []
			await editorForResults.edit((eb) => {
				const end = new vscode.Position(editorForResults.document.lineCount, 0)
				eb.insert(end, toAppend)
			})
		}

		const batchSize = 500
		let lastFlush = Date.now()
		const singleStreamOpts = {
			onParseError: (message: string): void => {
				if (config.showParseErrors) deps.notifier.error(message)
			},
			...(typeof csvOptions.csvHasHeader === 'boolean' && {
				csvHasHeader: csvOptions.csvHasHeader,
			}),
			...(typeof csvOptions.csvColumnIndex === 'number' && {
				csvColumnIndex: csvOptions.csvColumnIndex,
			}),
		}

		for await (const s of streamCsvStrings(text, singleStreamOpts)) {
			if (token.isCancellationRequested) return true
			if (seen?.has(s)) continue
			seen?.add(s)
			pending.push(s)
			const now = Date.now()
			if (pending.length >= batchSize || now - lastFlush > 100) {
				await flush()
				lastFlush = now
			}
		}
		await flush()

		deps.telemetry.event('extracted', { count: 'stream', type: 'csv' })
		deps.statusBar.flash(localize('runtime.status.csv-opened', 'CSV opened (no auto‑copy)'))
		deps.notifier.showCsvNoCopy()
		return true // Handled
	} catch (error: unknown) {
		if (error instanceof Error) {
			deps.notifier.error(localize('runtime.message.error.open-results', 'Could not open results'))
		}
		return true // Handled (with error)
	}
}

// Handle normal (non-CSV or non-streaming) extraction
async function handleNormalExtraction(context: ExtractionContext, token: vscode.CancellationToken): Promise<void> {
	const { text, fileType, csvOptions, config, deps } = context

	const extractedStrings = extractStrings(text, fileType, {
		...csvOptions,
		onParseError: (message): void => {
			if (config.showParseErrors) deps.notifier.error(message)
		},
	})

	const shouldDedupe = config.dedupeEnabled
	const sortEnabled = config.sortEnabled
	const sortMode = config.sortMode

	if (token.isCancellationRequested) return
	const dedupedStrings = shouldDedupe ? dedupe(extractedStrings) : extractedStrings
	const finalStrings = sortEnabled ? sortStrings(dedupedStrings, sortMode) : dedupedStrings

	if (finalStrings.length === 0) {
		deps.notifier.info(localize('runtime.message.info.no-strings', 'No strings found'))
		return
	}

	// Check for multiline strings and notify if found
	const multilineCount = countMultilineStrings(finalStrings)
	if (multilineCount > 0) {
		deps.notifier.showMultilineRisk(multilineCount)
	}

	// Show post-processing info if dedupe or sort was applied
	if (shouldDedupe || sortEnabled) {
		deps.notifier.showPostProcessInfo()
		deps.statusBar.flash(localize('runtime.status.postprocess', 'Dedupe/Sort applied'))
	}

	await processAndOutputResults(finalStrings, context, token)
}

// Handle final output processing
async function processAndOutputResults(
	finalStrings: readonly string[],
	context: ExtractionContext,
	token: vscode.CancellationToken,
): Promise<void> {
	const { config, deps, fileType } = context

	// For very large outputs, offer Open/Copy/Cancel to avoid UI lockups
	let openDoc = true
	if (config.safetyEnabled && finalStrings.length > config.largeOutputLinesThreshold) {
		const hasMultiline = countMultilineStrings(finalStrings) > 0
		const hasPostProcess = config.dedupeEnabled || config.sortEnabled
		const hasContextualNotes = hasMultiline || fileType === 'csv' || hasPostProcess

		const action = await chooseLargeOutputAction(finalStrings.length, hasContextualNotes)
		if (action === 'cancel') return
		if (action === 'copy') openDoc = false
	}

	if (token.isCancellationRequested) return

	if (openDoc) {
		try {
			const resultDocument = await vscode.workspace.openTextDocument({
				content: finalStrings.join('\n'),
				language: 'plaintext',
			})
			await vscode.window.showTextDocument(resultDocument, getShowDocumentOptions(config))
		} catch (error: unknown) {
			if (error instanceof Error) {
				deps.notifier.error(localize('runtime.message.error.open-results', 'Could not open results'))
			}
		}
	}

	// Optionally copy results to clipboard based on user setting (disabled for CSV)
	if (token.isCancellationRequested) return
	let clipboardSuccess = false
	if (config.copyToClipboardEnabled && fileType !== 'csv') {
		try {
			await vscode.env.clipboard.writeText(finalStrings.join('\n'))
			clipboardSuccess = true
		} catch {
			deps.notifier.warn(localize('runtime.message.warn.clipboard-failed', 'Could not copy to clipboard'))
		}
	}

	deps.telemetry.event('extracted', {
		count: String(finalStrings.length),
		type: fileType,
	})

	// Choose appropriate status message
	if (clipboardSuccess) {
		deps.statusBar.flash(localize('runtime.status.copied', 'Copied to clipboard'))
	} else {
		deps.statusBar.flash(localize('runtime.status.extracted', 'Extracted {0}', finalStrings.length))
	}
}

export function registerExtractStringsCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry
		notifier: Notifier
		statusBar: StatusBar
	}>,
): void {
	const { telemetry, notifier, statusBar } = deps

	const disposable = vscode.commands.registerCommand('string-le.extractStrings', async (): Promise<void> => {
		telemetry.event('command', { name: 'extractStrings' })

		// Step 1: Validate and prepare
		const prepared = await validateAndPrepareExtraction({
			telemetry,
			notifier,
			statusBar,
		})
		if (!prepared) return

		const { document, text, fileType } = prepared
		const csvOptions = await promptCsvOptionsIfNeeded(fileType, text)

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: localize('runtime.progress.extract.title', 'Extracting...'),
				cancellable: true,
			},
			async (_progress, token): Promise<void> => {
				if (token.isCancellationRequested) return

				// Read config once for consistency
				const config = readConfig()

				// Warn for large files
				try {
					const stat = await vscode.workspace.fs.stat(document.uri)
					if (config.safetyEnabled && stat.size > config.fileSizeWarnBytes) {
						notifier.warn(
							localize(
								'runtime.message.warn.large-file',
								'Large file detected ({0} bytes). Extraction may take longer.',
								config.fileSizeWarnBytes,
							),
						)
					}
				} catch {
					// ignore
				}

				if (token.isCancellationRequested) return

				// Create extraction context
				const context: ExtractionContext = {
					document,
					text,
					fileType,
					csvOptions,
					config,
					deps: { telemetry, notifier, statusBar },
				}

				// Step 3: Route to appropriate handler
				if (await handleCsvMultiColumnExtraction(context, token)) return
				if (await handleCsvStreamingExtraction(context, token)) return
				await handleNormalExtraction(context, token)
			},
		)
	})

	context.subscriptions.push(disposable)
}
