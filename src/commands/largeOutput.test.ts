import { beforeEach, describe, expect, it } from 'vitest';
import {
	_clipboardText,
	_createDocument,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
	_respondToWarning,
	_setActiveEditor,
	_setConfig,
} from '../__mocks__/vscode';
import { registerExtractStringsCommand } from './extract';

/**
 * The large-output dialog's "Copy only" choice.
 *
 * The dialog offers Open / Copy only / Cancel regardless of the
 * copyToClipboardEnabled setting, but the copy that followed was gated on that
 * setting. Choosing "Copy only" with it off opened no document and copied
 * nothing, then reported "Extracted N strings" — a count for results the user
 * never received. An explicit choice now performs the copy.
 */

function makeContext() {
	return { subscriptions: [] as Array<{ dispose(): void }> } as never;
}

function makeDeps(events: string[]) {
	return {
		telemetry: {
			event: (name: string) => events.push(`tel:${name}`),
			dispose: () => {},
		},
		notifier: {
			info: (m: string) => events.push(`info:${m}`),
			warn: (m: string) => events.push(`warn:${m}`),
			error: (m: string) => events.push(`error:${m}`),
		},
		statusBar: {
			flash: (m: string) => events.push(`flash:${m}`),
			show: () => {},
			hide: () => {},
			dispose: () => {},
		},
	} as never;
}

const BIG = `{"values":[${Array.from({ length: 150 }, (_, i) => `"v${i}"`).join(',')}]}`;

async function runExtract(events: string[]): Promise<void> {
	registerExtractStringsCommand(makeContext(), makeDeps(events));
	const handler = _registeredCommands().get('string-le.extractStrings');
	if (!handler) throw new Error('extract command not registered');
	await handler();
}

function chooseCopyOnly(): void {
	_respondToWarning((items) =>
		items.find((i) => String(i).includes('Copy only')),
	);
}

beforeEach(() => {
	_resetMockState();
	_setConfig('string-le.notificationsLevel', 'all');
	_setConfig('string-le.safety.enabled', true);
	_setConfig('string-le.safety.largeOutputLinesThreshold', 100);
	_setActiveEditor(
		_createDocument({
			content: BIG,
			languageId: 'json',
			fileName: '/tmp/data.json',
		}),
	);
});

describe('large output: "Copy only"', () => {
	it('copies even when the automatic copy setting is off', async () => {
		const events: string[] = [];
		_setConfig('string-le.copyToClipboardEnabled', false);
		chooseCopyOnly();
		await runExtract(events);
		expect(_clipboardText().length).toBeGreaterThan(0);
		expect(_openedDocuments()).toHaveLength(0);
		expect(events).toContain('flash:Copied to clipboard');
	});

	it('does not report a count for results it never delivered', async () => {
		const events: string[] = [];
		_setConfig('string-le.copyToClipboardEnabled', false);
		chooseCopyOnly();
		await runExtract(events);
		expect(events.some((e) => e.startsWith('flash:Extracted'))).toBe(false);
	});

	it('still copies when the setting is on', async () => {
		const events: string[] = [];
		_setConfig('string-le.copyToClipboardEnabled', true);
		chooseCopyOnly();
		await runExtract(events);
		expect(_clipboardText().length).toBeGreaterThan(0);
		expect(events).toContain('flash:Copied to clipboard');
	});

	it('opens the results when "Open results" is chosen', async () => {
		const events: string[] = [];
		_setConfig('string-le.copyToClipboardEnabled', false);
		_respondToWarning((items) =>
			items.find((i) => String(i).includes('Open results')),
		);
		await runExtract(events);
		expect(_openedDocuments().length).toBeGreaterThan(0);
	});

	it('does nothing when the dialog is cancelled', async () => {
		const events: string[] = [];
		_respondToWarning(() => undefined);
		await runExtract(events);
		expect(_openedDocuments()).toHaveLength(0);
		expect(_clipboardText()).toBe('');
		expect(events.some((e) => e.startsWith('flash:Extracted'))).toBe(false);
	});
});
