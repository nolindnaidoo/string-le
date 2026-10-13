import { describe, expect, it } from 'vitest';
import { MAX_NESTING, nestingDepth, nestsTooDeep, tooDeep } from './nesting';

describe('nestingDepth', () => {
	it('counts the deepest run of open brackets and braces', () => {
		expect(nestingDepth('')).toBe(0);
		expect(nestingDepth('{"a": [1, {"b": 2}]}')).toBe(3);
		expect(nestingDepth('[[[]]][[]]')).toBe(3);
	});

	it('does not count a bracket inside a quoted string', () => {
		expect(nestingDepth('{"a": "[[[[["}')).toBe(1);
		expect(nestingDepth("a = '{{{'")).toBe(0);
		expect(nestingDepth('{"a": "\\"[["}')).toBe(1);
	});

	it('never goes below zero on a stray closer', () => {
		expect(nestingDepth('}}}{')).toBe(1);
	});

	it("names each format's bound in the refusal", () => {
		expect(tooDeep('JSON')).toBe('Invalid JSON: nested deeper than 512 levels');
		expect(tooDeep('TOML')).toBe('Invalid TOML: nested deeper than 80 levels');
		expect(tooDeep('YAML')).toBe('Invalid YAML: nested deeper than 98 levels');
	});

	it('holds a document at the bound and refuses one past it', () => {
		for (const format of ['JSON', 'TOML', 'YAML'] as const) {
			const bound = MAX_NESTING[format];
			expect(nestsTooDeep('['.repeat(bound), format), format).toBe(false);
			expect(nestsTooDeep('['.repeat(bound + 1), format), format).toBe(true);
		}
	});
});
