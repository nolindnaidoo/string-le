import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import type { SortMode } from '../utils/text'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export function readConfig(): StringLeConfig {
	const cfg = vscode.workspace.getConfiguration('string-le')
	const dedupeEnabled = Boolean(cfg.get('dedupeEnabled', false))
	const sortEnabled = Boolean(cfg.get('sortEnabled', false))
	const sortModeRaw = cfg.get('sortMode', 'off')
	const sortMode = isValidSortMode(sortModeRaw) ? sortModeRaw : 'off'
	const showParseErrors = Boolean(cfg.get('showParseErrors', false))
	const openInNewFile = Boolean(cfg.get('postProcess.openInNewFile', false))
	const openResultsSideBySide = Boolean(cfg.get('openResultsSideBySide', false))
	const telemetryEnabled = Boolean(cfg.get('telemetryEnabled', false))
	const copyToClipboardEnabled = Boolean(cfg.get('copyToClipboardEnabled', false))
	const notifRaw = cfg.get('notificationsLevel', 'all')
	const notificationsLevel = isValidNotificationLevel(notifRaw) ? notifRaw : 'all'
	const statusBarEnabled = Boolean(cfg.get('statusBar.enabled', true))
	const safetyEnabled = Boolean(cfg.get('safety.enabled', true))
	const fileSizeWarnBytes = Math.max(0, Number(cfg.get('safety.fileSizeWarnBytes', 1_000_000)))
	const largeOutputLinesThreshold = Math.max(0, Number(cfg.get('safety.largeOutputLinesThreshold', 50_000)))
	const manyDocumentsThreshold = Math.max(0, Number(cfg.get('safety.manyDocumentsThreshold', 8)))
	const csvStreamingEnabled = Boolean(cfg.get('csv.streamingEnabled', false))
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
	})
}

export type NotificationLevel = 'all' | 'important' | 'silent'

export function isValidSortMode(v: unknown): v is SortMode {
	return v === 'off' || v === 'alpha-asc' || v === 'alpha-desc' || v === 'length-asc' || v === 'length-desc'
}

export function isValidNotificationLevel(v: unknown): v is NotificationLevel {
	return v === 'all' || v === 'important' || v === 'silent'
}

export type StringLeConfig = Readonly<{
	dedupeEnabled: boolean
	sortEnabled: boolean
	sortMode: SortMode
	showParseErrors: boolean
	openInNewFile: boolean
	openResultsSideBySide: boolean
	telemetryEnabled: boolean
	copyToClipboardEnabled: boolean
	notificationsLevel: NotificationLevel
	statusBarEnabled: boolean
	safetyEnabled: boolean
	fileSizeWarnBytes: number
	largeOutputLinesThreshold: number
	manyDocumentsThreshold: number
	csvStreamingEnabled: boolean
}>

void localize
