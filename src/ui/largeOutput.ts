import * as vscode from 'vscode';

export type LargeOutputAction = 'open' | 'copy' | 'cancel';

export async function chooseLargeOutputAction(
	count: number,
	hasContextualNotes = false,
): Promise<LargeOutputAction> {
	// Enhanced warning with contextual notes
	const baseMessage = `Detected ${count} strings. Opening large results may freeze the editor. What would you like to do?`;
	const notes = hasContextualNotes
		? [
				'',
				'Notes:',
				'• Multi‑line strings may render differently across formats',
				'• CSV streaming/editor-first (no auto‑copy)',
				'• Dedupe/Sort apply to final strings only',
			].join('\n')
		: '';

	const fullMessage = notes ? `${baseMessage}\n${notes}` : baseMessage;

	const choice = await vscode.window.showWarningMessage(
		fullMessage,
		{ modal: true },
		'Open results',
		'Copy only',
		'Cancel',
	);
	if (!choice || choice === 'Cancel') return 'cancel';
	if (choice === 'Copy only') return 'copy';
	return 'open';
}

export async function confirmManyDocuments(
	countDocs: number,
	totalLines: number,
): Promise<boolean> {
	const choice = await vscode.window.showWarningMessage(
		`Many results — opening ${countDocs} documents (~${totalLines} total lines). Proceed?`,
		{ modal: true },
		'Open results',
		'Cancel',
	);
	return choice === 'Open results';
}
