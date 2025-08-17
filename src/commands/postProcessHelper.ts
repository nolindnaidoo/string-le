import * as vscode from 'vscode'

/**
 * Shared helper for post-processing commands (dedupe, sort)
 * Handles the "open in new file vs in-place edit" logic consistently
 */
export async function processAndOutput(editor: vscode.TextEditor, processedContent: string): Promise<void> {
	const cfg = vscode.workspace.getConfiguration('string-le')
	const openNew = Boolean(cfg.get('postProcess.openInNewFile', false))
	const openSideBySide = Boolean(cfg.get('openResultsSideBySide', false))

	if (openNew) {
		const doc = await vscode.workspace.openTextDocument({
			content: processedContent,
			language: 'plaintext',
		})
		const options: vscode.TextDocumentShowOptions = {}
		if (openSideBySide) {
			options.viewColumn = vscode.ViewColumn.Beside
		}
		await vscode.window.showTextDocument(doc, options)
		return
	}

	await editor.edit((editBuilder) => {
		const fullRange = new vscode.Range(
			editor.document.positionAt(0),
			editor.document.positionAt(editor.document.getText().length),
		)
		editBuilder.replace(fullRange, processedContent)
	})
}
