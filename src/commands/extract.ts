import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import { normalizeFileType, type SupportedFileType } from '../config/fileTypes';
import { extractStrings } from '../extraction/extract';
import type { Telemetry } from '../telemetry/telemetry';
import { chooseLargeOutputAction } from '../ui/largeOutput';
import type { Notifier } from '../ui/notifier';
import {
	type CsvPromptOptions,
	promptCsvOptionsIfNeeded,
	promptForFileType,
} from '../ui/prompts';
import type { StatusBar } from '../ui/statusBar';
import { detectEnvExtension } from '../utils/filename';
import { dedupe, sortStrings } from '../utils/text';
import {
	handleCsvMultiColumnExtraction,
	handleCsvStreamingExtraction,
} from './extractCsv';

// Helper to detect multiline strings in results
function countMultilineStrings(strings: readonly string[]): number {
	return strings.filter((s) => s.includes('\n') || s.includes('\r')).length;
}

// Helper function to build TextDocumentShowOptions based on config
export function getShowDocumentOptions(
	config: ReturnType<typeof readConfig>,
	baseOptions: Partial<vscode.TextDocumentShowOptions> = {},
): vscode.TextDocumentShowOptions {
	const options: vscode.TextDocumentShowOptions = { ...baseOptions };
	if (config.openResultsSideBySide) {
		options.viewColumn = vscode.ViewColumn.Beside;
	}
	return options;
}

// Helper type for extraction context
export type ExtractionContext = Readonly<{
	document: vscode.TextDocument;
	text: string;
	fileType: SupportedFileType;
	csvOptions: CsvPromptOptions;
	config: ReturnType<typeof readConfig>;
	deps: {
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	};
}>;

// Initial validation and setup
async function validateAndPrepareExtraction(
	deps: ExtractionContext['deps'],
): Promise<Pick<ExtractionContext, 'document' | 'text' | 'fileType'> | null> {
	// Get active editor - no polling, fail fast if not available
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		deps.notifier.error(vscode.l10n.t('No active editor'));
		return null;
	}

	// Capture document immediately to avoid TOCTOU issues
	const document = editor.document;

	// Validate document is still accessible
	try {
		const text = document.getText();
		if (text.trim().length === 0) {
			deps.notifier.info(vscode.l10n.t('File is empty'));
			return null;
		}

		// Infer file type from the language id first (works for untitled
		// documents and matches the menu when-clause), then the filename
		// (.env variants), then prompt.
		const languageId =
			document.languageId === 'dotenv' ? 'env' : document.languageId;
		let fileType: SupportedFileType | undefined =
			normalizeFileType(languageId) ??
			normalizeFileType(detectEnvExtension(document.fileName));
		if (!fileType) {
			const chosen = await promptForFileType();
			if (!chosen) return null;
			fileType = chosen;
		}

		return { document, text, fileType };
	} catch (_error) {
		// Document became invalid during access
		deps.notifier.error(vscode.l10n.t('Document is no longer valid'));
		return null;
	}
}

// Handle CSV multi-column fan-out extraction
async function handleNormalExtraction(
	context: ExtractionContext,
	token: vscode.CancellationToken,
): Promise<void> {
	const { text, fileType, csvOptions, config, deps } = context;

	const extractedStrings = extractStrings(text, fileType, {
		...csvOptions,
		onParseError: (message): void => {
			if (config.showParseErrors) deps.notifier.error(message);
		},
	});

	const shouldDedupe = config.dedupeEnabled;
	const sortEnabled = config.sortEnabled;
	const sortMode = config.sortMode;

	if (token.isCancellationRequested) return;
	const dedupedStrings = shouldDedupe
		? dedupe(extractedStrings)
		: extractedStrings;
	const finalStrings = sortEnabled
		? sortStrings(dedupedStrings, sortMode)
		: dedupedStrings;

	if (finalStrings.length === 0) {
		deps.notifier.info(vscode.l10n.t('No strings found'));
		return;
	}

	// Check for multiline strings and notify if found
	const multilineCount = countMultilineStrings(finalStrings);
	if (multilineCount > 0) {
		deps.notifier.showMultilineRisk(multilineCount);
	}

	// Show post-processing info if dedupe or sort was applied
	if (shouldDedupe || sortEnabled) {
		deps.notifier.showPostProcessInfo();
		deps.statusBar.flash('Dedupe/Sort applied');
	}

	await processAndOutputResults(finalStrings, context, token);
}

