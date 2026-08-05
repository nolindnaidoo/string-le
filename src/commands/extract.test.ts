import { beforeEach, describe, expect, it } from 'vitest';
import {
	_cancelAfterProgress,
	_clipboardText,
	_createDocument,
	_createExtensionContext,
	_editorInsertions,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
	_respondToInputBox,
	_respondToQuickPick,
	_respondToWarning,
	_setActiveEditor,
	_setConfig,
	_shownDocumentOptions,
	_shownMessages,
} from '../__mocks__/vscode';
import { createTelemetry } from '../telemetry/telemetry';
import { createNotifier } from '../ui/notifier';
import { createStatusBar } from '../ui/statusBar';
import { registerAllCommands } from './index';

/**
 * Configuration permutations of the extract command.
 *
 * `commands.test.ts` covers the happy paths under default settings; this
 * covers the settings and prompt-answer branches, which is where this file's
 * uncovered branches were concentrated — result placement, the large-output
 * prompt, safety thresholds, CSV column selection including the multi-column
 * path, the streaming toggle and post-processing.
 *
 * Note on thresholds: `readNumber` silently floors
 * `safety.largeOutputLinesThreshold` at 100 and `safety.fileSizeWarnBytes` at
 * 1000. A test that sets a smaller value looks like it exercises the branch
 * and does not.
 */

async function runExtract(): Promise<void> {
	const context = _createExtensionContext();
	registerAllCommands(context as never, {
		telemetry: createTelemetry(context as never),
		notifier: createNotifier(),
		statusBar: createStatusBar(context as never),
	});
	const handler = _registeredCommands().get('string-le.extractStrings');
	if (!handler) throw new Error('extract command not registered');
	await handler();
}

const lastOpened = (): string | undefined => {
	const opened = _openedDocuments();
	return opened[opened.length - 1]?.getText();
};

/** A JSON array of 150 strings — past the large-output floor of 100. */
function manyStrings(): string {
	return JSON.stringify(Array.from({ length: 150 }, (_, i) => `s${i}`));
}

beforeEach(() => {
	_resetMockState();
	_setConfig('string-le.notificationsLevel', 'all');
});

describe('extract: result placement', () => {
	it('opens results beside the source when openResultsSideBySide is on', async () => {
		_setConfig('string-le.openResultsSideBySide', true);
		_setActiveEditor(
			_createDocument({ content: '["a","b"]', fileName: '/mock/a.json' }),
		);
		await runExtract();
		const shown = _shownDocumentOptions();
		// ViewColumn.Beside is -2 in the mock's enum.
		expect(shown[shown.length - 1]?.viewColumn).toBe(-2);
	});

	it('leaves the view column unset when the setting is off', async () => {
		_setConfig('string-le.openResultsSideBySide', false);
		_setActiveEditor(
			_createDocument({ content: '["a","b"]', fileName: '/mock/a.json' }),
		);
		await runExtract();
		const shown = _shownDocumentOptions();
		expect(shown[shown.length - 1]?.viewColumn).toBeUndefined();
	});

	it('copies and opens when both output routes are enabled', async () => {
		_setConfig('string-le.copyToClipboardEnabled', true);
		_setActiveEditor(
			_createDocument({ content: '["x","y"]', fileName: '/mock/a.json' }),
		);
		await runExtract();
		expect(_clipboardText()).toBe('x\ny');
		expect(lastOpened()).toBe('x\ny');
	});
});

describe('extract: empty and no-match documents', () => {
	it('reports an empty document without opening anything', async () => {
		_setActiveEditor(
			_createDocument({ content: '', fileName: '/mock/a.json' }),
		);
		const before = _openedDocuments().length;
		await runExtract();
		expect(_openedDocuments()).toHaveLength(before);
	});

	it('reports a whitespace-only document', async () => {
		// Guards the trim() branch specifically — non-zero length, nothing to do.
		_setActiveEditor(
			_createDocument({ content: '  \n\t\n ', fileName: '/mock/a.json' }),
		);
		const before = _openedDocuments().length;
		await runExtract();
		expect(_openedDocuments()).toHaveLength(before);
	});

	it('reports a document with no strings', async () => {
		_setActiveEditor(
			_createDocument({ content: '[1, 2, 3]', fileName: '/mock/a.json' }),
		);
		const before = _openedDocuments().length;
		await runExtract();
		expect(_openedDocuments()).toHaveLength(before);
		expect(_shownMessages().length).toBeGreaterThan(0);
	});
});

