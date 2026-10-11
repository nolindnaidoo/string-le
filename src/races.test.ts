import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_createDocument,
	_createExtensionContext,
	_openedDocuments,
	_registeredCommands,
	_replacedRanges,
	_resetMockState,
	_respondToQuickPick,
	_setActiveEditor,
	_setConfig,
	_setWorkspaceFiles,
	_shownMessages,
	_statusBarItems,
	executedBuiltins,
	Uri,
	workspace,
} from './__mocks__/vscode';
import { activate } from './extension';

/**
 * Every command, started a second time while the first is suspended.
 *
 * The policy the code implements is that each run is independent: no command
 * holds state another run reads, so two runs deliver two results. What they
 * share is the status bar, which the later run resets. Neither corrupts a
 * result, and both ends are asserted here.
 */

function command(id: string): (...args: unknown[]) => Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	return async (...args) => {
		await handler(...args);
	};
}

const IDLE = '$(quote) String-LE';

beforeEach(() => {
	_resetMockState();
	_setConfig('string-le.notificationsLevel', 'all');
	_setWorkspaceFiles({ '/w/a.json': '["one","two"]\n' });
	workspace.workspaceFolders = [{ uri: Uri.file('/w'), name: 'w', index: 0 }];
	activate(_createExtensionContext() as never);
});

describe('two invocations at once', () => {
	it('extractStrings: both deliver, and the bar ends idle', async () => {
		vi.useFakeTimers();
		try {
			_setActiveEditor(
				_createDocument({
					content: '["one","two"]',
					fileName: '/w/a.json',
					languageId: 'json',
				}),
			);
			const run = command('string-le.extractStrings');
			await Promise.all([run(), run()]);
			expect(_openedDocuments().map((d) => d.getText())).toEqual([
				'one\ntwo',
				'one\ntwo',
			]);
			expect(_statusBarItems()[0]?.text).toBe('$(quote) Extracted 2');
			vi.advanceTimersByTime(2000);
			expect(_statusBarItems()[0]?.text).toBe(IDLE);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('extractWorkspace and extractFolder: two reports', async () => {
		await Promise.all([
			command('string-le.extractWorkspace')(),
			command('string-le.extractFolder')(Uri.file('/w')),
		]);
		expect(_openedDocuments()).toHaveLength(2);
		for (const report of _openedDocuments()) {
			expect(report.getText()).toContain('`one`');
		}
	});

	it('dedupe and sort in place: both edits land, each computed from the text it read', async () => {
		_setConfig('string-le.postProcess.openInNewFile', false);
		_setActiveEditor(_createDocument({ content: '"b"\n"a"\n"a"\n' }));
		_respondToQuickPick((items) => items[0]);
		await Promise.all([
			command('string-le.postProcess.dedupe')(),
			command('string-le.postProcess.sort')(),
		]);
		expect(_replacedRanges().map((edit) => edit.text)).toEqual([
			'"b"\n"a"\n',
			'"a"\n"a"\n"b"\n',
		]);
		expect(_shownMessages().filter((m) => m.kind === 'error')).toEqual([]);
	});

	it('help and openSettings: two documents, two settings calls', async () => {
		await Promise.all([
			command('string-le.help')(),
			command('string-le.help')(),
			command('string-le.openSettings')(),
			command('string-le.openSettings')(),
		]);
		expect(_openedDocuments()).toHaveLength(2);
		expect(executedBuiltins).toHaveLength(2);
	});
});
