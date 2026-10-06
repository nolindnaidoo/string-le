import * as vscode from 'vscode';
import type { SortMode } from '../utils/text';

/**
 * The defaults, exported for the parity gate.
 *
 * Nothing else imports this: `config.test.ts` asserts it matches every
 * default declared in package.json, which is the invariant that stops the
 * two drifting apart. The export is the seam that test needs.
 */
export const CONFIG_DEFAULTS = Object.freeze({
	clipboardIncludesPositions: false,
	copyToClipboardEnabled: false,
	csvStreamingEnabled: false,
	dedupeEnabled: false,
	fallbackMultiline: false,
	notificationsLevel: 'silent' as const,
	openInNewFile: true,
	openResultsSideBySide: true,
	safetyEnabled: true,
	fileSizeWarnBytes: 1_000_000,
	largeOutputLinesThreshold: 50_000,
	manyDocumentsThreshold: 8,
	showParseErrors: false,
	sortEnabled: false,
	sortMode: 'off' as const,
	showPositions: false,
	statusBarEnabled: true,
	telemetryEnabled: false,
	workspaceScanAlwaysInclude: Object.freeze([]) as readonly string[],
	workspaceScanExcludes: Object.freeze([]) as readonly string[],
	workspaceScanMaxFiles: 5000,
	workspaceScanMaxResults: 10000,
	workspaceScanPatterns: Object.freeze(['**/*']) as readonly string[],
	workspaceScanRespectGitignore: true,
	workspaceScanSkipBinaryFiles: true,
	workspaceScanUseDefaultExcludes: true,
});

export function readConfig(): StringLeConfig {
	const cfg = vscode.workspace.getConfiguration('string-le');

	return Object.freeze({
		dedupeEnabled: readBoolean(
			cfg,
			'dedupeEnabled',
			CONFIG_DEFAULTS.dedupeEnabled,
		),
		fallbackMultiline: readBoolean(
			cfg,
			'fallback.multiline',
			CONFIG_DEFAULTS.fallbackMultiline,
		),
		sortEnabled: readBoolean(cfg, 'sortEnabled', CONFIG_DEFAULTS.sortEnabled),
		sortMode: readSortMode(cfg),
		showParseErrors: readBoolean(
			cfg,
			'showParseErrors',
			CONFIG_DEFAULTS.showParseErrors,
		),
		openInNewFile: readBoolean(
			cfg,
			'postProcess.openInNewFile',
			CONFIG_DEFAULTS.openInNewFile,
		),
		openResultsSideBySide: readBoolean(
			cfg,
			'openResultsSideBySide',
			CONFIG_DEFAULTS.openResultsSideBySide,
		),
		telemetryEnabled: readBoolean(
			cfg,
			'telemetryEnabled',
			CONFIG_DEFAULTS.telemetryEnabled,
		),
		workspaceScanAlwaysInclude: readStrings(
			cfg,
			'workspace.scanAlwaysInclude',
			CONFIG_DEFAULTS.workspaceScanAlwaysInclude,
		),
		workspaceScanExcludes: readStrings(
			cfg,
			'workspace.scanExcludes',
			CONFIG_DEFAULTS.workspaceScanExcludes,
		),
		workspaceScanMaxFiles: readNumber(
			cfg,
			'workspace.scanMaxFiles',
			CONFIG_DEFAULTS.workspaceScanMaxFiles,
			1,
		),
		workspaceScanMaxResults: readNumber(
			cfg,
			'workspace.scanMaxResults',
			CONFIG_DEFAULTS.workspaceScanMaxResults,
			1,
		),
		workspaceScanPatterns: readStrings(
			cfg,
			'workspace.scanPatterns',
			CONFIG_DEFAULTS.workspaceScanPatterns,
		),
		workspaceScanRespectGitignore: readBoolean(
			cfg,
			'workspace.scanRespectGitignore',
			CONFIG_DEFAULTS.workspaceScanRespectGitignore,
		),
		workspaceScanSkipBinaryFiles: readBoolean(
			cfg,
			'workspace.scanSkipBinaryFiles',
			CONFIG_DEFAULTS.workspaceScanSkipBinaryFiles,
		),
		workspaceScanUseDefaultExcludes: readBoolean(
			cfg,
			'workspace.scanUseDefaultExcludes',
			CONFIG_DEFAULTS.workspaceScanUseDefaultExcludes,
		),
		clipboardIncludesPositions: readBoolean(
			cfg,
			'clipboardIncludesPositions',
			CONFIG_DEFAULTS.clipboardIncludesPositions,
		),
		copyToClipboardEnabled: readBoolean(
			cfg,
			'copyToClipboardEnabled',
			CONFIG_DEFAULTS.copyToClipboardEnabled,
		),
		notificationsLevel: readNotificationLevel(cfg),
		showPositions: readBoolean(
			cfg,
			'showPositions',
			CONFIG_DEFAULTS.showPositions,
		),
		statusBarEnabled: readBoolean(
			cfg,
			'statusBar.enabled',
			CONFIG_DEFAULTS.statusBarEnabled,
		),
		safetyEnabled: readBoolean(
			cfg,
			'safety.enabled',
			CONFIG_DEFAULTS.safetyEnabled,
		),
		fileSizeWarnBytes: readNumber(
			cfg,
			'safety.fileSizeWarnBytes',
			CONFIG_DEFAULTS.fileSizeWarnBytes,
			1000,
		),
		largeOutputLinesThreshold: readNumber(
			cfg,
			'safety.largeOutputLinesThreshold',
			CONFIG_DEFAULTS.largeOutputLinesThreshold,
			100,
		),
		manyDocumentsThreshold: readNumber(
			cfg,
			'safety.manyDocumentsThreshold',
			CONFIG_DEFAULTS.manyDocumentsThreshold,
			1,
		),
		csvStreamingEnabled: readBoolean(
			cfg,
			'csv.streamingEnabled',
			CONFIG_DEFAULTS.csvStreamingEnabled,
		),
	});
}

