import * as vscode from 'vscode';
import { type SortMode, sortStrings } from '../utils/text';
import {
	extractLines,
	joinLines,
	showNoEditorWarning,
	showSuccessMessage,
} from './editorLines';
import { processAndOutput } from './postProcessHelper';

type SortOption = Readonly<{
	label: string;
	mode: SortMode;
}>;

// Built per call rather than at module scope: a top-level vscode.l10n.t()
// runs while the bundle is still being required, which resolves the labels
// before the extension activates and is what the runtime bundle gate in
// scripts/check-bundle.js refuses to load.
const sortOptions = (): readonly SortOption[] => [
	{
		label: vscode.l10n.t('Alphabetical (A → Z)'),
		mode: 'alpha-asc',
	},
	{
		label: vscode.l10n.t('Alphabetical (Z → A)'),
		mode: 'alpha-desc',
	},
	{
		label: vscode.l10n.t('By length (short → long)'),
		mode: 'length-asc',
	},
	{
		label: vscode.l10n.t('By length (long → short)'),
		mode: 'length-desc',
	},
];

export function registerSortCommand(context: vscode.ExtensionContext): void {
	const command = vscode.commands.registerCommand(
		'string-le.postProcess.sort',
		executeSort,
	);

	context.subscriptions.push(command);
}

async function executeSort(): Promise<void> {
	const editor = vscode.window.activeTextEditor;

	// Guard: No active editor
	if (!editor) {
		showNoEditorWarning();
		return;
	}

	const sortMode = await promptForSortMode();

	// Guard: User cancelled
	if (!sortMode) {
		return;
	}

	const lines = extractLines(editor);
	const sortedLines = sortStrings(lines, sortMode);
	const processedContent = joinLines(sortedLines);

	const success = await processAndOutput(editor, processedContent);

	if (success) {
		showSuccessMessage();
	}
}

async function promptForSortMode(): Promise<SortMode | undefined> {
	const options = sortOptions();
	const labels = options.map((option) => option.label);

	const picked = await vscode.window.showQuickPick(labels, {
		placeHolder: vscode.l10n.t('Choose sort mode'),
	});

	// Guard: User cancelled
	if (!picked) {
		return undefined;
	}

	return findSortMode(picked);
}

function findSortMode(label: string): SortMode {
	const option = sortOptions().find((opt) => opt.label === label);
	return option?.mode ?? 'alpha-asc';
}
