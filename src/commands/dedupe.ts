import * as vscode from 'vscode';
import { dedupe } from '../utils/text';
import { processAndOutput } from './postProcessHelper';

export function registerDedupeCommand(context: vscode.ExtensionContext): void {
	const command = vscode.commands.registerCommand(
		'string-le.postProcess.dedupe',
		executeDedupe,
	);

	context.subscriptions.push(command);
}

async function executeDedupe(): Promise<void> {
	const editor = vscode.window.activeTextEditor;

	// Guard: No active editor
	if (!editor) {
		showNoEditorWarning();
		return;
	}

	const lines = extractLines(editor);
	const dedupedLines = dedupe(lines);
	const processedContent = joinLines(dedupedLines);

	const success = await processAndOutput(editor, processedContent);

	if (success) {
		showSuccessMessage();
	}
}

function showNoEditorWarning(): void {
	vscode.window.showWarningMessage('No active editor');
}

function extractLines(editor: vscode.TextEditor): readonly string[] {
	return editor.document.getText().split(/\r?\n/);
}

function joinLines(lines: readonly string[]): string {
	return lines.join('\n');
}

function showSuccessMessage(): void {
	vscode.window.showInformationMessage('Dedupe/sort applied');
}