function readStrings(
	config: vscode.WorkspaceConfiguration,
	key: string,
	defaultValue: readonly string[],
): readonly string[] {
	const value = config.get<unknown>(key, defaultValue);
	return Object.freeze(
		Array.isArray(value)
			? value.filter((item): item is string => typeof item === 'string')
			: [...defaultValue],
	);
}

function readBoolean(
	config: vscode.WorkspaceConfiguration,
	key: string,
	defaultValue: boolean,
): boolean {
	const value = config.get(key, defaultValue);
	return typeof value === 'boolean' ? value : defaultValue;
}

function readNumber(
	config: vscode.WorkspaceConfiguration,
	key: string,
	defaultValue: number,
	minValue: number,
): number {
	const value = Number(config.get(key, defaultValue));
	if (!Number.isFinite(value)) {
		return defaultValue;
	}
	return Math.max(minValue, value);
}

function readSortMode(config: vscode.WorkspaceConfiguration): SortMode {
	const raw = config.get<string>('sortMode', CONFIG_DEFAULTS.sortMode);
	return isValidSortMode(raw) ? raw : CONFIG_DEFAULTS.sortMode;
}

function readNotificationLevel(
	config: vscode.WorkspaceConfiguration,
): NotificationLevel {
	const raw = config.get<string>(
		'notificationsLevel',
		CONFIG_DEFAULTS.notificationsLevel,
	);
	return isValidNotificationLevel(raw)
		? raw
		: CONFIG_DEFAULTS.notificationsLevel;
}

export type NotificationLevel = 'all' | 'important' | 'silent';

export function isValidSortMode(value: unknown): value is SortMode {
	return (
		value === 'off' ||
		value === 'alpha-asc' ||
		value === 'alpha-desc' ||
		value === 'length-asc' ||
		value === 'length-desc'
	);
}

export function isValidNotificationLevel(
	value: unknown,
): value is NotificationLevel {
	return value === 'all' || value === 'important' || value === 'silent';
}

export type StringLeConfig = Readonly<{
	dedupeEnabled: boolean;
	fallbackMultiline: boolean;
	sortEnabled: boolean;
	sortMode: SortMode;
	showParseErrors: boolean;
	openInNewFile: boolean;
	openResultsSideBySide: boolean;
	telemetryEnabled: boolean;
	/** Globs read whatever the excludes and `.gitignore` say. */
	workspaceScanAlwaysInclude: readonly string[];
	/** Globs left out on top of the built-in list. */
	workspaceScanExcludes: readonly string[];
	workspaceScanMaxFiles: number;
	/** The most occurrences one folder scan lists before it stops reading. */
	workspaceScanMaxResults: number;
	workspaceScanPatterns: readonly string[];
	workspaceScanRespectGitignore: boolean;
	workspaceScanSkipBinaryFiles: boolean;
	workspaceScanUseDefaultExcludes: boolean;
	/** Whether the copy on the clipboard carries positions, whatever the screen shows. */
	clipboardIncludesPositions: boolean;
	copyToClipboardEnabled: boolean;
	notificationsLevel: NotificationLevel;
	/** Whether the output gives the line and column of each string. */
	showPositions: boolean;
	statusBarEnabled: boolean;
	safetyEnabled: boolean;
	fileSizeWarnBytes: number;
	largeOutputLinesThreshold: number;
	manyDocumentsThreshold: number;
	csvStreamingEnabled: boolean;
}>;
