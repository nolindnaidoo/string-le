import * as vscode from 'vscode';
import { extractStrings } from '../extraction/extract';
import { readCsvHeader, streamCsvStrings } from '../extraction/formats/csv';
import { confirmManyDocuments } from '../ui/largeOutput';
import { dedupe, sortStrings } from '../utils/text';
import { type ExtractionContext, getShowDocumentOptions } from './extract';

/**
 * CSV extraction: multi-column selection and the streaming path.
 *
 * Lifted out of extract.ts, which held orchestration, CSV handling, the normal
 * extraction path and output routing in one 618-line file. CSV has its own
 * prompts, streaming reader and error reporting, so it is the natural seam.
 */

export async function handleCsvMultiColumnExtraction(
	context: ExtractionContext,
	token: vscode.CancellationToken,
): Promise<boolean> {
	const { text, csvOptions, config, deps } = context;

	if (
		!csvOptions.selectAllColumns &&
		(!csvOptions.csvColumnIndexes || csvOptions.csvColumnIndexes.length <= 1)
	) {
		return false; // Not multi-column
	}

	// Determine target column indexes
	const columnCount = readCsvHeader(text).length;
	const targetIndexes: readonly number[] = csvOptions.selectAllColumns
		? Array.from({ length: columnCount }, (_, i) => i)
		: (csvOptions.csvColumnIndexes ?? []);

	// Estimate total output lines for safety warning
	const totalLinesInDoc = text.split(/\r?\n/).length;
	const rowsEstimate = Math.max(
		totalLinesInDoc - (csvOptions.csvHasHeader ? 1 : 0),
		0,
	);
	const estimatedTotal = rowsEstimate * targetIndexes.length;

	if (
		config.safetyEnabled &&
		(targetIndexes.length >= config.manyDocumentsThreshold ||
			estimatedTotal > config.largeOutputLinesThreshold)
	) {
		const ok = await confirmManyDocuments(targetIndexes.length, estimatedTotal);
		if (!ok) return true; // Handled (cancelled)
	}

	const streamingEnabled = config.csvStreamingEnabled;

	const handleMultiColumn = streamingEnabled
		? handleStreamingMultiColumn
		: handleNonStreamingMultiColumn;
	await handleMultiColumn(context, targetIndexes, token);

	deps.telemetry.event('extracted', { count: 'multi', type: 'csv' });
	deps.statusBar.flash('CSV opened (no auto‑copy)');
	deps.notifier.showCsvNoCopy();
	return true; // Handled
}

// Streaming multi-column helper

/**
 * Stream one CSV column into its own results document.
 *
 * Extracted from the per-column loop: inline, the batching decision sat five
 * levels deep inside function -> try -> for -> try -> for.
 */
async function streamColumnToDocument(
	idx: number,
	context: ExtractionContext,
	token: vscode.CancellationToken,
	activeStreams: AsyncGenerator<string, void, unknown>[],
): Promise<void> {
	const { text, csvOptions, config, deps } = context;
	try {
		const doc = await vscode.workspace.openTextDocument({
			content: '',
			language: 'plaintext',
		});
		const editorForResults = await vscode.window.showTextDocument(
			doc,
			getShowDocumentOptions(config, {
				preview: false,
				preserveFocus: true,
			}),
		);

		// Warn user that deduplication is disabled for streaming to prevent memory issues
		if (config.dedupeEnabled) {
			deps.notifier.warn(
				'Deduplication disabled for streaming CSV to prevent memory issues. Disable streaming mode for full deduplication.',
			);
		}

		let pending: string[] = [];

		const flush = async (): Promise<void> => {
			if (pending.length === 0) return;
			if (token.isCancellationRequested) {
				pending = []; // Clear pending to free memory
				return;
			}

			const toAppend = `${pending.join('\n')}\n`;
			pending = [];

			if (token.isCancellationRequested) return;

			await editorForResults.edit((eb) => {
				const end = new vscode.Position(editorForResults.document.lineCount, 0);
				eb.insert(end, toAppend);
			});
		};

		const batchSize = 500;
		let lastFlush = Date.now();
		const streamOpts = {
			csvColumnIndex: idx,
			onParseError: (message: string): void => {
				if (config.showParseErrors) deps.notifier.error(message);
			},
			...(typeof csvOptions.csvHasHeader === 'boolean' && {
				csvHasHeader: csvOptions.csvHasHeader,
			}),
		};

		const stream = streamCsvStrings(text, streamOpts);
		activeStreams.push(stream);

		for await (const s of stream) {
			if (token.isCancellationRequested) break;
			pending.push(s);
			const now = Date.now();
			const dueToFlush = pending.length >= batchSize || now - lastFlush > 100;
			if (!dueToFlush) continue;
			if (token.isCancellationRequested) break;
			await flush();
			lastFlush = now;
		}
		if (!token.isCancellationRequested) {
			await flush();
		}
	} catch (error: unknown) {
		if (error instanceof Error) {
			deps.notifier.error(`Column ${idx} streaming failed: ${error.message}`);
		}
		// Continue with next column
	}
}

