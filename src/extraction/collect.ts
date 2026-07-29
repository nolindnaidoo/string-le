const MAX_RECURSION_DEPTH = 1000;

/**
 * Shared value-collection heuristics for every parsed format (JSON,
 * YAML, TOML, INI): recursively collect string leaf VALUES from the
 * parsed structure. One rule set, applied uniformly:
 *
 * - keys are never extracted, only values
 * - non-string primitives (numbers, booleans, null) are dropped — in
 *   typed formats a bare 42 is a number, not a string; untyped
 *   line-formats (INI, .env) parse every value as a string, so
 *   numeric-looking values ARE extracted there
 * - other non-string leaves (e.g. TOML dates) are dropped
 * - values are trimmed; empty/whitespace-only values are dropped
 *
 * Silently stops at MAX_RECURSION_DEPTH to prevent stack overflow.
 */
export function collectStrings(
	value: unknown,
	out: string[] = [],
	depth = 0,
): string[] {
	// Guard: Prevent stack overflow
	if (depth > MAX_RECURSION_DEPTH) {
		return out;
	}

	// Guard: Skip null/undefined
	if (value == null) {
		return out;
	}

	// Base case: String value
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed) {
			out.push(trimmed);
		}
		return out;
	}

	// Recursive case: Array
	if (Array.isArray(value)) {
		for (const item of value) {
			collectStrings(item, out, depth + 1);
		}
		return out;
	}

	// Recursive case: Object
	if (typeof value === 'object') {
		for (const v of Object.values(value as Record<string, unknown>)) {
			collectStrings(v, out, depth + 1);
		}
		return out;
	}

	// Default: Non-string primitive (number, boolean, etc.)
	return out;
}
