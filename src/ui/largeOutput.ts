import * as vscode from 'vscode';

export type LargeOutputAction = 'open' | 'copy' | 'cancel';

export async function chooseLargeOutputAction(
	count: number,
	hasContextualNotes = false,
): Promise<LargeOutputAction> {
	const baseMessage = vscode.l10n.t(
		'Detected {0} strings. Opening large results may freeze the editor. What would you like to do?',
		count,
	);
	const notes = hasContextualNotes
		? [
				'',
				vscode.l10n.t('Notes:'),
				vscode.l10n.t(
					'• Multi-line strings may render differently across formats',
				),
				vscode.l10n.t('• CSV streaming/editor-first (no auto-copy)'),
				vscode.l10n.t('• Dedupe/Sort apply to final strings only'),
			].join('\n')
		: '';

	const fullMessage = notes ? `${baseMessage}\n${notes}` : baseMessage;

	// The buttons come back as the text they showed, so each is compared
	// against the same translated value it was built from.
	const open = vscode.l10n.t('Open results');
	const copy = vscode.l10n.t('Copy only');
	const cancel = vscode.l10n.t('Cancel');
	const choice = await vscode.window.showWarningMessage(
		fullMessage,
		{ modal: true },
		open,
		copy,
		cancel,
	);
	if (!choice || choice === cancel) return 'cancel';
	if (choice === copy) return 'copy';
	return 'open';
}

export async function confirmManyDocuments(
	countDocs: number,
	totalLines: number,
): Promise<boolean> {
	const open = vscode.l10n.t('Open results');
	const choice = await vscode.window.showWarningMessage(
		vscode.l10n.t(
			'Many results: opening {0} documents (~{1} total lines). Proceed?',
			countDocs,
			totalLines,
		),
		{ modal: true },
		open,
		vscode.l10n.t('Cancel'),
	);
	return choice === open;
}
