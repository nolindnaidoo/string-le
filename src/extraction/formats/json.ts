/**
 * The crate's `json.rs`: jsonc-parser 0.33's AST, strict for JSON and with
 * comments and trailing commas for JSONC, behind the crate's nesting bound.
 * Every string value counts, trimmed and never empty, a repeated key's
 * included; a key is never a value.
 */
import { JsoncError, type JsonValue, parseJsonc } from '../../parsers/jsonc';
import type { Extractor, ExtractorOptions } from '../../types';
import { nestsTooDeep, tooDeep } from './nesting';

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

/** The parsed root, nothing for an empty document, or the refusal in the crate's words. */
function parsed(
	text: string,
	comments: boolean,
): { readonly root: JsonValue | undefined } | { readonly error: string } {
	if (nestsTooDeep(text, 'JSON')) return { error: tooDeep('JSON') };
	try {
		return { root: parseJsonc(text, comments) };
	} catch (error) {
		if (!(error instanceof JsoncError)) throw error;
		return { error: `Invalid JSON: ${error.message}` };
	}
}

/** Each string value, trimmed and not empty, with the index of its opening quote. */
export function jsonStrings(
	text: string,
	comments: boolean,
): { value: string; start: number }[] | undefined {
	const result = parsed(text, comments);
	if ('error' in result) return undefined;
	const out: { value: string; start: number }[] = [];
	const visit = (node: JsonValue): void => {
		if (node.type === 'string') {
			const value = node.value.trim();
			if (value.length > 0) out.push({ value, start: node.start });
		} else if (node.type === 'array') node.elements.forEach(visit);
		else if (node.type === 'object')
			for (const p of node.properties) visit(p.value);
	};
	if (result.root !== undefined) visit(result.root);
	return out;
}

export function readJson(
	text: string,
	comments: boolean,
	options?: ExtractorOptions,
): readonly string[] {
	const result = parsed(text, comments);
	if ('error' in result) {
		options?.onParseError?.(result.error);
		return EMPTY_RESULT;
	}
	return Object.freeze(
		(jsonStrings(text, comments) ?? []).map((found) => found.value),
	);
}

export const extractJson: Extractor = (text, options) =>
	readJson(text, false, options);
