/**
 * Where each value came from, as the Rust CLI places it: `extract/locate.rs`,
 * `extract/position.rs`, and the JSON spans `extract/json.rs` reads off its
 * parser's tree.
 *
 * Not the extension's `exactPositions`, which places only what it can find
 * without searching and points at the opening delimiter. The crate places
 * every format and points at the value's first character, and a report's
 * `line` and `column` are protocol, so the command line follows the crate.
 *
 * Columns are UTF-16 code units, which is what a JavaScript string index
 * already counts, so an offset here is a column without conversion.
 */
import { jsonStrings } from '../extraction/formats/json';

export interface Position {
	readonly line: number;
	readonly column: number;
}

export interface Located {
	readonly value: string;
	readonly position: Position | null;
}

/**
 * A forward cursor: each value is looked for from where the previous one
 * ended, so two equal values land on their own occurrences. A value the
 * source never spells, such as a resolved escape or a folded YAML scalar,
 * gets no position and leaves the cursor where it was.
 */
export function locate(text: string, values: readonly string[]): Located[] {
	const at = positionIndex(text);
	let cursor = 0;
	return values.map((value) => {
		const found = text.indexOf(value, cursor);
		if (found === -1) return { value, position: null };
		cursor = found + value.length;
		return { value, position: at(found) };
	});
}

/**
 * JSON's values with the offset of each string's first character, in source
 * order. Source order, not `JSON.parse` order: the crate walks its parser's
 * tree, so an integer-like key does not move its value to the front and a
 * repeated key keeps both values.
 *
 * Only called on a document the strict parser accepted, which is what makes
 * "a string followed by a colon" mean exactly "a key".
 */
export function jsonSpans(
	trimmed: string,
	comments: boolean,
): { value: string; offset: number }[] {
	return (jsonStrings(trimmed, comments) ?? []).map((found) => ({
		value: found.value,
		offset: found.start + 1,
	}));
}

/** Lines start after `\n`. A lone `\r` is an ordinary character, as in the crate. */
export function positionIndex(text: string): (offset: number) => Position {
	const starts = [0];
	for (let index = 0; index < text.length; index++) {
		if (text[index] === '\n') starts.push(index + 1);
	}
	return (offset) => {
		const clamped = Math.min(offset, text.length);
		let low = 0;
		let high = starts.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if ((starts[middle] as number) <= clamped) low = middle;
			else high = middle - 1;
		}
		return { line: low + 1, column: clamped - (starts[low] as number) + 1 };
	};
}
