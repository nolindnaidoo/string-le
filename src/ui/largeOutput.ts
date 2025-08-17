import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export type LargeOutputAction = 'open' | 'copy' | 'cancel'

export async function chooseLargeOutputAction(count: number, hasContextualNotes = false): Promise<LargeOutputAction> {
	// Enhanced warning with contextual notes
	const baseMessage = localize(
		'runtime.prompt.large-output.body',
		'Detected {0} strings. Opening large results may freeze the editor. What would you like to do?',
		count,
	)
	const notes = hasContextualNotes
		? [
				'',
				'Notes:',
				'• Multi‑line strings may render differently across formats',
				'• CSV streaming/editor-first (no auto‑copy)',
				'• Dedupe/Sort apply to final strings only',
			].join('\n')
		: ''

	const fullMessage = notes ? `${baseMessage}\n${notes}` : baseMessage

	const choice = await vscode.window.showWarningMessage(
		fullMessage,
		{ modal: true },
		localize('runtime.dialog.action.open', 'Open results'),
		localize('runtime.dialog.action.copy', 'Copy only'),
		localize('runtime.dialog.action.cancel', 'Cancel'),
	)
	if (!choice || choice === localize('runtime.dialog.action.cancel', 'Cancel')) return 'cancel'
	if (choice === localize('runtime.dialog.action.copy', 'Copy only')) return 'copy'
	return 'open'
}

export async function confirmManyDocuments(countDocs: number, totalLines: number): Promise<boolean> {
	const choice = await vscode.window.showWarningMessage(
		localize(
			'runtime.dialog.many-docs.message',
			'Many results — opening {0} documents (~{1} total lines). Proceed?',
			countDocs,
			totalLines,
		),
		{ modal: true },
		localize('runtime.dialog.action.open', 'Open results'),
		localize('runtime.dialog.action.cancel', 'Cancel'),
	)
	return choice === localize('runtime.dialog.action.open', 'Open results')
}

void localize
