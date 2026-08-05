import { Readable } from 'node:stream';
import { parse as parseStream } from 'csv-parse';
import { parse } from 'csv-parse/sync';
import type { Extractor, ExtractorOptions } from '../../types';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

const CSV_PARSE_OPTIONS = {
	columns: false,
	bom: true,
	skip_empty_lines: true,
	relax_quotes: true,
	relax_column_count: true,
	trim: true,
} as const;

/**
 * Extract strings from CSV with optional header detection and column selection.
 */
export const extractCsv: Extractor = (
	text,
	options?: ExtractorOptions,
): readonly string[] => {
	// Guard: Empty input
	if (text.trim().length === 0) {
		return EMPTY_RESULT;
	}

	// Every other format reports a parse failure through onParseError and
	// returns nothing; CSV alone let the parser's exception escape, so a file
	// with an unterminated quote crashed the extraction instead of reporting
	// it — and the onParseError handlers the callers pass in could never fire.
	let rows: ReadonlyArray<ReadonlyArray<string>>;
	try {
		rows = parseCsvRows(text);
	} catch (error) {
		if (error instanceof Error) {
			options?.onParseError?.(`Invalid CSV: ${error.message}`);
		}
		return EMPTY_RESULT;
	}

	const hasHeader = Boolean(options?.csvHasHeader);
	const columnIndex = options?.csvColumnIndex;

	const strings = extractFromRows(rows, hasHeader, columnIndex);
	return Object.freeze(strings);
};

function parseCsvRows(text: string): ReadonlyArray<ReadonlyArray<string>> {
	// csv-parse's sync parse is typed `any`; with `columns: false` it yields
	// rows of cells, which is what one cast states directly.
	return parse(text, CSV_PARSE_OPTIONS) as string[][];
}

/**
 * Read the first CSV record using the same parser (and options) as
 * extraction, so column pickers and fan-out counting can never disagree
 * with what extraction actually parses (quoted multi-line headers,
 * embedded commas, escaped quotes).
 */
export function readCsvHeader(text: string): readonly string[] {
	if (text.trim().length === 0) {
		return EMPTY_RESULT;
	}

	try {
		const rows = parse(text, {
			...CSV_PARSE_OPTIONS,
			to: 1,
		}) as string[][];
		return Object.freeze([...(rows[0] ?? [])]);
	} catch {
		return EMPTY_RESULT;
	}
}

function extractFromRows(
	rows: ReadonlyArray<ReadonlyArray<string>>,
	hasHeader: boolean,
	columnIndex?: number,
): string[] {
	const startRowIndex = hasHeader ? 1 : 0;

	if (columnIndex !== undefined) {
		return extractFromColumn(rows, startRowIndex, columnIndex);
	}

	return extractFromAllColumns(rows, startRowIndex);
}

function extractFromColumn(
	rows: ReadonlyArray<ReadonlyArray<string>>,
	startIndex: number,
	columnIndex: number,
): string[] {
	const results: string[] = [];

	for (let i = startIndex; i < rows.length; i++) {
		const row = rows[i] ?? [];
		const cellValue = (row[columnIndex] ?? '').trim();

		if (cellValue.length > 0) {
			results.push(cellValue);
		}
	}

	return results;
}

function extractFromAllColumns(
	rows: ReadonlyArray<ReadonlyArray<string>>,
	startIndex: number,
): string[] {
	const results: string[] = [];

	for (let i = startIndex; i < rows.length; i++) {
		const row = rows[i] ?? [];

		for (const cell of row) {
			const cellValue = (cell ?? '').trim();

			if (cellValue.length > 0) {
				results.push(cellValue);
			}
		}
	}

	return results;
}

/**
 * Stream CSV strings incrementally using async generator.
 * Useful for large files to avoid loading all data into memory.
 */
export async function* streamCsvStrings(
	text: string,
	options?: ExtractorOptions,
): AsyncGenerator<string, void, unknown> {
	// Guard: Empty input
	if (text.trim().length === 0) {
		return;
	}

	const hasHeader = Boolean(options?.csvHasHeader);
	const columnIndex = options?.csvColumnIndex;

	const parser = createCsvParser();
	const source = createTextStream(text);
	const cleanup = createCleanup(source, parser);

	setupErrorHandling(parser, cleanup, options?.onParseError);
	source.pipe(parser);

	try {
		yield* processStreamedRows(parser, hasHeader, columnIndex);
	} finally {
		cleanup();
	}
}

function createCsvParser() {
	return parseStream(CSV_PARSE_OPTIONS);
}

function createTextStream(text: string): Readable {
	const source = Readable.from([text]);
	source.setEncoding('utf8');
	return source;
}

function createCleanup(
	source: Readable,
	parser: ReturnType<typeof parseStream>,
) {
	let cleaned = false;

	return (): void => {
		if (cleaned) {
			return;
		}

		cleaned = true;

		try {
			source.unpipe(parser);
			parser.destroy();
			source.destroy();
		} catch {
			// Silently handle cleanup errors
		}
	};
}

function setupErrorHandling(
	parser: ReturnType<typeof parseStream>,
	cleanup: () => void,
	onError?: (message: string) => void,
): void {
	parser.on('error', (err) => {
		cleanup();
		if (onError) {
			onError(`CSV parse error: ${err.message}`);
		}
	});
}

async function* processStreamedRows(
	parser: ReturnType<typeof parseStream>,
	hasHeader: boolean,
	columnIndex?: number,
): AsyncGenerator<string, void, unknown> {
	let isFirstRow = true;

	for await (const row of parser as AsyncIterable<readonly string[]>) {
		// Skip header row if needed
		if (isFirstRow) {
			isFirstRow = false;
			if (hasHeader) {
				continue;
			}
		}

		// Extract from specific column
		if (columnIndex !== undefined) {
			const cellValue = (row[columnIndex] ?? '').trim();
			if (cellValue.length > 0) {
				yield cellValue;
			}
			continue;
		}

		// Extract from all columns
		for (const cell of row) {
			const cellValue = (cell ?? '').trim();
			if (cellValue.length > 0) {
				yield cellValue;
			}
		}
	}
}
