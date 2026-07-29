import * as vscode from 'vscode';
import { readConfig } from '../config/config';

/**
 * Shared helper for post-processing commands (dedupe, sort).
 * Handles the "open in new file vs in-place edit" logic consistently.
 * Returns true on success, false on failure.
 */
export async function processAndOutput(
	editor: vscode.TextEditor,
	processedContent: string,
): Promise<boolean> {
	const config = readConfig();

	if (config.openInNewFile) {
		return await openInNewDocument(
			processedContent,
			config.openResultsSideBySide,
		);
	}

	return await replaceInPlace(editor, processedContent);
}

async function openInNewDocument(
	content: string,
	openSideBySide: boolean,
): Promise<boolean> {
	try {
		const document = await vscode.workspace.openTextDocument({
			content,
			language: 'plaintext',
		});

		const options = buildShowOptions(openSideBySide);
		await vscode.window.showTextDocument(document, options);

		return true;
	} catch (error) {
		showOpenDocumentError(error);
		return false;
	}
}

function buildShowOptions(
	openSideBySide: boolean,
): vscode.TextDocumentShowOptions {
	const options: vscode.TextDocumentShowOptions = {};

	if (openSideBySide) {
		options.viewColumn = vscode.ViewColumn.Beside;
	}

	return options;
}

async function replaceInPlace(
	editor: vscode.TextEditor,
	content: string,
): Promise<boolean> {
	try {
		const success = await editor.edit((editBuilder) => {
			const fullRange = buildFullDocumentRange(editor);
			editBuilder.replace(fullRange, content);
		});

		if (!success) {
			showEditRejectedError();
			return false;
		}

		return true;
	} catch (error) {
		showEditError(error);
		return false;
	}
}

function buildFullDocumentRange(editor: vscode.TextEditor): vscode.Range {
	const document = editor.document;
	const startPosition = document.positionAt(0);
	const endPosition = document.positionAt(document.getText().length);

	return new vscode.Range(startPosition, endPosition);
}

function showOpenDocumentError(error: unknown): void {
	const message = error instanceof Error ? error.message : 'Unknown error';
	vscode.window.showErrorMessage(`Failed to open new document: ${message}`);
}

function showEditRejectedError(): void {
	vscode.window.showErrorMessage(
		'Failed to edit document: edit was rejected. The document may be read-only or no longer valid.',
	);
}

function showEditError(error: unknown): void {
	const message = error instanceof Error ? error.message : 'Unknown error';
	vscode.window.showErrorMessage(`Failed to edit document: ${message}`);
}
