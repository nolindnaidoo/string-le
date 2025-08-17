import type { Extractor } from '../../types'

// Fallback extractor for simple quoted strings across unknown formats
export const extractFallback: Extractor = (text, _options): readonly string[] => {
	const regex = /(["'])(?:(?=(\\?))\2.)*?\1/g
	const matches = text.match(regex) ?? []
	const strings = matches
		.map((s): string => s.slice(1, -1))
		.map((s): string => s.trim())
		.filter(Boolean)
	return Object.freeze(strings)
}
