/**
 * The crate's `toml.rs`: `text.parse::<toml::Table>()` at toml 1.1 with
 * `preserve_order`, behind the crate's nesting bound. Only a string is one.
 */
import { loadToml, type TomlValue } from '../../parsers/toml/load';
import type { Extractor } from '../../types';
import { collectStrings } from '../collect';
import { nestsTooDeep, tooDeep } from './nesting';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

function strings(value: TomlValue): unknown {
	if (value.type === 'string') return value.text;
	if (value.type === 'array') return value.items.map(strings);
	if (value.type === 'table')
		return value.entries.map(([, item]) => strings(item));
	return null;
}

export const extractToml: Extractor = (text, options): readonly string[] => {
	if (nestsTooDeep(text, 'TOML')) {
		options?.onParseError?.(tooDeep('TOML'));
		return EMPTY_RESULT;
	}
	const parsed = loadToml(text);
	if (typeof parsed === 'string') {
		options?.onParseError?.(`Invalid TOML: ${parsed}`);
		return EMPTY_RESULT;
	}
	return Object.freeze(collectStrings(strings(parsed)));
};
