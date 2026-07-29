import { parse } from 'ini';
import type { Extractor } from '../../types';
import { collectStrings } from '../collect';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

/**
 * Extract strings from INI by parsing and recursively collecting values.
 * INI values are untyped text, so numeric-looking values are extracted
 * as strings (consistent with .env). Bare keys parse to boolean true and
 * are not extracted; comment lines (; or #) are skipped by the parser.
 * Reports parse errors via options.onParseError if provided.
 */
export const extractIni: Extractor = (text, options): readonly string[] => {
	const parsed = parseIni(text, options?.onParseError);

	if (parsed === null) {
		return EMPTY_RESULT;
	}

	const strings = collectStrings(parsed);
	return Object.freeze(strings);
};

function parseIni(
	text: string,
	onError?: (message: string) => void,
): unknown | null {
	try {
		return parse(text);
	} catch (error) {
		if (onError && error instanceof Error) {
			onError(`Invalid INI: ${error.message}`);
		}
		return null;
	}
}
