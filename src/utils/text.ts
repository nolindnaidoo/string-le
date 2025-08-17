// String utilities for sorting and deduping
export type SortMode = 'off' | 'alpha-asc' | 'alpha-desc' | 'length-asc' | 'length-desc'

// Remove duplicates while preserving first-seen order; returns frozen array
export function dedupe(strings: readonly string[]): readonly string[] {
	if (!Array.isArray(strings) || strings.length === 0) return Object.freeze([] as string[])
	return Object.freeze(Array.from(new Set(strings)))
}

const COLLATOR = new Intl.Collator('en', { sensitivity: 'base' })

// Sort strings deterministically per mode using stable collator
export function sortStrings(strings: readonly string[], mode: SortMode): readonly string[] {
	if (!Array.isArray(strings) || strings.length === 0) return Object.freeze([] as string[])
	if (mode === 'off') return Object.freeze([...strings])
	const copy = [...strings]
	switch (mode) {
		case 'alpha-asc':
			copy.sort((a, b) => COLLATOR.compare(a, b))
			break
		case 'alpha-desc':
			copy.sort((a, b) => COLLATOR.compare(b, a))
			break
		case 'length-asc':
			copy.sort((a, b) => a.length - b.length || a.localeCompare(b))
			break
		case 'length-desc':
			copy.sort((a, b) => b.length - a.length || a.localeCompare(b))
			break
	}
	return Object.freeze(copy)
}
