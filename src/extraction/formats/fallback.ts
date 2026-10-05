import type { Extractor } from '../../types';

export const QUOTED_STRING_REGEX = /(["'`])(?:(?=(\\?))\2.)*?\1/g;
// The same run with `[\s\S]` for `.`, so it may span lines: opt-in, as
// in the crate's `--multiline`.
export const QUOTED_MULTILINE_REGEX = /(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g;
const EMPTY_RESULT: readonly string[] = Object.freeze([]);

/**
 * Fallback extractor for quoted strings in unknown formats.
 * Matches double quotes, single quotes, and backticks with escaped characters.
 */
export const extractFallback: Extractor = (
	text,
	options,
): readonly string[] => {
	const matches = options?.multiline
		? (text.match(QUOTED_MULTILINE_REGEX) ?? [])
		: findQuotedStrings(text);

	if (matches.length === 0) {
		return EMPTY_RESULT;
	}

	const strings = extractStringsFromMatches(matches);
	return Object.freeze(strings);
};

/**
 * The inside of every quoted run, exactly as the source spells it.
 *
 * Exported so the per-language extractor can reuse the pattern on a
 * comment body without reusing the trimming: what counts as a string is
 * collectStrings' question, and answering it twice is how two frontends
 * start to disagree.
 */
export function quotedRuns(text: string): readonly string[] {
	return findQuotedStrings(text).map(removeQuotes);
}

/** The same runs with where each opening quote is, in UTF-16 units. */
export function quotedRunsSpanned(
	text: string,
): readonly { value: string; index: number }[] {
	return [...text.matchAll(QUOTED_STRING_REGEX)].map((match) => ({
		value: removeQuotes(match[0]),
		index: match.index,
	}));
}

function findQuotedStrings(text: string): string[] {
	return text.match(QUOTED_STRING_REGEX) ?? [];
}

function extractStringsFromMatches(matches: string[]): string[] {
	return matches.map(removeQuotes).map(trimString).filter(isNonEmpty);
}

function removeQuotes(quotedString: string): string {
	return quotedString.slice(1, -1);
}

function trimString(str: string): string {
	return str.trim();
}

function isNonEmpty(str: string): boolean {
	return str.length > 0;
}