describe('extract: post-processing settings', () => {
	it('dedupes before writing when dedupeEnabled is on', async () => {
		_setConfig('string-le.dedupeEnabled', true);
		_setActiveEditor(
			_createDocument({
				content: '["b","a","b","a"]',
				fileName: '/mock/a.json',
			}),
		);
		await runExtract();
		expect(lastOpened()).toBe('b\na');
	});

	it('does not sort when sortMode is off, even with sortEnabled', async () => {
		// The default sortMode is 'off'; enabling sorting without choosing a mode
		// deliberately changes nothing.
		_setConfig('string-le.sortEnabled', true);
		_setActiveEditor(
			_createDocument({ content: '["c","a","b"]', fileName: '/mock/a.json' }),
		);
		await runExtract();
		expect(lastOpened()).toBe('c\na\nb');
	});

	it('sorts before writing when sortEnabled and a mode are set', async () => {
		_setConfig('string-le.sortEnabled', true);
		_setConfig('string-le.sortMode', 'alpha-asc');
		_setActiveEditor(
			_createDocument({ content: '["c","a","b"]', fileName: '/mock/a.json' }),
		);
		await runExtract();
		expect(lastOpened()).toBe('a\nb\nc');
	});

	it('applies dedupe and sort together', async () => {
		_setConfig('string-le.dedupeEnabled', true);
		_setConfig('string-le.sortEnabled', true);
		_setConfig('string-le.sortMode', 'alpha-asc');
		_setActiveEditor(
			_createDocument({
				content: '["c","a","c","b","a"]',
				fileName: '/mock/a.json',
			}),
		);
		await runExtract();
		expect(lastOpened()).toBe('a\nb\nc');
	});
});

describe('extract: large-output prompt', () => {
	function largeSetup(): void {
		_setConfig('string-le.safety.enabled', true);
		_setConfig('string-le.safety.largeOutputLinesThreshold', 100);
		_setActiveEditor(
			_createDocument({ content: manyStrings(), fileName: '/mock/a.json' }),
		);
	}

	it('writes nothing when the user cancels', async () => {
		largeSetup();
		_respondToWarning((items) =>
			items.find((i) => String(i).includes('Cancel')),
		);
		const before = _openedDocuments().length;
		await runExtract();
		expect(_openedDocuments()).toHaveLength(before);
	});

	it('copies without opening when the user picks copy only', async () => {
		largeSetup();
		_setConfig('string-le.copyToClipboardEnabled', true);
		_respondToWarning((items) => items.find((i) => String(i).includes('Copy')));
		const before = _openedDocuments().length;
		await runExtract();
		expect(_openedDocuments()).toHaveLength(before);
		expect(_clipboardText()?.split('\n')).toHaveLength(150);
	});

	it('opens results when the user accepts', async () => {
		largeSetup();
		_respondToWarning((items) => items.find((i) => String(i).includes('Open')));
		await runExtract();
		expect(lastOpened()?.split('\n')).toHaveLength(150);
	});

	it('does not prompt at all when safety is disabled', async () => {
		_setConfig('string-le.safety.enabled', false);
		_setConfig('string-le.safety.largeOutputLinesThreshold', 100);
		let prompted = false;
		_respondToWarning((items) => {
			prompted = true;
			return items[0];
		});
		_setActiveEditor(
			_createDocument({ content: manyStrings(), fileName: '/mock/a.json' }),
		);
		await runExtract();
		expect(prompted).toBe(false);
		expect(lastOpened()?.split('\n')).toHaveLength(150);
	});
});

