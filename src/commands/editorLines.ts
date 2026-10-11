import * as vscode from 'vscode';
import { createNotifier } from '../ui/notifier';

/**
 * Line helpers shared by the in-place commands (sort, dedupe).
 *
 * Both commands carried their own byte-identical copy of all four of these.
 *
 * The notifications now route through the notifier rather than calling
 * `vscode.window.show*Message` directly. The notifier exists precisely so
 * `string-le.notificationsLevel` governs what appears — its own documentation
 * says "all user notifications route through here" — but sort and dedupe went
 * around it, so a user who had chosen `silent` was still notified by them.
 */

/** A document's lines, and whether a newline ended the last of them. */
export type DocumentLines = Readonly<{
	lines: readonly string[];
	terminated: boolean;
}>;

export function extractLines(editor: vscode.TextEditor): DocumentLines {
	const text = editor.document.getText();
	// A trailing newline ends the last line; it is not an empty line after
	// it. Split as one more line, it sorted to the top of the document.
	const terminated = /\r?\n$/.test(text);
	const body = terminated ? text.replace(/\r?\n$/, '') : text;
	// Split on CRLF as well as LF: the document may have either, and joining
	// with '\n' afterwards is what normalises the result.
	return { lines: body.split(/\r?\n/), terminated };
}

export function joinLines(
	document: DocumentLines,
	lines: readonly string[],
): string {
	return lines.join('\n') + (document.terminated ? '\n' : '');
}

export function showNoEditorWarning(): void {
	createNotifier().warn(vscode.l10n.t('No active editor'));
}

/**
 * `firstPositionOnly` is for a dedupe over lines that show positions: a
 * string found five times has five, and only the first can stay.
 */
export function showSuccessMessage(firstPositionOnly = false): void {
	const applied = vscode.l10n.t('Dedupe/sort applied');
	createNotifier().info(
		firstPositionOnly
			? `${applied}. ${vscode.l10n.t('Each value shows its first position only.')}`
			: applied,
	);
}
