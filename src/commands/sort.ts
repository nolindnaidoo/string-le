import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { type SortMode, sortStrings } from '../utils/text'
import { processAndOutput } from './postProcessHelper'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export function registerSortCommand(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('string-le.postProcess.sort', async (): Promise<void> => {
			const editor = vscode.window.activeTextEditor
			if (!editor) return
			// Sort modes presented to the user
			const items = [
				{
					label: localize('runtime.sort.option.alpha-asc', 'Alphabetical (A → Z)'),
					mode: 'alpha-asc',
				},
				{
					label: localize('runtime.sort.option.alpha-desc', 'Alphabetical (Z → A)'),
					mode: 'alpha-desc',
				},
				{
					label: localize('runtime.sort.option.length-asc', 'By length (short → long)'),
					mode: 'length-asc',
				},
				{
					label: localize('runtime.sort.option.length-desc', 'By length (long → short)'),
					mode: 'length-desc',
				},
			] as const
			const picked = await vscode.window.showQuickPick(
				items.map((i) => i.label),
				{
					placeHolder: localize('runtime.sort.picker.placeholder', 'Choose sort mode'),
				},
			)
			if (!picked) return
			const mode = (items.find((i) => i.label === picked)?.mode ?? 'alpha-asc') as SortMode
			const values = editor.document.getText().split(/\r?\n/)
			const processed = sortStrings(values, mode).join('\n')
			await processAndOutput(editor, processed)
		}),
	)
}
