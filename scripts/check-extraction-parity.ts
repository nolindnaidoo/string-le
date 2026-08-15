/**
 * Fails when the extension's string extraction drifts from the shared
 * corpus, which the Rust CLI (crate/) also builds against.
 *
 * - extraction.json `documents`: every value each extractor finds in a
 *   corpus document, in document order, for every format and for the
 *   CSV options that change what is read.
 * - mcp-extract-strings.json: the `extract_strings` tool, which BOTH MCP
 *   servers offer and must answer identically — values only, no
 *   positions, as its own description promises.
 *
 * This checks only the extension's side. `cargo test` runs the crate's
 * implementation over the same files.
 *
 * Positions are deliberately absent from the corpus. The extension does
 * not produce them and has nothing to disagree with; see crate/SPEC.md,
 * "Positions — the addition".
 *
 * Run: bun scripts/check-extraction-parity.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractStrings } from '../src/extraction/extract';
import { resolveFormat, SUPPORTED_FORMATS } from '../src/mcp/fileType';
import { TOOLS } from '../src/mcp/tools';

const ROOT = join(import.meta.dir, '..');
/** The corpus lives inside the crate so the published package is self-contained. */
const CORPUS = join(ROOT, 'crate', 'fixtures');
const failures: string[] = [];

function fail(message: string): void {
	failures.push(message);
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((item, i) => deepEqual(item, b[i]));
	}
	if (typeof a !== 'object' || typeof b !== 'object') return false;
	if (a === null || b === null) return false;
	const keysA = Object.keys(a).sort();
	const keysB = Object.keys(b).sort();
	if (!deepEqual(keysA, keysB)) return false;
	return keysA.every((key) =>
		deepEqual(
			(a as Record<string, unknown>)[key],
			(b as Record<string, unknown>)[key],
		),
	);
}

function readCorpus(name: string): unknown {
	return JSON.parse(readFileSync(join(CORPUS, name), 'utf8'));
}

function readDocument(name: string): string {
	return readFileSync(join(CORPUS, 'documents', name), 'utf8');
}

interface DocumentCase {
	readonly name: string;
	readonly file: string;
	readonly fileType: string;
	readonly options: Record<string, unknown>;
	readonly expected: readonly string[];
	/**
	 * A format the crate reads and this extension does not.
	 *
	 * **What the two frontends owe each other is the shared `extract_strings`
	 * tool's answer, not the same list of readers.** The crate is the
	 * terminal-first surface and is free to read a format the editor has no
	 * language id for; holding it back until the extension grows one would
	 * make drift management outrank being right. The case still runs on the
	 * crate side — `cargo test` walks the whole corpus — and it is named
	 * below so a skip is never silent.
	 */
	readonly crateOnly?: boolean;
}

function checkDocuments(): void {
	const corpus = readCorpus('extraction.json') as {
		documents: readonly DocumentCase[];
	};
	if (corpus.documents.length === 0) fail('the corpus has no documents');

	const skipped: string[] = [];
	for (const testCase of corpus.documents) {
		if (testCase.crateOnly === true) {
			skipped.push(`${testCase.name} (${testCase.fileType})`);
			continue;
		}
		const actual = [
			...extractStrings(
				readDocument(testCase.file),
				testCase.fileType,
				testCase.options,
			),
		];
		if (!deepEqual(actual, testCase.expected)) {
			fail(
				`document "${testCase.name}":\n  expected: ${JSON.stringify(testCase.expected)}\n  got:      ${JSON.stringify(actual)}`,
			);
		}
	}
	if (skipped.length > 0) {
		console.log(
			`crate-only formats, checked by cargo test and not here: ${skipped.join(', ')}`,
		);
	}
}

/**
 * `extract_strings` is offered by BOTH MCP servers. They are meant to be
 * the same tool, not two similar ones, so the same corpus runs against
 * both: this function here, and `crate/src/mcp/extract.rs`'s own test
 * there.
 */
