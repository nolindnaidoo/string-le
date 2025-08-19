import type * as vscode from 'vscode'
import type { Telemetry } from '../telemetry/telemetry'
import type { Notifier } from '../ui/notifier'
import type { StatusBar } from '../ui/statusBar'
import { registerDedupeCommand } from './dedupe'
import { registerExtractStringsCommand } from './extract'
import { registerSortCommand } from './sort'
import { registerToggleCsvStreamingCommand } from './toggleCsvStreaming'
import { registerTrimWhitespaceCommand } from './trim'

// Centralized command registration to keep activation thin and testable
export function registerAllCommands(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry
		notifier: Notifier
		statusBar: StatusBar
	}>,
): void {
	registerExtractStringsCommand(context, deps)
	registerDedupeCommand(context)
	registerSortCommand(context)
	registerToggleCsvStreamingCommand(context)
	registerTrimWhitespaceCommand(context)
}
