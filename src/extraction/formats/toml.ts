import { parse } from '@iarna/toml';
import type { Extractor } from '../../types';
import { collectStrings } from '../collect';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

/**
 * Extract strings from TOML by parsing and recursively collecting string
 * values. Handles basic/literal strings, their multiline forms, arrays,
 * and tables. Dates and numbers are typed values and are not extracted.
 * Reports parse errors via options.onParseError if provided.
 */
export const extractToml: Extractor = (text, options): readonly string[] => {
	const parsed = parseToml(text, options?.onParseError);

	if (parsed === null) {
		return EMPTY_RESULT;
	}

	const strings = collectStrings(parsed);
	return Object.freeze(strings);
};

function parseToml(
	text: string,
	onError?: (message: string) => void,
): unknown | null {
	try {
		return parse(text);
	} catch (error) {
		if (onError && error instanceof Error) {
			onError(`Invalid TOML: ${error.message}`);
		}
		return null;
	}
}
