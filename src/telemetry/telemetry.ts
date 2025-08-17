import * as vscode from 'vscode'

export interface Telemetry {
	event(name: string, props?: Record<string, string>): void
}

export function createTelemetry(): Telemetry {
	const channel = vscode.window.createOutputChannel('String-LE')
	function isEnabled(): boolean {
		return Boolean(vscode.workspace.getConfiguration('string-le').get('telemetryEnabled', false))
	}
	return Object.freeze({
		event(name: string, props?: Record<string, string>): void {
			// Telemetry is local-only (Output panel); never sent over the network
			if (!isEnabled()) return
			const time = new Date().toISOString()
			const kv = props ? ` ${JSON.stringify(props)}` : ''
			channel.appendLine(`[${time}] ${name}${kv}`)
		},
	})
}
