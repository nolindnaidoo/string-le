import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export interface Notifier {
	info(message: string): void
	warn(message: string): void
	error(message: string): void
	showMultilineRisk(count: number): void
	showCsvNoCopy(): void
	showPostProcessInfo(): void
}

export function createNotifier(): Notifier {
	type Level = 'all' | 'important' | 'silent'
	function level(): Level {
		return (vscode.workspace.getConfiguration('string-le').get('notificationsLevel', 'all') as Level) ?? 'all'
	}
	return Object.freeze({
		info(message: string): void {
			const lv = level()
			if (lv === 'silent') return
			if (lv === 'all') vscode.window.showInformationMessage(message)
		},
		warn(message: string): void {
			const lv = level()
			if (lv === 'silent') return
			vscode.window.showWarningMessage(message)
		},
		error(message: string): void {
			const lv = level()
			if (lv === 'silent') return
			vscode.window.showErrorMessage(message)
		},
		showMultilineRisk(_count: number): void {
			const lv = level()
			if (lv === 'silent') return
			if (lv === 'all') {
				vscode.window.showInformationMessage(
					localize(
						'runtime.info.multiline-detected',
						'Detected multi‑line strings. Rendering and joining may vary by format. Prefer quoted, single‑line strings for stable results.',
					),
				)
			}
		},
		showCsvNoCopy(): void {
			const lv = level()
			if (lv === 'silent') return
			if (lv === 'all') {
				vscode.window.showInformationMessage(
					localize(
						'runtime.info.csv-no-clipboard',
						"CSV results aren't auto‑copied when streaming or extracting all columns. Use the editor output or Copy manually.",
					),
				)
			}
		},
		showPostProcessInfo(): void {
			const lv = level()
			if (lv === 'silent') return
			if (lv === 'all') {
				vscode.window.showInformationMessage(
					localize(
						'runtime.info.postprocess-semantics',
						"Sorting and deduping operate on final strings, not structured positions. Structural order/indices aren't preserved.",
					),
				)
			}
		},
	})
}
