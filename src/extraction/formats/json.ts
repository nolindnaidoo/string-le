import type { Extractor } from '../../types';
import { collectStrings } from '../collect';
import { nestsTooDeep, tooDeep } from './nesting';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

/**
 * Extract strings from JSON by parsing and recursively collecting string values.
 * Reports parse errors via options.onParseError if provided.
 */
export const extractJson: Extractor = (text, options): readonly string[] => {
	// Before the parser: `JSON.parse` reads past the depth the crate's parser
	// refuses, and the collector then stopped without a word.
	if (nestsTooDeep(text, 'JSON')) {
		options?.onParseError?.(tooDeep('JSON'));
		return EMPTY_RESULT;
	}
	const parsed = parseJson(text, options?.onParseError);

	if (parsed === null) {
		return EMPTY_RESULT;
	}

	const strings = collectStrings(parsed);
	return Object.freeze(strings);
};

function parseJson(
	text: string,
	onError?: (message: string) => void,
): unknown | null {
	try {
		return JSON.parse(text);
	} catch (error) {
		if (onError && error instanceof Error) {
			onError(`Invalid JSON: ${error.message}`);
		}
		return null;
	}
}
