import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export function registerToggleCsvStreamingCommand(context: vscode.ExtensionContext): void {
	const disposable = vscode.commands.registerCommand('string-le.csv.toggleStreaming', async (): Promise<void> => {
		const cfg = vscode.workspace.getConfiguration('string-le')
		const current = Boolean(cfg.get('csv.streamingEnabled', false))
		await cfg.update('csv.streamingEnabled', !current, vscode.ConfigurationTarget.Global)
		const msg = !current
			? localize('runtime.csv.streaming.enabled', 'CSV streaming enabled')
			: localize('runtime.csv.streaming.disabled', 'CSV streaming disabled')
		;(require('vscode') as typeof import('vscode')).window.showInformationMessage(msg)
	})
	context.subscriptions.push(disposable)
}

void localize
