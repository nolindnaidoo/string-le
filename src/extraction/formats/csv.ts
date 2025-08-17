import { Readable } from 'node:stream'
import { parse as parseStream } from 'csv-parse'
import { parse } from 'csv-parse/sync'
import type { Extractor, ExtractorOptions } from '../../types'

// CSV extractor supports header detection and optional column selection
export const extractCsv: Extractor = (text, options?: ExtractorOptions): readonly string[] => {
	const hasHeader = Boolean(options?.csvHasHeader)
	const columnIndex = typeof options?.csvColumnIndex === 'number' ? options?.csvColumnIndex : undefined
	if (text.trim().length === 0) return Object.freeze([] as string[])

	// Parse as rows (arrays) for consistent, index-based handling.
	const rows = parse(text, {
		columns: false,
		bom: true,
		skip_empty_lines: true,
		relax_quotes: true,
		relax_column_count: true,
		trim: true,
	}) as unknown as ReadonlyArray<ReadonlyArray<string>>

	const results: string[] = []

	const startIdx = hasHeader ? 1 : 0 // skip header row if present
	if (columnIndex !== undefined) {
		for (let i = startIdx; i < rows.length; i++) {
			const row = rows[i] ?? []
			const raw = (row[columnIndex] ?? '').trim()
			if (raw.length > 0) results.push(raw)
		}
		return Object.freeze(results)
	}

	for (let i = startIdx; i < rows.length; i++) {
		const row = rows[i] ?? []
		for (const cell of row) {
			const v = (cell ?? '').trim()
			if (v.length > 0) results.push(v)
		}
	}
	return Object.freeze(results)
}

// Async generator that yields CSV strings incrementally using the streaming API
export async function* streamCsvStrings(
	text: string,
	options?: ExtractorOptions,
): AsyncGenerator<string, void, unknown> {
	const hasHeader = Boolean(options?.csvHasHeader)
	const columnIndex = typeof options?.csvColumnIndex === 'number' ? options?.csvColumnIndex : undefined
	if (text.trim().length === 0) return

	// Always stream as rows (arrays). We will skip the header row manually.
	const parser = parseStream({
		columns: false,
		bom: true,
		skip_empty_lines: true,
		relax_quotes: true,
		relax_column_count: true,
		trim: true,
	})

	const source = Readable.from([text])
	source.setEncoding('utf8')
	source.pipe(parser)

	let isFirstRow = true
	for await (const row of parser as AsyncIterable<readonly string[]>) {
		if (isFirstRow) {
			isFirstRow = false
			if (hasHeader) continue // skip header
		}
		if (columnIndex !== undefined) {
			const raw = (row[columnIndex] ?? '').trim()
			if (raw.length > 0) yield raw
			continue
		}
		for (const cell of row) {
			const v = (cell ?? '').trim()
			if (v.length > 0) yield v
		}
	}
}