async function handleStreamingMultiColumn(
	context: ExtractionContext,
	targetIndexes: readonly number[],
	token: vscode.CancellationToken,
): Promise<void> {
	const activeStreams: AsyncGenerator<string, void, unknown>[] = [];

	try {
		for (const idx of targetIndexes) {
			if (token.isCancellationRequested) break;

			await streamColumnToDocument(idx, context, token, activeStreams);
		}
	} finally {
		// Clean up all active streams
		for (const stream of activeStreams) {
			try {
				await stream.return?.();
			} catch {
				// Ignore cleanup errors
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
	const { text, csvOptions, config, deps } = context;
	const shouldDedupe = config.dedupeEnabled;
	const sortEnabled = config.sortEnabled;
	const sortMode = config.sortMode;

	for (const idx of targetIndexes) {
		if (token.isCancellationRequested) return;

		const perColumnOptions = {
			onParseError: (message: string): void => {
				if (config.showParseErrors) deps.notifier.error(message);
			},
			csvColumnIndex: idx,
			...(typeof csvOptions.csvHasHeader === 'boolean' && {
				csvHasHeader: csvOptions.csvHasHeader,
			}),
		};

		const perColumn = extractStrings(text, 'csv', perColumnOptions);
		const deduped = shouldDedupe ? dedupe(perColumn) : perColumn;
		const finalForColumn = sortEnabled
			? sortStrings(deduped, sortMode)
			: deduped;

		if (finalForColumn.length === 0) continue;

		try {
			const doc = await vscode.workspace.openTextDocument({
				content: finalForColumn.join('\n'),
				language: 'plaintext',
			});
			await vscode.window.showTextDocument(
				doc,
				getShowDocumentOptions(config, {
					preview: false,
					preserveFocus: true,
				}),
			);
		} catch (error: unknown) {
			if (error instanceof Error) {
				deps.notifier.error(vscode.l10n.t('Could not open results'));
			}
		}
	}
}

// Handle CSV single streaming extraction
export async function handleCsvStreamingExtraction(
	context: ExtractionContext,
	token: vscode.CancellationToken,
): Promise<boolean> {
	const { text, csvOptions, config, deps, fileType } = context;

	if (fileType !== 'csv' || !config.csvStreamingEnabled) {
		return false; // Not streaming CSV
	}

	let stream: AsyncGenerator<string, void, unknown> | undefined;

	try {
		const doc = await vscode.workspace.openTextDocument({
			content: '',
			language: 'plaintext',
		});
		const editorForResults = await vscode.window.showTextDocument(
			doc,
			getShowDocumentOptions(config, {
				preview: false,
			}),
		);

		// Warn user that deduplication is disabled for streaming to prevent memory issues
		if (config.dedupeEnabled) {
			deps.notifier.warn(
				'Deduplication disabled for streaming CSV to prevent memory issues. Disable streaming mode for full deduplication.',
			);
		}

		let pending: string[] = [];

		const flush = async (): Promise<void> => {
			if (pending.length === 0) return;
			if (token.isCancellationRequested) {
				pending = []; // Clear pending to free memory
				return;
			}

			const toAppend = `${pending.join('\n')}\n`;
			pending = [];

			if (token.isCancellationRequested) return;

			await editorForResults.edit((eb) => {
				const end = new vscode.Position(editorForResults.document.lineCount, 0);
				eb.insert(end, toAppend);
			});
		};

		const batchSize = 500;
		let lastFlush = Date.now();
		const singleStreamOpts = {
			onParseError: (message: string): void => {
				if (config.showParseErrors) deps.notifier.error(message);
			},
			...(typeof csvOptions.csvHasHeader === 'boolean' && {
				csvHasHeader: csvOptions.csvHasHeader,
			}),
			...(typeof csvOptions.csvColumnIndex === 'number' && {
				csvColumnIndex: csvOptions.csvColumnIndex,
			}),
		};

		stream = streamCsvStrings(text, singleStreamOpts);

		for await (const s of stream) {
			if (token.isCancellationRequested) break;
			pending.push(s);
			const now = Date.now();
			if (pending.length >= batchSize || now - lastFlush > 100) {
				if (token.isCancellationRequested) break;
				await flush();
				lastFlush = now;
			}
		}
		if (!token.isCancellationRequested) {
			await flush();
		}

		deps.telemetry.event('extracted', { count: 'stream', type: 'csv' });
		deps.statusBar.flash('CSV opened (no auto‑copy)');
		deps.notifier.showCsvNoCopy();
		return true; // Handled
	} catch (error: unknown) {
		if (error instanceof Error) {
			deps.notifier.error(
				vscode.l10n.t('CSV streaming failed: {0}', error.message),
			);
			return true; // Handled (with error)
		}
		deps.notifier.error(
			vscode.l10n.t('CSV streaming failed with unknown error'),
		);
		return true; // Handled (with error)
	} finally {
		// Clean up stream
		if (stream) {
			try {
				await stream.return?.();
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}

// Handle normal (non-CSV or non-streaming) extraction
