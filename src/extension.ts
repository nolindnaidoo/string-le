import type * as vscode from 'vscode'

import { registerAllCommands } from './commands'
import { registerOpenSettingsCommand } from './config/settings'
import { registerCodeActions } from './providers/codeActions'
import { createTelemetry } from './telemetry/telemetry'
import { createNotifier } from './ui/notifier'
import { createStatusBar } from './ui/statusBar'
import { registerHelpWebviewCommand } from './ui/webView'

export function deactivate(): void {}

export function activate(context: vscode.ExtensionContext): void {
	const telemetry = createTelemetry()
	const notifier = createNotifier()
	const statusBar = createStatusBar(context)

	// Keep activation lean; heavy work runs behind commands and withProgress.
	registerAllCommands(context, { telemetry, notifier, statusBar })
	registerCodeActions(context)
	registerHelpWebviewCommand(context, telemetry)
	registerOpenSettingsCommand(context, telemetry)
}
