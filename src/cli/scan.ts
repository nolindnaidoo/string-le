/**
 * One file end to end, as the Rust CLI's `scan.rs` does it, over the same
 * extraction engine the extension and the MCP server run.
 *
 * The report's shape and field order are the crate's, because stdout is
 * protocol: a script reading JSON Lines from `string-le` cannot know which of
 * the two binaries it is talking to.
 */
import { readFileSync } from 'node:fs';
import { basename, sep } from 'node:path';
import { extractStrings } from '../extraction/extract';
import { resolveFormat } from '../mcp/fileType';
import { decodeUtf8OrThrow, rustIoMessage, withoutBom } from './ioError';
import { jsonSpans, type Located, locate, positionIndex } from './locate';

export interface ReportDiagnostic {
	readonly severity: 'warning' | 'error';
	readonly code: string;
	readonly message: string;
}

/** `line` and `column` are absent, not zero, when the source never spells the value. */
export interface FoundString {
	readonly value: string;
	readonly line?: number;
	readonly column?: number;
}

export interface FileReport {
	readonly file: string;
	readonly format: string;
	readonly strings: readonly FoundString[];
	readonly diagnostics: readonly ReportDiagnostic[];
	readonly summary: {
		readonly strings: number;
		readonly unlocated: number;
	};
}

export interface ExtractOptions {
	readonly csvHasHeader: boolean;
	readonly csvColumn: number | null;
	readonly multiline: boolean;
}

export interface ScanOptions {
	readonly dedupe: boolean;
	readonly extract: ExtractOptions;
	readonly format: string | null;
}

export const DEFAULT_SCAN: ScanOptions = Object.freeze({
	dedupe: false,
	extract: Object.freeze({
		csvHasHeader: false,
		csvColumn: null,
		multiline: false,
	}),
	format: null,
});

export type Examined =
	| { readonly kind: 'text'; readonly report: FileReport }
	| { readonly kind: 'binary' };

const BINARY_WINDOW = 8 * 1024;

export function scanFile(path: string, options: ScanOptions): Examined {
	const file = reportedPath(path);
	const format = options.format ?? resolveFormat(undefined, basename(path));

	let bytes: Buffer;
	try {
		bytes = readFileSync(path);
	} catch (error) {
		return text(skipped(file, format, rustIoMessage(error)));
	}
	if (looksBinary(bytes)) return { kind: 'binary' };

	const content = decodeUtf8(bytes);
	if (content === null) return text(skipped(file, format, 'not UTF-8 text'));
	return text(scanContent(withoutBom(content), file, format, options));
}

export function scanContent(
	content: string,
	file: string,
	format: string,
	options: ScanOptions,
): FileReport {
	const { found, parseError } = examine(content, format, options.extract);
	const kept = options.dedupe ? firstOfEachValue(found) : found;
	// A parse failure is a fact about the file, not a failed run: one
	// malformed config must not fail an audit of ten thousand files.
	const diagnostics: ReportDiagnostic[] =
		parseError === null
			? []
			: [{ severity: 'warning', code: 'unparsed', message: parseError }];

	return Object.freeze({
		file,
		format,
		strings: Object.freeze(kept.map(asFound)),
		diagnostics: Object.freeze(diagnostics),
		summary: Object.freeze({
			strings: kept.length,
			unlocated: kept.filter((item) => item.position === null).length,
		}),
	});
}

/** grep's convention: 0 found · 1 none found · 2 could not answer. */
export function exitCode(
	reports: readonly FileReport[],
	strict: boolean,
): number {
	if (reports.some(isIncomplete)) return 2;
	if (strict && reports.some(wasSkipped)) return 2;
	return reports.some((report) => report.summary.strings > 0) ? 0 : 1;
}

export function describe(report: FileReport, found: FoundString): string {
	if (found.line === undefined) return `${report.file}:-  ${found.value}`;
	return `${report.file}:${found.line}:${found.column}  ${found.value}`;
}

/**
 * One pass, as the crate's `examine`: JSON is placed by its own spans, every
 * other format by the forward cursor over the values the engine returned.
 */
function examine(
	content: string,
	format: string,
	options: ExtractOptions,
): { found: Located[]; parseError: string | null } {
	const trimmed = content.trim();
	if (trimmed.length === 0) return { found: [], parseError: null };

	let parseError: string | null = null;
	const values = extractStrings(content, format, {
		csvHasHeader: options.csvHasHeader,
		...(options.csvColumn === null
			? {}
			: { csvColumnIndex: options.csvColumn }),
		multiline: options.multiline,
		onParseError: (message) => {
			parseError ??= message;
		},
	});

	if (format !== 'json' && format !== 'jsonc') {
		return { found: locate(content, values), parseError };
	}
	const lead = content.length - content.trimStart().length;
	const at = positionIndex(content);
	const found = jsonSpans(trimmed, format === 'jsonc').map((span) => ({
		value: span.value,
		position: at(span.offset + lead),
	}));
	return { found, parseError };
}

function asFound(item: Located): FoundString {
	if (item.position === null) return { value: item.value };
	return {
		value: item.value,
		line: item.position.line,
		column: item.position.column,
	};
}

/** The first occurrence keeps its own position. */
function firstOfEachValue(found: readonly Located[]): Located[] {
	const seen = new Set<string>();
	return found.filter((item) => {
		if (seen.has(item.value)) return false;
		seen.add(item.value);
		return true;
	});
}

function isIncomplete(report: FileReport): boolean {
	return report.diagnostics.some(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

function wasSkipped(report: FileReport): boolean {
	return report.diagnostics.some((diagnostic) => diagnostic.code === 'skipped');
}

function text(report: FileReport): Examined {
	return { kind: 'text', report };
}

function skipped(file: string, format: string, reason: string): FileReport {
	return Object.freeze({
		file,
		format,
		strings: Object.freeze([]),
		diagnostics: Object.freeze([
			{ severity: 'warning' as const, code: 'skipped', message: reason },
		]),
		summary: Object.freeze({ strings: 0, unlocated: 0 }),
	});
}

/** ripgrep's rule, as the crate uses it: a NUL byte in the first 8 KB. */
function looksBinary(bytes: Buffer): boolean {
	return bytes.subarray(0, BINARY_WINDOW).includes(0);
}

function decodeUtf8(bytes: Buffer): string | null {
	try {
		return decodeUtf8OrThrow(bytes);
	} catch {
		// Invalid UTF-8 is the answer, reported by the caller as a skip.
		return null;
	}
}

/** Separators are always `/` in a report, and only where `\` is the separator. */
function reportedPath(path: string): string {
	if (sep !== '\\') return path;
	return path.replaceAll('\\', '/');
}
