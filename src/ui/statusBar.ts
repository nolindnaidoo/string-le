import * as vscode from 'vscode';

const FLASH_DURATION_MS = 2000;

export interface StatusBar {
	flash(text: string): void;
}

export function createStatusBar(context: vscode.ExtensionContext): StatusBar {
	const item = createStatusBarItem();
	context.subscriptions.push(item);

	const state = createStatusBarState();
	setupConfigurationListener(context, item, state);
	setupTimerCleanup(context, state);

	updateStatusBarVisibility(item);

	return Object.freeze({
		flash(text: string): void {
			flashStatusBar(item, text, state);
		},
	});
}

function createStatusBarItem(): vscode.StatusBarItem {
	const item = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100,
	);

	item.text = '$(quote) String-LE';
	item.tooltip = 'Run String-LE: Extract';
	item.command = 'string-le.extractStrings';

	return item;
}

type StatusBarState = {
	disposed: boolean;
	hideTimer: NodeJS.Timeout | undefined;
};

function createStatusBarState(): StatusBarState {
	return {
		disposed: false,
		hideTimer: undefined,
	};
}

function setupConfigurationListener(
	context: vscode.ExtensionContext,
	item: vscode.StatusBarItem,
	state: StatusBarState,
): void {
	context.subscriptions.push(
		{
			dispose(): void {
				state.disposed = true;
			},
		},
		vscode.workspace.onDidChangeConfiguration((event) => {
			// Guard: Already disposed
			if (state.disposed) {
				return;
			}

			if (shouldUpdateVisibility(event)) {
				updateStatusBarVisibility(item);
			}
		}),
	);
}

function shouldUpdateVisibility(
	event: vscode.ConfigurationChangeEvent,
): boolean {
	return (
		event.affectsConfiguration('string-le.statusBar.enabled') ||
		event.affectsConfiguration('string-le.csv.streamingEnabled')
	);
}

function setupTimerCleanup(
	context: vscode.ExtensionContext,
	state: StatusBarState,
): void {
	context.subscriptions.push({
		dispose(): void {
			clearFlashTimer(state);
		},
	});
}

function updateStatusBarVisibility(item: vscode.StatusBarItem): void {
	const config = readStatusBarConfig();

	if (config.enabled) {
		item.show();
	} else {
		item.hide();
	}

	item.text = buildStatusBarText(config.csvStreaming);
}

type StatusBarConfig = Readonly<{
	enabled: boolean;
	csvStreaming: boolean;
}>;

function readStatusBarConfig(): StatusBarConfig {
	const config = vscode.workspace.getConfiguration('string-le');

	return {
		enabled: Boolean(config.get('statusBar.enabled', true)),
		csvStreaming: Boolean(config.get('csv.streamingEnabled', false)),
	};
}

function buildStatusBarText(csvStreaming: boolean): string {
	if (csvStreaming) {
		return '$(quote) String-LE (CSV Streaming)';
	}

	return '$(quote) String-LE';
}

function flashStatusBar(
	item: vscode.StatusBarItem,
	text: string,
	state: StatusBarState,
): void {
	const config = readStatusBarConfig();

	// Guard: Status bar disabled
	if (!config.enabled) {
		return;
	}

	clearFlashTimer(state);
	showFlashText(item, text);
	scheduleRestore(item, state);
}

function clearFlashTimer(state: StatusBarState): void {
	if (state.hideTimer !== undefined) {
		clearTimeout(state.hideTimer);
		state.hideTimer = undefined;
	}
}

function showFlashText(item: vscode.StatusBarItem, text: string): void {
	item.text = `$(quote) ${text}`;
}

function scheduleRestore(
	item: vscode.StatusBarItem,
	state: StatusBarState,
): void {
	state.hideTimer = setTimeout(() => {
		const config = readStatusBarConfig();
		item.text = buildStatusBarText(config.csvStreaming);
		state.hideTimer = undefined;
	}, FLASH_DURATION_MS);
}
