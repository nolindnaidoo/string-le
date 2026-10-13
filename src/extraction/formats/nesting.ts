/**
 * How deeply a document nests, counted before it is parsed.
 *
 * The parsers behind the JSON, TOML and YAML readers each have their own
 * depth limit, and the two frontends' limits differ: this side's `JSON.parse`
 * and `@iarna/toml` read thousands of levels and the collector then stopped
 * at depth 1,000 without a word, so a deep document answered `ok` with
 * nothing here and a refusal from the crate. The bound is applied to the text
 * before either parser sees it, so both refuse the same documents with the
 * same words.
 *
 * It counts brackets and braces outside quoted strings, where a quoted string
 * is `"…"` with backslash escapes or `'…'` without. A comment holding a
 * thousand unmatched brackets is counted too, which refuses a document nobody
 * writes rather than missing one somebody does. The crate's `nesting.rs` is
 * the same scanner in Rust.
 *
 * The bound is per format, set at the weakest parser behind it on either
 * side, so a document at the bound reads on both and one past it is refused
 * by both. Measured by driving both built servers: the crate's JSON parser
 * gives up past 512 levels, its TOML parser past 80, and js-yaml past 98
 * levels of flow nesting; the other three parse further and would read a
 * document their twin refuses. YAML nested by indentation alone has no
 * bracket to count and keeps each parser's own limit.
 */

export type NestedFormat = 'JSON' | 'TOML' | 'YAML';

/** Deeper than this is refused. */
export const MAX_NESTING: Readonly<Record<NestedFormat, number>> =
	Object.freeze({
		JSON: 512,
		TOML: 80,
		YAML: 98,
	});

export function nestingDepth(content: string): number {
	let depth = 0;
	let deepest = 0;
	let quote: string | undefined;
	for (let i = 0; i < content.length; i++) {
		const c = content[i];
		if (quote !== undefined) {
			if (c === '\\' && quote === '"') {
				i++;
				continue;
			}
			if (c === quote) quote = undefined;
			continue;
		}
		if (c === '"' || c === "'") {
			quote = c;
			continue;
		}
		if (c === '[' || c === '{') {
			depth++;
			if (depth > deepest) deepest = depth;
			continue;
		}
		if ((c === ']' || c === '}') && depth > 0) depth--;
	}
	return deepest;
}

/** The refusal for a document past the bound, in the words both frontends use. */
export function tooDeep(format: NestedFormat): string {
	return `Invalid ${format}: nested deeper than ${MAX_NESTING[format]} levels`;
}

/** Whether a document nests past its format's bound. */
export function nestsTooDeep(content: string, format: NestedFormat): boolean {
	return nestingDepth(content) > MAX_NESTING[format];
}
