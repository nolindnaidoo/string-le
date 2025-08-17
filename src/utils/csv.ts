// Split a single CSV line into trimmed cells with basic quote handling
export function splitCsvLine(line: string): readonly string[] {
	if (line.length === 0) return Object.freeze([] as string[])
	const cells: string[] = []
	let current = ''
	let inQuotes = false

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (ch === '"') {
			if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
				current += '"'
				i++
				continue
			}
			inQuotes = !inQuotes
			continue
		}
		if (ch === ',' && !inQuotes) {
			cells.push(current.trim())
			current = ''
			continue
		}
		current += ch
	}
	cells.push(current.trim())
	return Object.freeze(cells)
}
