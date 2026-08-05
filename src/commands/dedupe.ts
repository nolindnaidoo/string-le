import * as vscode from 'vscode';
import { dedupe } from '../utils/text';
import {
	extractLines,
	joinLines,
	showNoEditorWarning,
	showSuccessMessage,
} from './editorLines';
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
