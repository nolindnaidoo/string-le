import type { Extractor } from '../../types'

// .env extractor that trims, ignores comments, and unquotes values
export const extractDotenv: Extractor = (text, _options): readonly string[] => {
	const strings: string[] = []
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue
		const content = line.startsWith('export ') ? line.slice(7).trim() : line
		const equals = content.indexOf('=')
		if (equals === -1) continue
		const value = content.slice(equals + 1).trim()
		if (!value) continue
		const unquoted =
			(value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
				? value.slice(1, -1)
				: value
		const trimmed = unquoted.trim()
		if (trimmed) strings.push(trimmed)
	}
	return Object.freeze(strings)
}
