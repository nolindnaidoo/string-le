export type SortMode =
	| 'off'
	| 'alpha-asc'
	| 'alpha-desc'
	| 'length-asc'
	| 'length-desc';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);
const COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * Remove duplicate strings while preserving first-seen order.
 * Returns frozen array to communicate immutability.
 */
export function dedupe(strings: readonly string[]): readonly string[] {
	// Guard: Invalid or empty input
	if (!Array.isArray(strings) || strings.length === 0) {
		return EMPTY_RESULT;
	}

	const uniqueStrings = Array.from(new Set(strings));
	return Object.freeze(uniqueStrings);
}

/**
 * Sort strings according to specified mode using stable collator.
 * Returns frozen array to communicate immutability.
 */
export function sortStrings(
	strings: readonly string[],
	mode: SortMode,
): readonly string[] {
	// Guard: Invalid or empty input
	if (!Array.isArray(strings) || strings.length === 0) {
		return EMPTY_RESULT;
	}

	// Guard: No sorting requested
	if (mode === 'off') {
		return Object.freeze([...strings]);
	}

	const sortedStrings = applySortMode([...strings], mode);
	return Object.freeze(sortedStrings);
}

function applySortMode(strings: string[], mode: SortMode): string[] {
	switch (mode) {
		case 'alpha-asc':
			return sortAlphabeticallyAscending(strings);
		case 'alpha-desc':
			return sortAlphabeticallyDescending(strings);
		case 'length-asc':
			return sortByLengthAscending(strings);
		case 'length-desc':
			return sortByLengthDescending(strings);
		default:
			return strings;
	}
}

function sortAlphabeticallyAscending(strings: string[]): string[] {
	return strings.sort((a, b) => COLLATOR.compare(a, b));
}

function sortAlphabeticallyDescending(strings: string[]): string[] {
	return strings.sort((a, b) => COLLATOR.compare(b, a));
}

/**
 * The order within one length. A bare `localeCompare` follows the host's
 * locale, so one list sorted two ways on two machines; this follows the
 * same fixed collator as the alphabetical modes, then code unit for what
 * the collator calls equal, so every machine answers the same.
 */
function compareTie(a: string, b: string): number {
	return COLLATOR.compare(a, b) || (a < b ? -1 : Number(a > b));
}

function sortByLengthAscending(strings: string[]): string[] {
	return strings.sort((a, b) => a.length - b.length || compareTie(a, b));
}

function sortByLengthDescending(strings: string[]): string[] {
	return strings.sort((a, b) => b.length - a.length || compareTie(a, b));
}
