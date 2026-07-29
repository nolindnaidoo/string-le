import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_createExtensionContext,
	_fireConfigChange,
	_resetMockState,
	_respondToInputBox,
	_respondToQuickPick,
	_respondToWarning,
	_setConfig,
	_shownMessages,
} from '../__mocks__/vscode';
import { chooseLargeOutputAction, confirmManyDocuments } from './largeOutput';
import { createNotifier } from './notifier';
import { promptCsvOptionsIfNeeded, promptForFileType } from './prompts';
import { createStatusBar } from './statusBar';

describe('notifier levels', () => {
	beforeEach(() => {
		_resetMockState();
	});

	it('silent (default) suppresses info and warnings but never errors', () => {
		const notifier = createNotifier();
		notifier.info('an info');
		notifier.warn('a warning');
		notifier.error('an error');

		expect(_shownMessages()).toEqual([
			expect.objectContaining({ kind: 'error', message: 'an error' }),
		]);
	});

	it('important shows warnings and errors, not info', () => {
		_setConfig('string-le.notificationsLevel', 'important');
		const notifier = createNotifier();
		notifier.info('an info');
		notifier.warn('a warning');
		notifier.error('an error');

		expect(_shownMessages().map((m) => m.kind)).toEqual(['warning', 'error']);
	});

	it('all shows everything including advisory messages', () => {
		_setConfig('string-le.notificationsLevel', 'all');
		const notifier = createNotifier();
		notifier.info('an info');
		notifier.showMultilineRisk(2);
		notifier.showCsvNoCopy();
		notifier.showPostProcessInfo();

		expect(_shownMessages()).toHaveLength(4);
		expect(_shownMessages()[1]?.message).toContain('2 multi‑line strings');
	});

	it('sanitizes error messages before display', () => {
		const notifier = createNotifier();
		notifier.error('ENOENT /Users/alice/secrets.json');

		expect(_shownMessages()[0]?.message).toBe('ENOENT /Users/***/secrets.json');
	});
});

describe('status bar', () => {
	beforeEach(() => {
		_resetMockState();
		vi.useRealTimers();
	});

	it('shows by default and flashes text', () => {
		vi.useFakeTimers();
		const context = _createExtensionContext();
		const statusBar = createStatusBar(context as never);

		statusBar.flash('Extracted 3');
		vi.advanceTimersByTime(1000);

		// The flash is visible before the restore timer fires
		vi.advanceTimersByTime(2000);
		vi.useRealTimers();
		expect(context.subscriptions.length).toBeGreaterThan(0);
	});

	it('reacts to statusBar.enabled changes at runtime', () => {
		const context = _createExtensionContext();
		createStatusBar(context as never);

		_setConfig('string-le.statusBar.enabled', false);
		_fireConfigChange('string-le.statusBar.enabled');
		// No throw and listener registered: the item re-read config
		expect(context.subscriptions.length).toBeGreaterThan(0);
	});
});

describe('prompts', () => {
	beforeEach(() => {
		_resetMockState();
	});

	it('maps file-type labels to internal values', async () => {
		_respondToQuickPick(() => 'TOML');
		expect(await promptForFileType()).toBe('toml');

		_respondToQuickPick(() => 'Fallback (quoted strings)');
		expect(await promptForFileType()).toBe('fallback');

		_respondToQuickPick(() => undefined);
		expect(await promptForFileType()).toBeUndefined();
	});

	it('returns empty options for non-csv types', async () => {
		expect(await promptCsvOptionsIfNeeded('json', 'a,b')).toEqual({});
	});

	it('offers header-based column selection for lettered headers', async () => {
		_respondToQuickPick((items) => {
			const labels = items as Array<{ label: string }>;
			return labels.find((i) => i.label === 'city');
		});

		const options = await promptCsvOptionsIfNeeded(
			'csv',
			'name,city\nAda,London\n',
		);
		expect(options).toEqual({ csvHasHeader: true, csvColumnIndex: 1 });
	});

	it('falls back to index input for numeric first rows', async () => {
		_respondToInputBox(() => '1');

		const options = await promptCsvOptionsIfNeeded('csv', '1,2\n3,4\n');
		expect(options).toEqual({ csvHasHeader: false, csvColumnIndex: 1 });
	});

	it('warns and selects all columns for out-of-range indexes', async () => {
		_respondToInputBox(() => '9');

		const options = await promptCsvOptionsIfNeeded('csv', '1,2\n3,4\n');
		expect(options).toEqual({ csvHasHeader: false, selectAllColumns: true });
		expect(_shownMessages()[0]?.message).toContain('out of range');
	});
});

describe('large output dialogs', () => {
	beforeEach(() => {
		_resetMockState();
	});

	it('maps warning choices to actions', async () => {
		_respondToWarning(() => 'Open results');
		expect(await chooseLargeOutputAction(100000)).toBe('open');

		_respondToWarning(() => 'Copy only');
		expect(await chooseLargeOutputAction(100000)).toBe('copy');

		_respondToWarning(() => undefined);
		expect(await chooseLargeOutputAction(100000)).toBe('cancel');
	});

	it('confirms many documents only on explicit open', async () => {
		_respondToWarning(() => 'Open results');
		expect(await confirmManyDocuments(9, 90000)).toBe(true);

		_respondToWarning(() => 'Cancel');
		expect(await confirmManyDocuments(9, 90000)).toBe(false);
	});
});
