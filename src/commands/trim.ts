import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { applyTrimMode, type TrimMode } from '../utils/trim'
import { processAndOutput } from './postProcessHelper'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

async function trimWhitespace(): Promise<void> {
	const editor = vscode.window.activeTextEditor
	if (!editor) {
		return
	}

	const text = editor.document.getText()

	const cfg = vscode.workspace.getConfiguration('string-le')
	const mode = (cfg.get('postProcess.trimMode', 'both') as TrimMode) ?? 'both'

	const trimmedText = text
		.split('\n')
		.map((line) => applyTrimMode(line, mode))
		.join('\n')

	await processAndOutput(editor, trimmedText)

	vscode.window.showInformationMessage(localize('runtime.info.trimmed', 'Trimmed whitespace from selection.'))
}

export function registerTrimWhitespaceCommand(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.commands.registerCommand('string-le.postProcess.trim', trimWhitespace))
}
