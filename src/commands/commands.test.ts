import { beforeEach, describe, expect, it } from 'vitest';
import {
	_clipboardText,
	_createDocument,
	_createExtensionContext,
	_editorInsertions,
	_getConfigUpdates,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
	_respondToQuickPick,
	_setActiveEditor,
	_setConfig,
	_shownMessages,
	commands,
	executedBuiltins,
} from '../__mocks__/vscode';
import { registerOpenSettingsCommand } from '../config/settings';
import { createTelemetry } from '../telemetry/telemetry';
import { createNotifier } from '../ui/notifier';
import { createStatusBar } from '../ui/statusBar';
import { registerAllCommands } from './index';

function makeDeps(context: ReturnType<typeof _createExtensionContext>) {
	return {
		telemetry: createTelemetry(context as never),
		notifier: createNotifier(),
		statusBar: createStatusBar(context as never),
	};
}

describe('command registration', () => {
	beforeEach(() => {
		_resetMockState();
	});

	it('registers every command declared in the manifest', () => {
		const context = _createExtensionContext();
		registerAllCommands(context as never, makeDeps(context));
		registerOpenSettingsCommand(
			context as never,
			createTelemetry(context as never),
		);

		expect([..._registeredCommands().keys()].sort()).toEqual([
			'string-le.csv.toggleStreaming',
			'string-le.extractStrings',
			'string-le.help',
			'string-le.openSettings',
			'string-le.postProcess.dedupe',
			'string-le.postProcess.sort',
		]);
	});
});

describe('extract command', () => {
	beforeEach(() => {
		_resetMockState();
	});

	function register() {
		const context = _createExtensionContext();
		registerAllCommands(context as never, makeDeps(context));
	}

	it('extracts JSON string values into a new document', async () => {
		register();
		_setActiveEditor(
			_createDocument({
				content: '{"a": "first", "b": {"c": "second"}, "n": 7}',
				languageId: 'json',
				fileName: '/mock/data.json',
			}),
		);

		await commands.executeCommand('string-le.extractStrings');

		const results = _openedDocuments();
		expect(results).toHaveLength(1);
		expect(results[0]?.getText()).toBe('first\nsecond');
	});

	it('extracts YAML plain scalars', async () => {
		register();
		_setActiveEditor(
			_createDocument({
				content: 'title: Plain value\nquoted: "Quoted value"\n',
				languageId: 'yaml',
				fileName: '/mock/config.yaml',
			}),
		);

		await commands.executeCommand('string-le.extractStrings');

		expect(_openedDocuments()[0]?.getText()).toBe('Plain value\nQuoted value');
	});

	it('applies dedupe and sort when enabled', async () => {
		register();
		_setConfig('string-le.dedupeEnabled', true);
		_setConfig('string-le.sortEnabled', true);
		_setConfig('string-le.sortMode', 'alpha-asc');
		_setActiveEditor(
			_createDocument({
				content: '{"a": "bravo", "b": "alpha", "c": "bravo"}',
				languageId: 'json',
				fileName: '/mock/data.json',
			}),
		);

		await commands.executeCommand('string-le.extractStrings');

		expect(_openedDocuments()[0]?.getText()).toBe('alpha\nbravo');
	});

	it('shows an info message when nothing extracts', async () => {
		register();
		_setConfig('string-le.notificationsLevel', 'all');
		_setActiveEditor(
			_createDocument({
				content: '{"n": 42}',
				languageId: 'json',
				fileName: '/mock/data.json',
			}),
		);

		await commands.executeCommand('string-le.extractStrings');

		expect(_openedDocuments()).toHaveLength(0);
		expect(_shownMessages().some((m) => m.message === 'No strings found')).toBe(
			true,
		);
	});

	it('reports missing editor as an error', async () => {
		register();
		_setActiveEditor(undefined);

		await commands.executeCommand('string-le.extractStrings');

		expect(
			_shownMessages().some(
				(m) => m.kind === 'error' && m.message === 'No active editor',
			),
		).toBe(true);
	});

	it('copies results to the clipboard when enabled', async () => {
		register();
		_setConfig('string-le.copyToClipboardEnabled', true);
		_setActiveEditor(
			_createDocument({
				content: '{"a": "copy me"}',
				languageId: 'json',
				fileName: '/mock/data.json',
			}),
		);

		await commands.executeCommand('string-le.extractStrings');

		expect(_clipboardText()).toBe('copy me');
	});

	it('prompts for file type on unknown extensions', async () => {
		register();
		_respondToQuickPick(() => 'JSON');
		_setActiveEditor(
			_createDocument({
				content: '{"a": "picked"}',
				languageId: 'plaintext',
				fileName: '/mock/data.unknownext',
			}),
		);

		await commands.executeCommand('string-le.extractStrings');

		expect(_openedDocuments()[0]?.getText()).toBe('picked');
	});

	it('streams CSV into an editor when streaming is enabled', async () => {
		register();
		_setConfig('string-le.csv.streamingEnabled', true);
		_respondToQuickPick(() => 'All columns');
		_setActiveEditor(
			_createDocument({
				content: 'name,city\nAda,London\nLin,Paris\n',
				languageId: 'csv',
				fileName: '/mock/data.csv',
			}),
		);

		await commands.executeCommand('string-le.extractStrings');

		const inserted = _editorInsertions()
			.map((i) => i.text)
			.join('');
		expect(inserted).toContain('Ada');
		expect(inserted).toContain('Paris');
	});
});

describe('post-process commands', () => {
	beforeEach(() => {
		_resetMockState();
	});

	function register() {
		const context = _createExtensionContext();
		registerAllCommands(context as never, makeDeps(context));
	}

	it('dedupe opens deduplicated lines in a new document by default', async () => {
		register();
		_setActiveEditor(
			_createDocument({ content: 'a\nb\na\nb\nc', languageId: 'plaintext' }),
		);

		await commands.executeCommand('string-le.postProcess.dedupe');

		expect(_openedDocuments()[0]?.getText()).toBe('a\nb\nc');
	});

	it('sort respects the picked mode', async () => {
		register();
		_respondToQuickPick(() => 'Alphabetical (Z → A)');
		_setActiveEditor(_createDocument({ content: 'alpha\ncharlie\nbravo' }));

		await commands.executeCommand('string-le.postProcess.sort');

		expect(_openedDocuments()[0]?.getText()).toBe('charlie\nbravo\nalpha');
	});

	it('toggleStreaming flips the config value', async () => {
		register();
		_setConfig('string-le.csv.streamingEnabled', false);

		await commands.executeCommand('string-le.csv.toggleStreaming');

		expect(_getConfigUpdates()).toContainEqual(
			expect.objectContaining({
				key: 'string-le.csv.streamingEnabled',
				value: true,
			}),
		);
	});

	it('help opens a markdown document describing real commands only', async () => {
		register();

		await commands.executeCommand('string-le.help');

		const helpText = _openedDocuments()[0]?.getText() ?? '';
		expect(helpText).toContain('Extract Strings');
		expect(helpText).not.toContain('JavaScript/TypeScript');
		expect(helpText).not.toContain('HTML');
	});

	it('openSettings executes the builtin settings command', async () => {
		const context = _createExtensionContext();
		registerOpenSettingsCommand(
			context as never,
			createTelemetry(context as never),
		);

		await commands.executeCommand('string-le.openSettings');

		expect(executedBuiltins).toContainEqual(
			expect.objectContaining({
				id: 'workbench.action.openSettings',
				args: ['string-le.'],
			}),
		);
	});
});
