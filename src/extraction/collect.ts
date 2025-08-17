// Recursively collect trimmed string leaf values from JSON-like structures
export function collectStrings(value: unknown, out: string[] = []): string[] {
	if (value == null) return out
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (trimmed) out.push(trimmed)
		return out
	}
	if (Array.isArray(value)) {
		for (const item of value) collectStrings(item, out)
		return out
	}
	if (typeof value === 'object') {
		for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out)
		return out
	}
	return out
}
