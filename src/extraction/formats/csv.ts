import { csvRows, trimAroundQuotes } from '../../parsers/csv';
import type { Extractor, ExtractorOptions } from '../../types';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

export const extractCsv: Extractor = (text, options) =>
	extractDelimited(text, ',', options);

export const extractTsv: Extractor = (text, options) =>
	extractDelimited(text, '\t', options);

/**
 * The crate's `csv.rs`: for a comma, the blanks around quoted fields trimmed
 * first, then the csv crate's records, flexible and headerless. A quoted
 * field that never closes refuses the document.
 */
function parseCsvRows(
	text: string,
	delimiter: string,
): ReadonlyArray<ReadonlyArray<string>> | string {
	if (delimiter !== ',') return csvRows(text, delimiter);
	const trimmed = trimAroundQuotes(text);
	if (trimmed === undefined) return 'Invalid CSV: quoted field is never closed';
	return csvRows(trimmed, delimiter);
}

function extractDelimited(
	text: string,
	delimiter: string,
	options?: ExtractorOptions,
): readonly string[] {
	const rows = parseCsvRows(text, delimiter);
	if (typeof rows === 'string') {
		options?.onParseError?.(rows);
		return EMPTY_RESULT;
	}
	const hasHeader = Boolean(options?.csvHasHeader);
	const columnIndex = options?.csvColumnIndex;
	return Object.freeze(extractFromRows(rows, hasHeader, columnIndex));
}

/** The first record's cells, for the column picker; empty when none parse. */
export function readCsvHeader(text: string): readonly string[] {
	if (text.trim().length === 0) return EMPTY_RESULT;
	const rows = parseCsvRows(text, ',');
	if (typeof rows === 'string') return EMPTY_RESULT;
	return Object.freeze([...(rows[0] ?? [])]);
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
/**
 * The same strings as `extractCsv`, handed out one at a time so the editor
 * can show them as they come. The document is read the same way.
 */
export async function* streamCsvStrings(
	text: string,
	options?: ExtractorOptions,
): AsyncGenerator<string, void, unknown> {
	yield* extractCsv(text, options);
}
