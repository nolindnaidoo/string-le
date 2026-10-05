/**
 * Positions on a list of extracted values.
 *
 * A result line is the value alone, or `line:column`, a tab, then the value.
 * The position leads because a value can hold anything, spaces included, and
 * a position at the end could not be told from part of one. The tab is what
 * marks it: a value that merely starts with `12:3` has no tab after it.
 *
 * Everything else in the extension works on bare values: the extraction
 * settings, Dedupe, Sort. `onValues` lets each keep doing that and carries the
 * positions through, so none of them has to know a position exists.
 */
export type Position = Readonly<{ line: number; column: number }>;

const PREFIX = /^\d+:\d+\t/;

export function withPosition(
	value: string,
	position: Position | undefined,
): string {
	return position === undefined
		? value
		: `${position.line}:${position.column}\t${value}`;
}

export function hasPosition(line: string): boolean {
	return PREFIX.test(line);
}

export function bareValue(line: string): string {
	return line.replace(PREFIX, '');
}

export function withoutPositions(text: string): string {
	return text.split('\n').map(bareValue).join('\n');
}

/** The text as written, or without its positions. */
export function positioned(text: string, keep: boolean): string {
	return keep ? text : withoutPositions(text);
}

/**
 * Runs a change written for bare values over lines that may carry positions.
 *
 * Each value the change returns takes the earliest unused line that held it.
 * So a sort keeps every position with its value, and a dedupe keeps the first
 * occurrence, which is the one a reader would look for.
 */
export function onValues(
	lines: readonly string[],
	change: (values: string[]) => readonly string[],
): string[] {
	const held = new Map<string, string[]>();
	for (const line of lines) {
		const value = bareValue(line);
		const queue = held.get(value);
		if (queue === undefined) held.set(value, [line]);
		if (queue !== undefined) queue.push(line);
	}
	return change(lines.map(bareValue)).map(
		(value) => held.get(value)?.shift() ?? value,
	);
}
