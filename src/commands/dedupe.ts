import * as vscode from 'vscode';
import { hasPosition, onValues } from '../utils/positions';
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
	// By string: with positions shown every line is different, and a dedupe
	// over whole lines would remove nothing.
	const dedupedLines = onValues(lines, dedupe);
	const processedContent = joinLines(dedupedLines);

	const success = await processAndOutput(editor, processedContent);

	if (success) {
		showSuccessMessage(lines.some(hasPosition));
	}
}
