import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_createDocument,
	_createExtensionContext,
	_live,
	_outputChannels,
	_registeredCommands,
	_resetMockState,
	_respondToQuickPick,
	_setActiveEditor,
	_setConfig,
	_setLmApi,
	_setWorkspaceFiles,
	_statusBarItems,
	Uri,
	workspace,
} from './__mocks__/vscode';
import { activate } from './extension';
import { createTelemetry } from './telemetry/telemetry';
import { createStatusBar } from './ui/statusBar';

/**
 * What the extension holds, and whether it lets go.
 *
 * An extension host stays up for days, so a resource created per command and
 * never released is a real leak, and a deactivation that leaves a listener or
 * a timer behind is one too. The mock counts what is alive: created and not
 * disposed, registered and not removed.
 */

async function run(id: string, ...args: unknown[]): Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	await handler(...args);
}

function openWorkspace(): void {
	_setWorkspaceFiles({ '/w/a.json': '["one","two"]\n' });
	workspace.workspaceFolders = [{ uri: Uri.file('/w'), name: 'w', index: 0 }];
}

function openEditor(): void {
	_setActiveEditor(
		_createDocument({
			content: '["b","a","a"]',
			fileName: '/w/a.json',
			languageId: 'json',
		}),
	);
}

beforeEach(() => {
	_resetMockState();
	_setConfig('string-le.telemetryEnabled', true);
	_setLmApi(true);
});

describe('dispose is complete and safe to repeat', () => {
	it('status bar', () => {
		const context = _createExtensionContext();
		createStatusBar(context as never);
		for (const disposable of context.subscriptions) disposable.dispose();
		expect(_statusBarItems()[0]?.disposed).toBe(true);
		expect(_live().configListeners).toBe(0);
		expect(() => {
			for (const disposable of context.subscriptions) disposable.dispose();
		}).not.toThrow();
	});

	it('telemetry channel', () => {
		const context = _createExtensionContext();
		const telemetry = createTelemetry(context as never);
		telemetry.event('x');
		for (const disposable of context.subscriptions) disposable.dispose();
		expect(_outputChannels()[0]?.disposed).toBe(true);
		expect(() => {
			for (const disposable of context.subscriptions) disposable.dispose();
		}).not.toThrow();
	});

	it('a flash after dispose schedules nothing', () => {
		// A command finishing after deactivation flashed the disposed item and
		// set a restore timer that outlived the extension.
		vi.useFakeTimers();
		try {
			const context = _createExtensionContext();
			const statusBar = createStatusBar(context as never);
			for (const disposable of context.subscriptions) disposable.dispose();
			statusBar.flash('Extracted 3');
			expect(vi.getTimerCount()).toBe(0);
			expect(_statusBarItems()[0]?.text).toBe('$(quote) String-LE');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('deactivation leaves nothing behind', () => {
	it('after every command has run once', async () => {
		openWorkspace();
		const context = _createExtensionContext();
		activate(context as never);
		openEditor();
		_respondToQuickPick((items) => items[0]);
		await run('string-le.extractStrings');
		await run('string-le.extractWorkspace');
		await run('string-le.extractFolder', Uri.file('/w'));
		await run('string-le.postProcess.dedupe');
		await run('string-le.postProcess.sort');
		await run('string-le.csv.toggleStreaming');
		await run('string-le.openSettings');
		await run('string-le.help');
		const alive = _live();
		expect(alive).toMatchObject({
			statusBarItems: 1,
			outputChannels: 1,
			configListeners: 1,
			commands: 8,
			mcpProviders: 1,
		});
		expect(alive.codeActionProviders).toBeGreaterThan(0);

		for (const disposable of context.subscriptions) disposable.dispose();
		expect(_live()).toEqual({
			statusBarItems: 0,
			outputChannels: 0,
			configListeners: 0,
			commands: 0,
			codeActionProviders: 0,
			mcpProviders: 0,
		});
	});
});

describe('repeated runs do not grow', () => {
	it('fifty extractions, fifty help commands', async () => {
		activate(_createExtensionContext() as never);
		openEditor();
		await run('string-le.extractStrings');
		await run('string-le.help');
		const afterOne = _live();
		for (let i = 0; i < 49; i++) {
			await run('string-le.extractStrings');
			await run('string-le.help');
		}
		expect(_live()).toEqual(afterOne);
	});
});
