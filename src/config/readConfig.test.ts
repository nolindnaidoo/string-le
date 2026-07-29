import { beforeEach, describe, expect, it } from 'vitest';
import { _resetMockState, _setConfig } from '../__mocks__/vscode';
import { CONFIG_DEFAULTS, readConfig } from './config';

describe('readConfig', () => {
	beforeEach(() => {
		_resetMockState();
	});

	it('returns CONFIG_DEFAULTS when nothing is configured', () => {
		expect(readConfig()).toEqual(CONFIG_DEFAULTS);
	});

	it('rejects wrongly-typed booleans', () => {
		_setConfig('string-le.dedupeEnabled', 'yes');
		expect(readConfig().dedupeEnabled).toBe(false);
	});

	it('falls back on non-finite numbers instead of propagating NaN', () => {
		_setConfig('string-le.safety.fileSizeWarnBytes', 'lots');
		expect(readConfig().fileSizeWarnBytes).toBe(
			CONFIG_DEFAULTS.fileSizeWarnBytes,
		);
	});

	it('clamps numbers below the declared minimum', () => {
		_setConfig('string-le.safety.fileSizeWarnBytes', 1);
		expect(readConfig().fileSizeWarnBytes).toBe(1000);
	});

	it('rejects invalid sort modes and notification levels', () => {
		_setConfig('string-le.sortMode', 'by-vibes');
		_setConfig('string-le.notificationsLevel', 'loud');
		const config = readConfig();
		expect(config.sortMode).toBe('off');
		expect(config.notificationsLevel).toBe('silent');
	});

	it('reads valid overrides', () => {
		_setConfig('string-le.sortMode', 'length-desc');
		_setConfig('string-le.notificationsLevel', 'all');
		_setConfig('string-le.csv.streamingEnabled', true);
		const config = readConfig();
		expect(config.sortMode).toBe('length-desc');
		expect(config.notificationsLevel).toBe('all');
		expect(config.csvStreamingEnabled).toBe(true);
	});
});
