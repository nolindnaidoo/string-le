/**
 * The crate's `ini.rs`: rust-ini 0.21 with escapes off. A key repeated in
 * one section keeps its first place and takes its last value.
 */
import { loadIni } from '../../parsers/ini';
import type { Extractor } from '../../types';
import { collectStrings } from '../collect';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

export const extractIni: Extractor = (text, options): readonly string[] => {
	const sections = loadIni(text);
	if (typeof sections === 'string') {
		options?.onParseError?.(`Invalid INI: ${sections}`);
		return EMPTY_RESULT;
	}
	const values = sections.flatMap((section) => {
		const slots = new Map<string, string>();
		for (const [key, value] of section.properties) slots.set(key, value);
		return [...slots.values()];
	});
	return Object.freeze(collectStrings(values));
};
