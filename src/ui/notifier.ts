import * as vscode from 'vscode';
import { readConfig } from '../config/config';

/**
 * All user notifications route through here so notificationsLevel
 * actually governs them: 'all' shows everything, 'important' shows
 * warnings and errors, 'silent' shows errors only.
 */
export interface Notifier {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	showMultilineRisk(count: number): void;
	showCsvNoCopy(): void;
	showPostProcessInfo(): void;
}

export function createNotifier(): Notifier {
	return Object.freeze({
		info(message: string): void {
			if (readConfig().notificationsLevel === 'all') {
				vscode.window.showInformationMessage(message);
			}
		},
		warn(message: string): void {
			if (readConfig().notificationsLevel !== 'silent') {
				vscode.window.showWarningMessage(message);
			}
		},
		error(message: string): void {
			vscode.window.showErrorMessage(message);
		},
		showMultilineRisk(count: number): void {
			if (readConfig().notificationsLevel === 'all') {
				vscode.window.showInformationMessage(
					`Detected ${count} multi‑line string${count === 1 ? '' : 's'}. Rendering and joining may vary by format. Prefer quoted, single‑line strings for stable results.`,
				);
			}
		},
		showCsvNoCopy(): void {
			if (readConfig().notificationsLevel === 'all') {
				vscode.window.showInformationMessage(
					"CSV results aren't auto‑copied when streaming or extracting all columns. Use the editor output or Copy manually.",
				);
			}
		},
		showPostProcessInfo(): void {
			if (readConfig().notificationsLevel === 'all') {
				vscode.window.showInformationMessage(
					"Sorting and deduping operate on final strings, not structured positions. Structural order/indices aren't preserved.",
				);
			}
		},
	});
}
