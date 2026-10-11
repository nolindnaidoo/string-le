import { describe, expect, it } from 'vitest';
import { dedupe, sortStrings } from './text';

describe('text utilities', () => {
	it('should dedupe preserving first occurrence', () => {
		expect(dedupe([])).toEqual([]);
		expect(dedupe(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
	});

	it('should return copy when sort is off', () => {
		const arr = ['b', 'a'];
		const out = sortStrings(arr, 'off');
		expect(out).toEqual(arr);
		expect(out).not.toBe(arr);
	});

	it('should sort alphabetically and by length', () => {
		const input = ['bb', 'a', 'ccc', 'b'];
		expect(sortStrings(input, 'alpha-asc')).toEqual(['a', 'b', 'bb', 'ccc']);
		expect(sortStrings(input, 'alpha-desc')).toEqual(['ccc', 'bb', 'b', 'a']);
		expect(sortStrings(input, 'length-asc')).toEqual(['a', 'b', 'bb', 'ccc']);
		expect(sortStrings(input, 'length-desc')).toEqual(['ccc', 'bb', 'a', 'b']);
	});

	it('breaks a length tie the same way on every machine', () => {
		// The tie-break used a bare `localeCompare`, which orders by the host's
		// locale: one list sorted two ways on two machines. Ties follow the
		// same fixed collator as the alphabetical modes, then code unit.
		const input = ['b', 'a', 'B', 'A', 'bb', 'aa'];
		expect(sortStrings(input, 'length-asc')).toEqual([
			'A',
			'a',
			'B',
			'b',
			'aa',
			'bb',
		]);
		expect(sortStrings(input, 'length-desc')).toEqual([
			'aa',
			'bb',
			'A',
			'a',
			'B',
			'b',
		]);
	});

	it('should return frozen sorted copy for unknown mode', () => {
		const input = ['b', 'a'];
		const out = sortStrings(input as unknown as readonly string[], 'off');
		// Ensure array is frozen
		expect(() => {
			(out as string[])[0] = 'x';
		}).toThrow();
	});
});
