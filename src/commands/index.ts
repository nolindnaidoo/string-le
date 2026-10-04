import type * as vscode from 'vscode';
import type { Telemetry } from '../telemetry/telemetry';
import type { Notifier } from '../ui/notifier';
import type { RatingPrompt } from '../ui/ratingPrompt';
import type { StatusBar } from '../ui/statusBar';
import { registerDedupeCommand } from './dedupe';
import { registerExtractStringsCommand } from './extract';
import { registerExtractWorkspaceCommands } from './extractWorkspace';
import { registerHelpCommand } from './help';
import { registerSortCommand } from './sort';
import { registerToggleCsvStreamingCommand } from './toggleCsvStreaming';

// Centralized command registration to keep activation thin and testable
export function registerAllCommands(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
		ratingPrompt: RatingPrompt;
	}>,
): void {
	registerExtractStringsCommand(context, deps);
	registerExtractWorkspaceCommands(context, deps);
	registerDedupeCommand(context);
	registerSortCommand(context);
	registerToggleCsvStreamingCommand(context);
	registerHelpCommand(context, deps);
}
