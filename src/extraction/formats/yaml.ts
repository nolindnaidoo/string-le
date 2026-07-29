import { loadAll } from 'js-yaml';
import type { Extractor } from '../../types';
import { collectStrings } from '../collect';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

/**
 * Extract strings from YAML by parsing and recursively collecting string
 * values. Handles multi-document files (--- separators), block/folded
 * scalars, and unquoted plain scalars. Reports parse errors via
 * options.onParseError if provided.
 */
export const extractYaml: Extractor = (text, options): readonly string[] => {
	const documents = parseYaml(text, options?.onParseError);

	if (documents === null) {
		return EMPTY_RESULT;
	}

	const strings: string[] = [];
	for (const document of documents) {
		collectStrings(document, strings);
	}
	return Object.freeze(strings);
};

function parseYaml(
	text: string,
	onError?: (message: string) => void,
): readonly unknown[] | null {
	try {
		return loadAll(text);
	} catch (error) {
		if (onError && error instanceof Error) {
			onError(`Invalid YAML: ${error.message}`);
		}
		return null;
	}
}
