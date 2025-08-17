import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export interface StatusBar {
	flash(text: string): void
}

export function createStatusBar(context: vscode.ExtensionContext): StatusBar {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
	item.text = '$(quote) String-LE'
	item.tooltip = localize('runtime.status.tooltip', 'Run String-LE: Extract')
	item.command = 'string-le.extractStrings'
	context.subscriptions.push(item)
	function updateVisibility(): void {
		const enabled = Boolean(vscode.workspace.getConfiguration('string-le').get('statusBar.enabled', true))
		if (enabled) item.show()
		else item.hide()
		const csvStreaming = Boolean(vscode.workspace.getConfiguration('string-le').get('csv.streamingEnabled', false))
		item.text = csvStreaming ? '$(quote) String-LE (CSV Streaming)' : '$(quote) String-LE'
	}
	updateVisibility()
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (
				e.affectsConfiguration('string-le.statusBar.enabled') ||
				e.affectsConfiguration('string-le.csv.streamingEnabled')
			) {
				updateVisibility()
			}
		}),
	)
	let hideTimer: NodeJS.Timeout | undefined

	// Clean up timer on deactivation
	context.subscriptions.push({
		dispose(): void {
			if (hideTimer) {
				clearTimeout(hideTimer)
				hideTimer = undefined
			}
		},
	})

	return Object.freeze({
		flash(text: string): void {
			// Flash a short-lived status text without spamming notifications
			if (!vscode.workspace.getConfiguration('string-le').get('statusBar.enabled', true)) return
			item.text = `$(quote) ${text}`
			if (hideTimer) clearTimeout(hideTimer)
			hideTimer = setTimeout(() => {
				const csvStreaming = Boolean(vscode.workspace.getConfiguration('string-le').get('csv.streamingEnabled', false))
				item.text = csvStreaming ? '$(quote) String-LE (CSV Streaming)' : '$(quote) String-LE'
			}, 2000)
		},
	})
}
