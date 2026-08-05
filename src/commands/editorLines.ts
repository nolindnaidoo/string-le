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

export function extractLines(editor: vscode.TextEditor): readonly string[] {
	// Split on CRLF as well as LF: the document may have either, and joining
	// with '\n' afterwards is what normalises the result.
	return editor.document.getText().split(/\r?\n/);
}

export function joinLines(lines: readonly string[]): string {
	return lines.join('\n');
}

export function showNoEditorWarning(): void {
	createNotifier().warn(vscode.l10n.t('No active editor'));
}

export function showSuccessMessage(): void {
	createNotifier().info(vscode.l10n.t('Dedupe/sort applied'));
}
