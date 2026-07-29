import * as vscode from 'vscode';
import type { SortMode } from '../utils/text';

export function readConfig(): StringLeConfig {
	const cfg = vscode.workspace.getConfiguration('string-le');
	const dedupeEnabled = Boolean(cfg.get('dedupeEnabled', false));
	const sortEnabled = Boolean(cfg.get('sortEnabled', false));
	const sortModeRaw = cfg.get('sortMode', 'off');
	const sortMode = isValidSortMode(sortModeRaw) ? sortModeRaw : 'off';
	const showParseErrors = Boolean(cfg.get('showParseErrors', false));
	const openInNewFile = Boolean(cfg.get('postProcess.openInNewFile', false));
	const openResultsSideBySide = Boolean(
		cfg.get('openResultsSideBySide', false),
	);
	const telemetryEnabled = Boolean(cfg.get('telemetryEnabled', false));
	const copyToClipboardEnabled = Boolean(
		cfg.get('copyToClipboardEnabled', false),
	);
	const notifRaw = cfg.get('notificationsLevel', 'all');
	const notificationsLevel = isValidNotificationLevel(notifRaw)
		? notifRaw
		: 'all';
	const statusBarEnabled = Boolean(cfg.get('statusBar.enabled', true));
	const safetyEnabled = Boolean(cfg.get('safety.enabled', true));
	const fileSizeWarnBytes = Math.max(
		0,
		Number(cfg.get('safety.fileSizeWarnBytes', 1_000_000)),
	);
	const largeOutputLinesThreshold = Math.max(
		0,
		Number(cfg.get('safety.largeOutputLinesThreshold', 50_000)),
	);
	const manyDocumentsThreshold = Math.max(
		0,
		Number(cfg.get('safety.manyDocumentsThreshold', 8)),
	);
	const csvStreamingEnabled = Boolean(cfg.get('csv.streamingEnabled', false));
	const performanceEnabled = Boolean(cfg.get('performance.enabled', true));
	const performanceMaxDuration = Math.max(
		1000,
		Number(cfg.get('performance.maxDuration', 5000)),
	);
	const performanceMaxMemoryUsage = Math.max(
		1048576,
		Number(cfg.get('performance.maxMemoryUsage', 104857600)),
	);
	const performanceMaxCpuUsage = Math.max(
		100000,
		Number(cfg.get('performance.maxCpuUsage', 1000000)),
	);
	const performanceMinThroughput = Math.max(
		100,
		Number(cfg.get('performance.minThroughput', 1000)),
	);
	const performanceMaxCacheSize = Math.max(
		100,
		Number(cfg.get('performance.maxCacheSize', 1000)),
	);
	// Freeze to communicate immutability to consumers
	return Object.freeze({
		dedupeEnabled,
		sortEnabled,
		sortMode,
		showParseErrors,
		openInNewFile,
		openResultsSideBySide,
		telemetryEnabled,
		copyToClipboardEnabled,
		notificationsLevel,
		statusBarEnabled,
		safetyEnabled,
		fileSizeWarnBytes,
		largeOutputLinesThreshold,
		manyDocumentsThreshold,
		csvStreamingEnabled,
		performanceEnabled,
		performanceMaxDuration,
		performanceMaxMemoryUsage,
		performanceMaxCpuUsage,
		performanceMinThroughput,
		performanceMaxCacheSize,
	});
}

export type NotificationLevel = 'all' | 'important' | 'silent';

export function isValidSortMode(value: unknown): value is SortMode {
	const validModes: readonly SortMode[] = [
		'off',
		'alpha-asc',
		'alpha-desc',
		'length-asc',
		'length-desc',
	];

	return validModes.includes(value as SortMode);
}

export function isValidNotificationLevel(
	value: unknown,
): value is NotificationLevel {
	const validLevels: readonly NotificationLevel[] = [
		'all',
		'important',
		'silent',
	];

	return validLevels.includes(value as NotificationLevel);
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
	performanceEnabled: boolean;
	performanceMaxDuration: number;
	performanceMaxMemoryUsage: number;
	performanceMaxCpuUsage: number;
	performanceMinThroughput: number;
	performanceMaxCacheSize: number;
}>;
