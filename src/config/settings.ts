import * as vscode from 'vscode';
import { guarded } from '../commands/guard';
import type { createTelemetry } from '../telemetry/telemetry';
import { createNotifier } from '../ui/notifier';

// Command to navigate users directly to String-LE settings
export function registerOpenSettingsCommand(
	context: vscode.ExtensionContext,
	telemetry: ReturnType<typeof createTelemetry>,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'string-le.openSettings',
			guarded(createNotifier(), async () => {
				telemetry.event('command', { name: 'openSettings' });
				// Open Settings UI filtered by exact setting prefix to avoid unrelated matches
				await vscode.commands.executeCommand(
					'workbench.action.openSettings',
					'string-le.',
				);
			}),
		),
	);
}
