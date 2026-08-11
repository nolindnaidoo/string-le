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
}

function checkDocuments(): void {
	const corpus = readCorpus('extraction.json') as {
		documents: readonly DocumentCase[];
	};
	if (corpus.documents.length === 0) fail('the corpus has no documents');

	for (const testCase of corpus.documents) {
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
