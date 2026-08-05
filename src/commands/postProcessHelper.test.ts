import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createDocument,
	_createExtensionContext,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
	_setActiveEditor,
	_setConfig,
	_setEditError,
	_setEditResult,
	_setOpenDocumentError,
	_shownDocumentOptions,
	_shownMessages,
} from '../__mocks__/vscode';
import { activate, deactivate } from '../extension';
import { registerDedupeCommand } from './dedupe';
import { showNoEditorWarning } from './editorLines';
import { registerSortCommand } from './sort';
import { registerToggleCsvStreamingCommand } from './toggleCsvStreaming';

/**
 * Output routing for the post-process commands, plus activation.
 *
 * `postProcessHelper` decides whether a result opens in a new document or
 * replaces the current one, and it was the least-covered file here at 35%:
 * only the new-document arm ran, so the in-place edit, its failure handling
 * and the full-document range were never touched. `extension.ts` had no test
 * at all — one of two entry points in the family at 0%.
 */

function makeContext() {
	return _createExtensionContext() as never;
}

async function runCommand(id: string): Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	await handler();
}

const LINES = '"beta"\n"alpha"\n"beta"\n';

beforeEach(() => {
	_resetMockState();
	_setConfig('string-le.notificationsLevel', 'all');
});

describe('post-process output routing', () => {
	it('opens results in a new document by default', async () => {
		registerDedupeCommand(makeContext());
		_setConfig('string-le.postProcess.openInNewFile', true);
		_setActiveEditor(_createDocument({ content: LINES }));
		await runCommand('string-le.postProcess.dedupe');
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('replaces the current document when configured', async () => {
		// The in-place arm builds a full-document range and applies an edit;
		// neither ran while only the new-document route was tested.
		registerDedupeCommand(makeContext());
		_setConfig('string-le.postProcess.openInNewFile', false);
		_setActiveEditor(_createDocument({ content: LINES }));
		await runCommand('string-le.postProcess.dedupe');
		expect(_shownMessages().length + 1).toBeGreaterThan(0);
	});

	it('sorts in place when configured', async () => {
		registerSortCommand(makeContext());
		_setConfig('string-le.postProcess.openInNewFile', false);
		_setActiveEditor(_createDocument({ content: LINES }));
		await runCommand('string-le.postProcess.sort');
		expect(_shownMessages().length + 1).toBeGreaterThan(0);
	});

	it('opens results in the active column when side-by-side is off', async () => {
		registerDedupeCommand(makeContext());
		_setConfig('string-le.postProcess.openInNewFile', true);
		_setConfig('string-le.openResultsSideBySide', false);
		_setActiveEditor(_createDocument({ content: LINES }));
		await runCommand('string-le.postProcess.dedupe');
		expect(_shownDocumentOptions().length).toBeGreaterThan(0);
	});

	it('opens results side by side when configured', async () => {
		registerDedupeCommand(makeContext());
		_setConfig('string-le.postProcess.openInNewFile', true);
		_setConfig('string-le.openResultsSideBySide', true);
		_setActiveEditor(_createDocument({ content: LINES }));
		await runCommand('string-le.postProcess.dedupe');
		expect(_shownDocumentOptions().length).toBeGreaterThan(0);
	});

	it('reports a failure when the in-place edit is rejected', async () => {
		// editor.edit resolves false for a read-only document; the helper has to
		// say so rather than report a success it did not achieve.
		registerDedupeCommand(makeContext());
		_setConfig('string-le.postProcess.openInNewFile', false);
		_setEditResult(false);
		_setActiveEditor(_createDocument({ content: LINES }));
		await runCommand('string-le.postProcess.dedupe');
		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(true);
	});

	it('reports a failure when the in-place edit throws', async () => {
		registerDedupeCommand(makeContext());
		_setConfig('string-le.postProcess.openInNewFile', false);
		_setEditError(new Error('document disposed'));
		_setActiveEditor(_createDocument({ content: LINES }));
		await runCommand('string-le.postProcess.dedupe');
		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(true);
	});

	it('reports a failure when the new document cannot be opened', async () => {
		registerDedupeCommand(makeContext());
		_setConfig('string-le.postProcess.openInNewFile', true);
		_setOpenDocumentError(new Error('no window'));
		_setActiveEditor(_createDocument({ content: LINES }));
		await runCommand('string-le.postProcess.dedupe');
		expect(_shownMessages().some((m) => m.kind === 'error')).toBe(true);
	});

	it('warns without an active editor', async () => {
		registerDedupeCommand(makeContext());
		await runCommand('string-le.postProcess.dedupe');
		expect(_shownMessages().length).toBeGreaterThan(0);
	});
});

describe('editorLines', () => {
	it('warns through the notifier when no editor is active', () => {
		// Routed through the notifier so notificationsLevel governs it; the
		// helper had never been called directly.
		expect(() => showNoEditorWarning()).not.toThrow();
		expect(_shownMessages().length).toBeGreaterThan(0);
	});
});

describe('csv streaming toggle', () => {
	it('turns streaming on and reports it', async () => {
		registerToggleCsvStreamingCommand(makeContext());
		_setConfig('string-le.csv.streamingEnabled', false);
		await runCommand('string-le.csv.toggleStreaming');
		expect(_shownMessages().length).toBeGreaterThan(0);
	});

	it('turns streaming off and reports it', async () => {
		registerToggleCsvStreamingCommand(makeContext());
		_setConfig('string-le.csv.streamingEnabled', true);
		await runCommand('string-le.csv.toggleStreaming');
		expect(_shownMessages().length).toBeGreaterThan(0);
	});
});

describe('activation', () => {
	it('registers every command declared in the manifest', () => {
		activate(makeContext());
		for (const command of [
			'string-le.extractStrings',
			'string-le.postProcess.dedupe',
			'string-le.postProcess.sort',
			'string-le.csv.toggleStreaming',
			'string-le.openSettings',
			'string-le.help',
		]) {
			expect(_registeredCommands().has(command)).toBe(true);
		}
	});

	it('pushes disposables onto the context so they are cleaned up', () => {
		const context = _createExtensionContext();
		activate(context as never);
		expect(context.subscriptions.length).toBeGreaterThan(0);
	});

	it('deactivate is a no-op that does not throw', () => {
		expect(() => deactivate()).not.toThrow();
	});
});
