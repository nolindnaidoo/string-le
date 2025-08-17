import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { splitCsvLine } from '../utils/csv'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

// Helper to handle CSV header-based column selection
async function handleCsvHeaderBasedSelection(headerCells: readonly string[]): Promise<CsvPromptOptions> {
	const allLabel = localize('runtime.csv.columns.all', 'All columns')
	const picks: Array<vscode.QuickPickItem> = [
		{
			label: allLabel,
			description: localize('runtime.csv.columns.all.desc', 'Extract from all columns'),
		},
		...headerCells.map((name, index) => ({
			label: name || localize('runtime.csv.column.default', '(Column {0})', index),
			description: localize('runtime.csv.column.index', 'Index {0}', index),
		})),
	]

	const selected = await vscode.window.showQuickPick(picks, {
		placeHolder: localize('runtime.csv.picker.placeholder', 'Select a CSV column or all columns'),
		matchOnDescription: true,
	})

	if (!selected) {
		return Object.freeze({}) // User cancelled
	}

	if (selected.label === allLabel) {
		return Object.freeze({ csvHasHeader: true, selectAllColumns: true })
	}

	// Find column index for single selection
	const columnIndex = findColumnIndex(headerCells, selected.label)
	if (columnIndex >= 0) {
		return Object.freeze({ csvHasHeader: true, csvColumnIndex: columnIndex })
	}

	// If no valid index found, default to all columns
	return Object.freeze({ csvHasHeader: true, selectAllColumns: true })
}

// Helper to find column index by label
function findColumnIndex(headerCells: readonly string[], label: string): number {
	// Try exact header text match first
	for (let i = 0; i < headerCells.length; i++) {
		if ((headerCells[i] || '') === label) {
			return i
		}
	}

	// Fallback to default label match (Column {i})
	for (let i = 0; i < headerCells.length; i++) {
		const defaultLabel = localize('runtime.csv.column.default', '(Column {0})', i)
		if (defaultLabel === label) {
			return i
		}
	}

	return -1 // Not found
}

// Helper to handle CSV no-header index-based selection
async function handleCsvIndexBasedSelection(lines: readonly string[]): Promise<CsvPromptOptions> {
	const idxStr = await vscode.window.showInputBox({
		prompt: localize(
			'runtime.csv.input.prompt',
			'Enter column indexes (comma-separated), or leave empty for all columns',
		),
		validateInput: (val) => {
			if (val.trim() === '') return null
			const parts = val
				.split(',')
				.map((p) => p.trim())
				.filter((p) => p.length > 0)
			const allInts = parts.every((p) => /^(\d+)$/.test(p))
			return allInts
				? null
				: localize('runtime.csv.input.validation', 'Enter valid column indexes separated by commas, or leave empty')
		},
	})

	if (!idxStr || idxStr.trim() === '') {
		return Object.freeze({ csvHasHeader: false, selectAllColumns: true })
	}

	const parts = idxStr
		.split(',')
		.map((p) => p.trim())
		.filter((p) => p.length > 0)
	const indices = parts.map((p) => Number(p)).filter((n) => Number.isInteger(n) && n >= 0)

	// Validate against first row cell count
	const firstRowLine = lines[0]
	if (!firstRowLine) return Object.freeze({})

	const firstRow = splitCsvLine(firstRowLine)
	const inRange = indices.filter((idx) => idx >= 0 && idx < firstRow.length)

	if (inRange.length === 0) {
		vscode.window.showWarningMessage(
			localize(
				'runtime.csv.error.out-of-range',
				'Column index out of range ({0}). Using all columns instead',
				indices.join(','),
			),
		)
		return Object.freeze({ csvHasHeader: false, selectAllColumns: true })
	}

	if (inRange.length === 1) {
		return Object.freeze({
			csvHasHeader: false,
			csvColumnIndex: inRange[0] as number,
		})
	}

	return Object.freeze({ csvHasHeader: false, csvColumnIndexes: inRange })
}

// UI prompts for selecting file type and CSV extraction options
export type CsvPromptOptions = Readonly<{
	csvHasHeader?: boolean
	csvColumnIndex?: number
	csvColumnIndexes?: readonly number[]
	selectAllColumns?: boolean
}>

export function promptForFileType(): Promise<
	'json' | 'yaml' | 'yml' | 'csv' | 'toml' | 'ini' | 'env' | 'fallback' | undefined
> {
	// Present QuickPick with supported types; returns internal value or undefined
	const items: readonly { label: string; value: string }[] = [
		{ label: 'JSON', value: 'json' },
		{ label: 'YAML', value: 'yaml' },
		{ label: 'TOML', value: 'toml' },
		{ label: 'INI', value: 'ini' },
		{ label: '.env', value: 'env' },
		{ label: 'CSV', value: 'csv' },
		{
			label: localize('runtime.picker.filetype.fallback', 'Fallback (quoted strings)'),
			value: 'fallback',
		},
	]
	return Promise.resolve(
		vscode.window
			.showQuickPick(
				items.map((i) => i.label),
				{
					placeHolder: localize('runtime.picker.filetype.placeholder', 'Choose file type for extraction'),
				},
			)
			.then(
				(picked) =>
					items.find((i) => i.label === picked)?.value as
						| 'json'
						| 'yaml'
						| 'yml'
						| 'csv'
						| 'toml'
						| 'ini'
						| 'env'
						| 'fallback'
						| undefined,
			),
	)
}

export async function promptCsvOptionsIfNeeded(extension: string, text: string): Promise<CsvPromptOptions> {
	if (extension !== 'csv') return Object.freeze({})

	const lines = text.split(/\r?\n/).filter((l): boolean => l.length > 0)
	if (lines.length === 0) return Object.freeze({})

	const firstLine = lines[0]
	if (!firstLine) return Object.freeze({})

	const headerCells = splitCsvLine(firstLine)
	const looksLikeHeader = headerCells.some((cell) => /[A-Za-z]/.test(cell))

	if (looksLikeHeader) {
		return await handleCsvHeaderBasedSelection(headerCells)
	} else {
		return await handleCsvIndexBasedSelection(lines)
	}
}
