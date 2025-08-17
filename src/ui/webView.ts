import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import type { createTelemetry } from '../telemetry/telemetry'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export const registerHelpWebviewCommand = (
	context: vscode.ExtensionContext,
	telemetry: ReturnType<typeof createTelemetry>,
) =>
	context.subscriptions.push(
		vscode.commands.registerCommand('string-le.help', async () => {
			telemetry.event('command', { name: 'help' })
			const panel = vscode.window.createWebviewPanel(
				'string-le.help',
				localize('runtime.help.title', 'Troubleshooting'),
				vscode.ViewColumn.Active,
				{ enableScripts: false },
			)
			panel.webview.html = html
		}),
	)

const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>String-LE Help</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 1.25rem; line-height: 1.6; }
      h1 { font-size: 1.2rem; margin-bottom: 0.5rem; }
      h2 { font-size: 1.05rem; margin-top: 1.25rem; }
      p, li { font-size: 0.95rem; }
      code { background: rgba(127,127,127,0.15); padding: 0 0.25rem; border-radius: 3px; }
      ul { margin-left: 1rem; }
      .kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(127,127,127,0.15); padding: 0 0.3rem; border-radius: 3px; }
      .small { opacity: 0.9; }
    </style>
  </head>
  <body>
  </body>
  </html>`
