import * as vscode from 'vscode';

type NotificationLevel = 'all' | 'important' | 'silent';

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
			showInfo(message);
		},
		warn(message: string): void {
			showWarning(message);
		},
		error(message: string): void {
			showError(message);
		},
		showMultilineRisk(_count: number): void {
			showMultilineRiskMessage();
		},
		showCsvNoCopy(): void {
			showCsvNoCopyMessage();
		},
		showPostProcessInfo(): void {
			showPostProcessInfoMessage();
		},
	});
}

function readNotificationLevel(): NotificationLevel {
	const config = vscode.workspace.getConfiguration('string-le');
	const level = config.get('notificationsLevel', 'all') as NotificationLevel;
	return level ?? 'all';
}

function showInfo(message: string): void {
	const level = readNotificationLevel();

	// Guard: Silent mode
	if (level === 'silent') {
		return;
	}

	// Guard: Important-only mode
	if (level === 'important') {
		return;
	}

	vscode.window.showInformationMessage(message);
}

function showWarning(message: string): void {
	const level = readNotificationLevel();

	// Guard: Silent mode
	if (level === 'silent') {
		return;
	}

	vscode.window.showWarningMessage(message);
}

function showError(message: string): void {
	const level = readNotificationLevel();

	// Guard: Silent mode
	if (level === 'silent') {
		return;
	}

	vscode.window.showErrorMessage(message);
}

function showMultilineRiskMessage(): void {
	const level = readNotificationLevel();

	// Guard: Silent mode
	if (level === 'silent') {
		return;
	}

	// Guard: Important-only mode
	if (level === 'important') {
		return;
	}

	vscode.window.showInformationMessage(
		'Detected multi‑line strings. Rendering and joining may vary by format. Prefer quoted, single‑line strings for stable results.',
	);
}

function showCsvNoCopyMessage(): void {
	const level = readNotificationLevel();

	// Guard: Silent mode
	if (level === 'silent') {
		return;
	}

	// Guard: Important-only mode
	if (level === 'important') {
		return;
	}

	vscode.window.showInformationMessage(
		"CSV results aren't auto‑copied when streaming or extracting all columns. Use the editor output or Copy manually.",
	);
}

function showPostProcessInfoMessage(): void {
	const level = readNotificationLevel();

	// Guard: Silent mode
	if (level === 'silent') {
		return;
	}

	// Guard: Important-only mode
	if (level === 'important') {
		return;
	}

	vscode.window.showInformationMessage(
		"Sorting and deduping operate on final strings, not structured positions. Structural order/indices aren't preserved.",
	);
}