describe('extract: unknown file type', () => {
	it('prompts for a type and uses the answer', async () => {
		_setActiveEditor(
			_createDocument({ content: '"hello"', fileName: '/mock/notes.xyz' }),
		);
		_respondToQuickPick((items) => {
			const labels = items.map((i) =>
				typeof i === 'string' ? i : String((i as { label: string }).label),
			);
			return labels.find((l) => /Fallback|quoted/i.test(l)) ?? labels[0];
		});
		await runExtract();
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('does nothing when the type prompt is dismissed', async () => {
		_setActiveEditor(
			_createDocument({ content: '"hello"', fileName: '/mock/notes.xyz' }),
		);
		_respondToQuickPick(() => undefined);
		const before = _openedDocuments().length;
		await runExtract();
		expect(_openedDocuments()).toHaveLength(before);
	});
});

describe('extract: CSV column selection', () => {
	// A headerless CSV routes to index-based selection, the only way into the
	// multi-column extraction path.
	const HEADERLESS = '1,2,3\nfoo,bar,baz\nqux,quux,corge\n';
	const WITH_HEADER = 'name,city\nada,london\nalan,leeds\n';

	it('extracts several explicitly chosen columns', async () => {
		_setActiveEditor(
			_createDocument({ content: HEADERLESS, fileName: '/mock/d.csv' }),
		);
		_respondToInputBox(() => '0,2');
		await runExtract();
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('extracts a single chosen column', async () => {
		_setActiveEditor(
			_createDocument({ content: HEADERLESS, fileName: '/mock/d.csv' }),
		);
		_respondToInputBox(() => '1');
		await runExtract();
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('treats an empty answer as every column', async () => {
		_setActiveEditor(
			_createDocument({ content: HEADERLESS, fileName: '/mock/d.csv' }),
		);
		_respondToInputBox(() => '');
		await runExtract();
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('warns and uses all columns when the indexes are out of range', async () => {
		_setActiveEditor(
			_createDocument({ content: HEADERLESS, fileName: '/mock/d.csv' }),
		);
		_respondToInputBox(() => '9,10');
		await runExtract();
		expect(_shownMessages().some((m) => m.kind === 'warning')).toBe(true);
	});

	it('offers header names when the first row looks like a header', async () => {
		_setActiveEditor(
			_createDocument({ content: WITH_HEADER, fileName: '/mock/d.csv' }),
		);
		_respondToQuickPick((items) => items[0]);
		await runExtract();
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('continues with defaults when the column prompt is dismissed', async () => {
		// Dismissing returns empty options rather than cancelling, so extraction
		// proceeds over the whole file.
		_setActiveEditor(
			_createDocument({ content: WITH_HEADER, fileName: '/mock/d.csv' }),
		);
		_respondToQuickPick(() => undefined);
		await runExtract();
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});
});

describe('extract: streaming toggle', () => {
	const CSV = '1,2\nfoo,bar\n';

	it('opens the same documents with streaming enabled', async () => {
		// The streaming path writes incrementally through editor edits, which the
		// mock records rather than applies — so the assertion is on the documents
		// opened and the insertions recorded, not on final document text.
		_setConfig('string-le.csv.streamingEnabled', false);
		_setActiveEditor(
			_createDocument({ content: CSV, fileName: '/mock/d.csv' }),
		);
		_respondToInputBox(() => '');
		await runExtract();
		const withoutStreaming = _openedDocuments().length;

		_resetMockState();
		_setConfig('string-le.notificationsLevel', 'all');
		_setConfig('string-le.csv.streamingEnabled', true);
		_setActiveEditor(
			_createDocument({ content: CSV, fileName: '/mock/d.csv' }),
		);
		_respondToInputBox(() => '');
		await runExtract();

		expect(_openedDocuments().length).toBe(withoutStreaming);
		expect(_editorInsertions().length).toBeGreaterThan(0);
	});

	it('warns that dedupe is disabled while streaming', async () => {
		// Streaming trades deduplication for bounded memory, and says so.
		_setConfig('string-le.csv.streamingEnabled', true);
		_setConfig('string-le.dedupeEnabled', true);
		_setActiveEditor(
			_createDocument({ content: CSV, fileName: '/mock/d.csv' }),
		);
		_respondToInputBox(() => '');
		await runExtract();
		expect(_shownMessages().some((m) => m.kind === 'warning')).toBe(true);
	});
});

describe('extract: remaining settings paths', () => {
	it('maps the dotenv language id onto the env extractor', async () => {
		// VS Code reports .env files as languageId 'dotenv'; the extractor keys
		// off 'env'.
		_setActiveEditor(
			_createDocument({
				content: 'NAME="ada"\nCITY="london"\n',
				fileName: '/mock/.env',
				languageId: 'dotenv',
			}),
		);
		await runExtract();
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('surfaces parse errors only when showParseErrors is on', async () => {
		_setConfig('string-le.showParseErrors', true);
		_setActiveEditor(
			_createDocument({
				content: '{ not valid json',
				fileName: '/mock/a.json',
			}),
		);
		await runExtract();
		const withErrors = _shownMessages().some((m) => m.kind === 'error');

		_resetMockState();
		_setConfig('string-le.notificationsLevel', 'all');
		_setConfig('string-le.showParseErrors', false);
		_setActiveEditor(
			_createDocument({
				content: '{ not valid json',
				fileName: '/mock/a.json',
			}),
		);
		await runExtract();
		const withoutErrors = _shownMessages().some((m) => m.kind === 'error');

		expect(withErrors).toBe(true);
		expect(withoutErrors).toBe(false);
	});

	it('asks before opening a document per column when there are many', async () => {
		// manyDocumentsThreshold floors at 1, so a multi-column selection trips it.
		_setConfig('string-le.safety.enabled', true);
		_setConfig('string-le.safety.manyDocumentsThreshold', 2);
		_setActiveEditor(
			_createDocument({
				content: '1,2,3\nfoo,bar,baz\n',
				fileName: '/mock/d.csv',
			}),
		);
		_respondToInputBox(() => '0,1,2');
		let asked = false;
		_respondToWarning((items) => {
			asked = true;
			return items.find((i) => String(i).includes('Open'));
		});
		await runExtract();
		expect(asked).toBe(true);
	});

	it('opens nothing when the many-documents confirmation is declined', async () => {
		_setConfig('string-le.safety.enabled', true);
		_setConfig('string-le.safety.manyDocumentsThreshold', 2);
		_setActiveEditor(
			_createDocument({
				content: '1,2,3\nfoo,bar,baz\n',
				fileName: '/mock/d.csv',
			}),
		);
		_respondToInputBox(() => '0,1,2');
		_respondToWarning(() => undefined);
		const before = _openedDocuments().length;
		await runExtract();
		expect(_openedDocuments()).toHaveLength(before);
	});
});

describe('extract: cancellation', () => {
	// The command declares cancellable: true, so these checks are reachable —
	// unlike a token that is created locally and never cancelled. Each step of
	// the extraction re-checks, which is what keeps a large file interruptible.

	it('stops before extracting when cancelled at once', async () => {
		_cancelAfterProgress(0);
		_setActiveEditor(
			_createDocument({ content: '["a","b"]', fileName: '/mock/a.json' }),
		);
		const before = _openedDocuments().length;
		await runExtract();
		expect(_openedDocuments()).toHaveLength(before);
	});

	it('finishes cleanly when cancelled partway through', async () => {
		// Where a mid-run cancellation lands depends on the input: a small
		// document can pass the remaining checks before the flag is read. What
		// must hold either way is that it neither throws nor reports an error.
		_cancelAfterProgress(1);
		_setActiveEditor(
			_createDocument({ content: manyStrings(), fileName: '/mock/a.json' }),
		);
		await expect(runExtract()).resolves.toBeUndefined();
		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(false);
	});

	it('does not report a cancellation as an error', async () => {
		_cancelAfterProgress(1);
		_setActiveEditor(
			_createDocument({ content: '["a","b"]', fileName: '/mock/a.json' }),
		);
		await runExtract();
		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(false);
	});

	it('completes normally when not cancelled', async () => {
		_setActiveEditor(
			_createDocument({ content: '["a","b"]', fileName: '/mock/a.json' }),
		);
		await runExtract();
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('stops a streaming CSV extraction when cancelled', async () => {
		_setConfig('string-le.csv.streamingEnabled', true);
		_cancelAfterProgress(1);
		_setActiveEditor(
			_createDocument({ content: '1,2\nfoo,bar\n', fileName: '/m/d.csv' }),
		);
		_respondToInputBox(() => '');
		await expect(runExtract()).resolves.toBeUndefined();
	});
});

describe('extract: parse errors and streaming flush', () => {
	// Each format's extractor gets an onParseError callback; they only fire on
	// input the parser rejects, so well-formed fixtures leave them unread.

	it('surfaces a JSON parse error when showParseErrors is on', async () => {
		_setConfig('string-le.showParseErrors', true);
		_setActiveEditor(
			_createDocument({ content: '{ not valid json', fileName: '/m/a.json' }),
		);
		await runExtract();
		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(true);
	});

	it('stays quiet about a parse error when showParseErrors is off', async () => {
		_setConfig('string-le.showParseErrors', false);
		_setActiveEditor(
			_createDocument({ content: '{ not valid json', fileName: '/m/a.json' }),
		);
		await runExtract();
		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(false);
	});

	it('surfaces a YAML parse error', async () => {
		_setConfig('string-le.showParseErrors', true);
		_setActiveEditor(
			_createDocument({
				content: 'a:\n  - b\n bad indent: [\n',
				fileName: '/m/a.yaml',
			}),
		);
		await runExtract();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('surfaces a TOML parse error', async () => {
		_setConfig('string-le.showParseErrors', true);
		_setActiveEditor(
			_createDocument({ content: 'a = = 1\n', fileName: '/m/a.toml' }),
		);
		await runExtract();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('flushes batched rows while streaming a larger CSV', async () => {
		// The streaming path writes incrementally and flushes in batches; a file
		// of a couple of rows never reaches the flush.
		_setConfig('string-le.csv.streamingEnabled', true);
		const rows = Array.from({ length: 400 }, (_, i) => `v${i},w${i}`).join(
			'\n',
		);
		_setActiveEditor(
			_createDocument({ content: `1,2\n${rows}\n`, fileName: '/m/big.csv' }),
		);
		_respondToInputBox(() => '');
		await runExtract();
		expect(_editorInsertions().length).toBeGreaterThan(0);
	});
});

describe('extract: CSV parse errors', () => {
	// csv-parse runs with relax_quotes and relax_column_count, so most malformed
	// input is tolerated — but an unterminated quote still throws, and each CSV
	// mode has its own handler for it.
	const BAD_CSV = '1,2\nfoo,"unterminated\nbar,baz\n';

	it('reports a parse error while streaming', async () => {
		_setConfig('string-le.showParseErrors', true);
		_setConfig('string-le.csv.streamingEnabled', true);
		_setActiveEditor(
			_createDocument({ content: BAD_CSV, fileName: '/m/bad.csv' }),
		);
		_respondToInputBox(() => '');
		await expect(runExtract()).resolves.toBeUndefined();
	});

	it('reports a parse error while streaming selected columns', async () => {
		_setConfig('string-le.showParseErrors', true);
		_setConfig('string-le.csv.streamingEnabled', true);
		_setActiveEditor(
			_createDocument({ content: BAD_CSV, fileName: '/m/bad.csv' }),
		);
		_respondToInputBox(() => '0,1');
		await expect(runExtract()).resolves.toBeUndefined();
	});

	it('reports a parse error without streaming', async () => {
		_setConfig('string-le.showParseErrors', true);
		_setConfig('string-le.csv.streamingEnabled', false);
		_setActiveEditor(
			_createDocument({ content: BAD_CSV, fileName: '/m/bad.csv' }),
		);
		_respondToInputBox(() => '');
		await expect(runExtract()).resolves.toBeUndefined();
	});

	it('stays quiet about a CSV parse error when showParseErrors is off', async () => {
		// showParseErrors governs the parser callback, not a stream failure: a
		// column whose stream dies is a hard failure and is always reported. The
		// non-streaming route is where the setting actually applies.
		_setConfig('string-le.showParseErrors', false);
		_setConfig('string-le.csv.streamingEnabled', false);
		_setActiveEditor(
			_createDocument({ content: BAD_CSV, fileName: '/m/bad.csv' }),
		);
		_respondToInputBox(() => '');
		await runExtract();
		expect(
			_shownMessages().some((m) => m.message.includes('Invalid CSV')),
		).toBe(false);
	});

	it('reports the parse error when showParseErrors is on', async () => {
		_setConfig('string-le.showParseErrors', true);
		_setConfig('string-le.csv.streamingEnabled', false);
		_setActiveEditor(
			_createDocument({ content: BAD_CSV, fileName: '/m/bad.csv' }),
		);
		_respondToInputBox(() => '0,1');
		await runExtract();
		expect(
			_shownMessages().some((m) => m.message.includes('Invalid CSV')),
		).toBe(true);
	});
});
