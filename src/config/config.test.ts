import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_DEFAULTS } from './config';

/**
 * CONFIG_DEFAULTS must stay identical to the defaults declared in
 * package.json contributes.configuration — v1.x shipped with the two
 * silently disagreeing (openInNewFile, openResultsSideBySide, and
 * notificationsLevel all drifted).
 */
describe('config defaults parity with package.json', () => {
	const manifest = JSON.parse(
		readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
	) as {
		contributes: {
			configuration: { properties: Record<string, { default: unknown }> };
		};
	};
	const props = manifest.contributes.configuration.properties;

	const KEY_MAP: Record<string, keyof typeof CONFIG_DEFAULTS> = {
		'string-le.copyToClipboardEnabled': 'copyToClipboardEnabled',
		'string-le.csv.streamingEnabled': 'csvStreamingEnabled',
		'string-le.dedupeEnabled': 'dedupeEnabled',
		'string-le.notificationsLevel': 'notificationsLevel',
		'string-le.postProcess.openInNewFile': 'openInNewFile',
		'string-le.openResultsSideBySide': 'openResultsSideBySide',
		'string-le.safety.enabled': 'safetyEnabled',
		'string-le.safety.fileSizeWarnBytes': 'fileSizeWarnBytes',
		'string-le.safety.largeOutputLinesThreshold': 'largeOutputLinesThreshold',
		'string-le.safety.manyDocumentsThreshold': 'manyDocumentsThreshold',
		'string-le.showParseErrors': 'showParseErrors',
		'string-le.sortEnabled': 'sortEnabled',
		'string-le.sortMode': 'sortMode',
		'string-le.statusBar.enabled': 'statusBarEnabled',
		'string-le.telemetryEnabled': 'telemetryEnabled',
	};

	it('covers every declared setting', () => {
		expect(Object.keys(props).sort()).toEqual(Object.keys(KEY_MAP).sort());
	});

	for (const [manifestKey, defaultsKey] of Object.entries(KEY_MAP)) {
		it(`${manifestKey} default matches`, () => {
			expect(CONFIG_DEFAULTS[defaultsKey]).toBe(props[manifestKey]?.default);
		});
	}
});
