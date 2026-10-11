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
	_statusBarItems,
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

	const IDLE = '$(quote) String-LE';

	it('shows by default, flashes text, and restores it after two seconds', () => {
		// The old test advanced the clock and then asserted only that
		// something had been subscribed, which a bar that never showed or
		// never flashed would also pass.
		vi.useFakeTimers();
		try {
			const statusBar = createStatusBar(_createExtensionContext() as never);
			const item = _statusBarItems()[0];
			expect(item?.visible).toBe(true);
			expect(item?.text).toBe(IDLE);

			statusBar.flash('Extracted 3');
			expect(item?.text).toBe('$(quote) Extracted 3');
			vi.advanceTimersByTime(1999);
			expect(item?.text).toBe('$(quote) Extracted 3');
			vi.advanceTimersByTime(1);
			expect(item?.text).toBe(IDLE);
		} finally {
			vi.useRealTimers();
		}
	});

	it('a second flash replaces the first and restarts the clock', () => {
		vi.useFakeTimers();
		try {
			const statusBar = createStatusBar(_createExtensionContext() as never);
			const item = _statusBarItems()[0];
			statusBar.flash('Extracted 3');
			vi.advanceTimersByTime(1500);
			statusBar.flash('Copied to clipboard');
			vi.advanceTimersByTime(1500);
			expect(item?.text).toBe('$(quote) Copied to clipboard');
			vi.advanceTimersByTime(500);
			expect(item?.text).toBe(IDLE);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('hides when statusBar.enabled turns off, and flashes nothing while hidden', () => {
		vi.useFakeTimers();
		try {
			const statusBar = createStatusBar(_createExtensionContext() as never);
			const item = _statusBarItems()[0];
			_setConfig('string-le.statusBar.enabled', false);
			_fireConfigChange('string-le.statusBar.enabled');
			expect(item?.visible).toBe(false);
			statusBar.flash('Extracted 3');
			expect(item?.text).toBe(IDLE);
			expect(vi.getTimerCount()).toBe(0);

			_setConfig('string-le.statusBar.enabled', true);
			_fireConfigChange('string-le.statusBar.enabled');
			expect(item?.visible).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('names CSV streaming in the idle text while it is on', () => {
		createStatusBar(_createExtensionContext() as never);
		const item = _statusBarItems()[0];
		_setConfig('string-le.csv.streamingEnabled', true);
		_fireConfigChange('string-le.csv.streamingEnabled');
		expect(item?.text).toBe('$(quote) String-LE (CSV Streaming)');
		_setConfig('string-le.csv.streamingEnabled', false);
		_fireConfigChange('string-le.csv.streamingEnabled');
		expect(item?.text).toBe(IDLE);
	});

	it('ignores a configuration change that is not its own', () => {
		createStatusBar(_createExtensionContext() as never);
		const item = _statusBarItems()[0];
		_setConfig('string-le.statusBar.enabled', false);
		_fireConfigChange('editor.fontSize');
		expect(item?.visible).toBe(true);
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
