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
	copyToClipboardEnabled: false,
	csvStreamingEnabled: false,
	dedupeEnabled: false,
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
	statusBarEnabled: true,
	telemetryEnabled: false,
});

export function readConfig(): StringLeConfig {
	const cfg = vscode.workspace.getConfiguration('string-le');

	return Object.freeze({
		dedupeEnabled: readBoolean(
			cfg,
			'dedupeEnabled',
			CONFIG_DEFAULTS.dedupeEnabled,
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
		copyToClipboardEnabled: readBoolean(
			cfg,
			'copyToClipboardEnabled',
			CONFIG_DEFAULTS.copyToClipboardEnabled,
		),
		notificationsLevel: readNotificationLevel(cfg),
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
	sortEnabled: boolean;
	sortMode: SortMode;
	showParseErrors: boolean;
	openInNewFile: boolean;
	openResultsSideBySide: boolean;
	telemetryEnabled: boolean;
	copyToClipboardEnabled: boolean;
	notificationsLevel: NotificationLevel;
	statusBarEnabled: boolean;
	safetyEnabled: boolean;
	fileSizeWarnBytes: number;
	largeOutputLinesThreshold: number;
	manyDocumentsThreshold: number;
	csvStreamingEnabled: boolean;
}>;
