import type { ExtractorOptions } from '../types';
import {
	QUOTED_MULTILINE_REGEX,
	QUOTED_STRING_REGEX,
} from './formats/fallback';
import { isSourceFileType, scanSourceSpanned } from './formats/source';

export type Position = Readonly<{ line: number; column: number }>;

type Spanned = Readonly<{ value: string; offset: number }>;

/** The formats whose parser hands over values it already resolved. */
const PARSED = new Set([
	'jsonc',
	'yaml',
	'yml',
	'csv',
	'tsv',
	'toml',
	'ini',
	'env',
]);

/**
 * Where each extracted string starts, where that is known rather than
 * guessed: the source languages and the quoted-run scan (both carry the
 * offset) and JSON (every string value token, in document order). The
 * position is that of the opening delimiter.
 *
 * Everything else hands over strings its parser already resolved, and a
 * position there would be a search for the value, which can land on the same
 * text in a key or a comment. Those get none.
 *
 * Positions attach only when the spanned scan and the extracted list agree
 * one to one. A JSON object with a repeated or an integer-like key reports
 * its values to `JSON.parse` in another order than a token scan reads them,
 * and then none is placed.
 */
export function exactPositions(
	text: string,
	fileType: string,
	strings: readonly string[],
	options?: Pick<ExtractorOptions, 'multiline'>,
): readonly Position[] | undefined {
	// The engine reads the trimmed text, so offsets are found there and moved
	// back by what was trimmed off the front.
	const lead = text.length - text.trimStart().length;
	const spanned = spannedValues(text.trim(), fileType, options);
	if (spanned === undefined || spanned.length !== strings.length) {
		return undefined;
	}
	if (spanned.some((s, i) => s.value !== strings[i])) return undefined;
	const at = positionIndex(text);
	return spanned.map((s) => at(s.offset + lead));
}

function spannedValues(
	text: string,
	fileType: string,
	options?: Pick<ExtractorOptions, 'multiline'>,
): readonly Spanned[] | undefined {
	const key = fileType.trim().toLowerCase();
	if (isSourceFileType(key)) return scanSourceSpanned(text, key);
	if (key === 'json') return jsonStrings(text);
	if (PARSED.has(key)) return undefined;
	return kept(
		[
			...text.matchAll(
				options?.multiline ? QUOTED_MULTILINE_REGEX : QUOTED_STRING_REGEX,
			),
		].map((match) => ({
			value: match[0].slice(1, -1),
			offset: match.index,
		})),
	);
}

const JSON_STRING = /"(?:[^"\\]|\\.)*"/y;

/** Every string that is a value and not a key, in document order. */
function jsonStrings(text: string): readonly Spanned[] | undefined {
	const out: Spanned[] = [];
	let at = 0;
	while (at < text.length) {
		if (text[at] !== '"') {
			at += 1;
			continue;
		}
		JSON_STRING.lastIndex = at;
		const token = JSON_STRING.exec(text)?.[0];
		if (token === undefined) return undefined;
		let next = at + token.length;
		while (/\s/.test(text[next] ?? '')) next += 1;
		if (text[next] !== ':') {
			try {
				out.push({ value: JSON.parse(token) as string, offset: at });
			} catch {
				return undefined;
			}
		}
		at += token.length;
	}
	return kept(out);
}

/** The collection rule every format shares: trimmed, and never empty. */
function kept(found: readonly Spanned[]): readonly Spanned[] {
	return found
		.map((s) => ({ value: s.value.trim(), offset: s.offset }))
		.filter((s) => s.value.length > 0);
}

function positionIndex(text: string): (offset: number) => Position {
	const starts = [0];
	for (let i = 0; i < text.length; i++)
		if (text[i] === '\n') starts.push(i + 1);
	return (offset) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if ((starts[mid] as number) <= offset) lo = mid;
			else hi = mid - 1;
		}
		return { line: lo + 1, column: offset - (starts[lo] as number) + 1 };
	};
}
