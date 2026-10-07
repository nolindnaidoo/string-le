import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_EXCLUDED_FILES,
	DEFAULT_EXCLUDED_FOLDERS,
	DEFAULT_EXCLUDED_PATHS,
} from '../workspace/defaults';
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
		'string-le.clipboardIncludesPositions': 'clipboardIncludesPositions',
		'string-le.copyToClipboardEnabled': 'copyToClipboardEnabled',
		'string-le.csv.streamingEnabled': 'csvStreamingEnabled',
		'string-le.dedupeEnabled': 'dedupeEnabled',
		'string-le.fallback.multiline': 'fallbackMultiline',
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
		'string-le.showPositions': 'showPositions',
		'string-le.statusBar.enabled': 'statusBarEnabled',
		'string-le.telemetryEnabled': 'telemetryEnabled',
		'string-le.workspace.scanAlwaysInclude': 'workspaceScanAlwaysInclude',
		'string-le.workspace.scanExcludes': 'workspaceScanExcludes',
		'string-le.workspace.scanMaxFiles': 'workspaceScanMaxFiles',
		'string-le.workspace.scanMaxResults': 'workspaceScanMaxResults',
		'string-le.workspace.scanPatterns': 'workspaceScanPatterns',
		'string-le.workspace.scanRespectGitignore': 'workspaceScanRespectGitignore',
		'string-le.workspace.scanSkipBinaryFiles': 'workspaceScanSkipBinaryFiles',
		'string-le.workspace.scanUseDefaultExcludes':
			'workspaceScanUseDefaultExcludes',
	};

	it('covers every declared setting', () => {
		expect(Object.keys(props).sort()).toEqual(Object.keys(KEY_MAP).sort());
	});

	for (const [manifestKey, defaultsKey] of Object.entries(KEY_MAP)) {
		it(`${manifestKey} default matches`, () => {
			expect(CONFIG_DEFAULTS[defaultsKey]).toEqual(props[manifestKey]?.default);
		});
	}
});

describe('the README states the scan limits the code uses', () => {
	const readme = readFileSync(join(__dirname, '..', '..', 'README.md'), 'utf8');
	// Grouped by hand, not by Intl. The first Intl call in a process loads its
	// locale data, and on a Windows runner that once took sixteen seconds
	// inside a test that only compares two strings.
	const grouped = (n: number) =>
		String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

	it('in the settings table', () => {
		expect(readme).toContain(
			`| \`string-le.workspace.scanMaxFiles\` | \`${CONFIG_DEFAULTS.workspaceScanMaxFiles}\` |`,
		);
		expect(readme).toContain(
			`| \`string-le.workspace.scanMaxResults\` | \`${CONFIG_DEFAULTS.workspaceScanMaxResults}\` |`,
		);
	});

	it('in the prose', () => {
		expect(readme).toContain(
			`It stops at ${grouped(CONFIG_DEFAULTS.workspaceScanMaxFiles)} files or ${grouped(CONFIG_DEFAULTS.workspaceScanMaxResults)} listed occurrences.`,
		);
	});
});

describe('the README lists the folders a scan skips', () => {
	it('exactly as the code has them', () => {
		const readme = readFileSync(
			join(__dirname, '..', '..', 'README.md'),
			'utf8',
		);
		const listed =
			/<!-- built-in-folders -->\n(.*)\n<!-- \/built-in-folders -->/
				.exec(readme)?.[1]
				?.split(', ')
				.map((entry) => entry.replace(/`/g, ''));
		expect(listed).toEqual([...DEFAULT_EXCLUDED_FOLDERS, '*.egg-info']);
	});

	it('and the files, exactly as the code has them', () => {
		const readme = readFileSync(
			join(__dirname, '..', '..', 'README.md'),
			'utf8',
		);
		const listed = /<!-- built-in-files -->\n(.*)\n<!-- \/built-in-files -->/
			.exec(readme)?.[1]
			?.split(', ')
			.map((entry) => entry.replace(/`/g, ''));
		expect(listed).toEqual([
			...DEFAULT_EXCLUDED_FILES,
			...DEFAULT_EXCLUDED_PATHS,
		]);
	});
});