// Handle final output processing
async function processAndOutputResults(
	finalStrings: readonly string[],
	context: ExtractionContext,
	token: vscode.CancellationToken,
): Promise<void> {
	const { config, deps, fileType } = context;

	// For very large outputs, offer Open/Copy/Cancel to avoid UI lockups
	let openDoc = true;
	let copyRequested = false;
	if (
		config.safetyEnabled &&
		finalStrings.length > config.largeOutputLinesThreshold
	) {
		const hasMultiline = countMultilineStrings(finalStrings) > 0;
		const hasPostProcess = config.dedupeEnabled || config.sortEnabled;
		const hasContextualNotes =
			hasMultiline || fileType === 'csv' || hasPostProcess;

		const action = await chooseLargeOutputAction(
			finalStrings.length,
			hasContextualNotes,
		);
		if (action === 'cancel') return;
		// "Copy only" is an explicit instruction, so it copies even when the
		// automatic copy setting is off. Without this the choice delivered
		// nothing at all — no document, no clipboard — and still reported a
		// count.
		if (action === 'copy') {
			openDoc = false;
			copyRequested = true;
		}
	}

	if (token.isCancellationRequested) return;

	if (openDoc) {
		try {
			const resultDocument = await vscode.workspace.openTextDocument({
				content: finalStrings.join('\n'),
				language: 'plaintext',
			});
			await vscode.window.showTextDocument(
				resultDocument,
				getShowDocumentOptions(config),
			);
		} catch (error: unknown) {
			if (error instanceof Error) {
				deps.notifier.error(vscode.l10n.t('Could not open results'));
			}
		}
	}

	// Optionally copy results to clipboard based on user setting (disabled for CSV)
	if (token.isCancellationRequested) return;
	let clipboardSuccess = false;
	if (copyRequested || (config.copyToClipboardEnabled && fileType !== 'csv')) {
		try {
			await vscode.env.clipboard.writeText(finalStrings.join('\n'));
			clipboardSuccess = true;
		} catch {
			deps.notifier.warn(vscode.l10n.t('Could not copy to clipboard'));
		}
	}

	// Nothing opened and nothing copied means the results never reached the
	// user; a clipboard failure has already been reported as a warning.
	if (!openDoc && !clipboardSuccess) {
		return;
	}

	deps.telemetry.event('extracted', {
		count: String(finalStrings.length),
		type: fileType,
	});

	deps.statusBar.flash(
		clipboardSuccess
			? 'Copied to clipboard'
			: `Extracted ${finalStrings.length}`,
	);
}

export function registerExtractStringsCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	}>,
): void {
	const { telemetry, notifier, statusBar } = deps;

	const disposable = vscode.commands.registerCommand(
		'string-le.extractStrings',
		async (): Promise<void> => {
			telemetry.event('command', { name: 'extractStrings' });

			// Step 1: Validate and prepare
			const prepared = await validateAndPrepareExtraction({
				telemetry,
				notifier,
				statusBar,
			});
			if (!prepared) return;

			const { document, text, fileType } = prepared;
			const csvOptions = await promptCsvOptionsIfNeeded(fileType, text);

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: vscode.l10n.t('Extracting...'),
					cancellable: true,
				},
				async (_progress, token): Promise<void> => {
					if (token.isCancellationRequested) return;

					// Read config once for consistency
					const config = readConfig();

					// Warn for large files
					try {
						const stat = await vscode.workspace.fs.stat(document.uri);
						if (config.safetyEnabled && stat.size > config.fileSizeWarnBytes) {
							notifier.warn(
								`Large file detected (${config.fileSizeWarnBytes} bytes). Extraction may take longer.`,
							);
						}
					} catch {
						// ignore
					}

					if (token.isCancellationRequested) return;

					// Create extraction context
					const context: ExtractionContext = {
						document,
						text,
						fileType,
						csvOptions,
						config,
						deps: { telemetry, notifier, statusBar },
					};

					// Step 3: Route to appropriate handler
					if (await handleCsvMultiColumnExtraction(context, token)) return;
					if (await handleCsvStreamingExtraction(context, token)) return;
					await handleNormalExtraction(context, token);
				},
			);
		},
	);

	context.subscriptions.push(disposable);
}
