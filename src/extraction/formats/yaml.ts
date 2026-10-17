/**
 * The crate's `yaml.rs`: saphyr 0.1's `Yaml::load_from_str` behind the
 * crate's nesting bound. Only a string scalar is a string: a tagged node,
 * a number and a boolean are not.
 */
import { loadYaml, type YamlNode } from '../../parsers/yaml/load';
import type { Extractor } from '../../types';
import { collectStrings } from '../collect';
import { nestsTooDeep, tooDeep } from './nesting';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

function strings(node: YamlNode): unknown {
	if (node.k === 'str') return node.v;
	if (node.k === 'seq') return node.items.map(strings);
	if (node.k === 'map')
		return [...node.entries.values()].map(({ value }) => strings(value));
	return null;
}

export const extractYaml: Extractor = (text, options): readonly string[] => {
	if (nestsTooDeep(text, 'YAML')) {
		options?.onParseError?.(tooDeep('YAML'));
		return EMPTY_RESULT;
	}
	const documents = loadYaml(text);
	if (typeof documents === 'string') {
		options?.onParseError?.(`Invalid YAML: ${documents}`);
		return EMPTY_RESULT;
	}
	return Object.freeze(collectStrings(documents.map(strings)));
};