async function checkMcpExtractStrings(): Promise<void> {
	const cases = readCorpus('mcp-extract-strings.json') as ReadonlyArray<{
		name: string;
		file?: string;
		content?: string;
		arguments: Record<string, unknown>;
		expected?: unknown;
		expectedError?: string;
	}>;

	const tool = TOOLS.find((t) => t.name === 'extract_strings');
	if (!tool) {
		fail('the extension no longer offers extract_strings');
		return;
	}

	for (const testCase of cases) {
		const args: Record<string, unknown> = { ...testCase.arguments };
		if (testCase.file !== undefined) args.content = readDocument(testCase.file);
		else if (testCase.content !== undefined) args.content = testCase.content;

		if (testCase.expectedError !== undefined) {
			try {
				await tool.handler(args);
				fail(
					`mcp extract "${testCase.name}": expected it to fail with ${JSON.stringify(testCase.expectedError)}`,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (message !== testCase.expectedError) {
					fail(
						`mcp extract "${testCase.name}": expected error ${JSON.stringify(testCase.expectedError)}, got ${JSON.stringify(message)}`,
					);
				}
			}
			continue;
		}

		const actual = await tool.handler(args);
		if (!deepEqual(actual, testCase.expected)) {
			fail(
				`mcp extract "${testCase.name}":\n  expected: ${JSON.stringify(testCase.expected)}\n  got:      ${JSON.stringify(actual)}`,
			);
		}
	}
}

/**
 * The shared tool promises values and no positions, in its own
 * description. A position field appearing there would be a silent break
 * of a contract two servers hold.
 */
function checkTheSharedToolStaysPositionless(): void {
	const cases = readCorpus('mcp-extract-strings.json') as ReadonlyArray<{
		name: string;
		expected?: { data?: { strings?: readonly unknown[] } };
	}>;
	for (const testCase of cases) {
		for (const value of testCase.expected?.data?.strings ?? []) {
			if (typeof value !== 'string') {
				fail(
					`mcp extract "${testCase.name}": a value is ${typeof value}, not a bare string — extract_strings returns values, not positions`,
				);
			}
		}
	}
}

/**
 * The two alias tables are hand-kept in two languages, and a name one
 * side accepts and the other does not makes them two different tools —
 * silently, because the loser just falls back. Read the crate's table and
 * hold this side to it, name by name.
 */
function checkAliasTables(): void {
	const source = readFileSync(
		join(ROOT, 'crate', 'src', 'extract', 'format.rs'),
		'utf8',
	);

	const aliases = block(source, 'const ALIASES');
	const pairs = [...aliases.matchAll(/\("([^"]+)",\s*"([^"]+)"\)/g)];
	if (pairs.length === 0) fail('the crate alias table could not be read');

	const offered = block(source, 'const SUPPORTED_FORMATS');
	const formats = [...offered.matchAll(/"([^"]+)"/g)].map(([, name]) => name);
	const crateOnly = formats.filter((name) => !SUPPORTED_FORMATS.includes(name));

	// An alias is compared only when both frontends have the reader it
	// names. The crate is terminal-first and may read a format the editor
	// has no language id for.
	for (const [, alias, key] of pairs) {
		if (crateOnly.includes(key)) continue;
		const resolved = resolveFormat(alias, undefined);
		if (resolved !== key) {
			fail(
				`alias "${alias}": the crate resolves it to "${key}", the extension to "${resolved}"`,
			);
		}
	}

	// **The extension's readers must be a subset of the crate's, not equal
	// to it.** What the two owe each other is the shared `extract_strings`
	// tool answering the same way, and a format only one of them has is
	// not that tool disagreeing — it is one surface reading more. The
	// reverse would be a real failure: a format the editor offers and the
	// terminal cannot read is a document the CLI turns away.
	const missingFromCrate = SUPPORTED_FORMATS.filter(
		(name) => !formats.includes(name),
	);
	if (missingFromCrate.length > 0) {
		fail(
			`the extension offers formats the crate does not read: ${JSON.stringify(missingFromCrate)}`,
		);
	}
	if (crateOnly.length > 0) {
		console.log(
			`formats the crate reads and the extension does not: ${crateOnly.join(', ')}`,
		);
	}
}

/** The array literal a `const NAME: [...] = [ … ];` declares. */
function block(source: string, declaration: string): string {
	const start = source.indexOf(declaration);
	if (start === -1) return '';
	const end = source.indexOf('];', start);
	if (end === -1) return '';
	return source.slice(start, end);
}

checkAliasTables();
checkDocuments();
checkTheSharedToolStaysPositionless();
await checkMcpExtractStrings();

if (failures.length > 0) {
	console.error(`Extraction parity FAILED (${failures.length}):\n`);
	for (const failure of failures) {
		console.error(`- ${failure}\n`);
	}
	process.exit(1);
}
console.log(
	'OK: every corpus case reproduces under the extension, and both MCP servers agree.',
);
