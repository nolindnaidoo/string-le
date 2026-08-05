import * as vscode from 'vscode';
import { createNotifier } from '../ui/notifier';

export function registerToggleCsvStreamingCommand(
	context: vscode.ExtensionContext,
): void {
	const command = vscode.commands.registerCommand(
		'string-le.csv.toggleStreaming',
		executeToggleCsvStreaming,
	);

	context.subscriptions.push(command);
}

async function executeToggleCsvStreaming(): Promise<void> {
	const config = vscode.workspace.getConfiguration('string-le');
	const isCurrentlyEnabled = readStreamingEnabled(config);
	const newValue = !isCurrentlyEnabled;

	await updateStreamingEnabled(config, newValue);
	showToggleMessage(newValue);
}

function readStreamingEnabled(config: vscode.WorkspaceConfiguration): boolean {
	return Boolean(config.get('csv.streamingEnabled', false));
}

async function updateStreamingEnabled(
	config: vscode.WorkspaceConfiguration,
	enabled: boolean,
): Promise<void> {
	await config.update(
		'csv.streamingEnabled',
		enabled,
		vscode.ConfigurationTarget.Global,
	);
}

function showToggleMessage(enabled: boolean): void {
	// Through the notifier so `string-le.notificationsLevel` governs it; this
	// called vscode.window directly and so ignored a `silent` preference.
	const message = enabled
		? vscode.l10n.t('CSV streaming enabled')
		: vscode.l10n.t('CSV streaming disabled');

	createNotifier().info(message);
}
