import { describe, expect, it } from 'vitest';
import {
	bareValue,
	hasPosition,
	onValues,
	positioned,
	withoutPositions,
	withPosition,
} from './positions';

describe('a result line', () => {
	it('leads with its position when it has one', () => {
		expect(withPosition('a b', { line: 12, column: 3 })).toBe('12:3\ta b');
		expect(withPosition('a b', undefined)).toBe('a b');
	});

	it('gives its value back, and is not fooled by a value that looks like a position', () => {
		expect(bareValue('12:3\ta b')).toBe('a b');
		// No tab follows, so this is the value itself.
		expect(bareValue('12:30 on Tuesday')).toBe('12:30 on Tuesday');
		expect(hasPosition('12:30 on Tuesday')).toBe(false);
		expect(hasPosition('12:3\ta b')).toBe(true);
	});

	it('comes off a whole text, or stays', () => {
		expect(withoutPositions('1:1\ta\nb\n3:9\tc')).toBe('a\nb\nc');
		expect(positioned('1:1\ta', true)).toBe('1:1\ta');
		expect(positioned('1:1\ta', false)).toBe('a');
	});
});

describe('onValues', () => {
	const lines = ['1:1\tb', '2:1\ta', '3:1\tb'];

	it('keeps each position with its value through a sort', () => {
		expect(onValues(lines, (values) => [...values].sort())).toEqual([
			'2:1\ta',
			'1:1\tb',
			'3:1\tb',
		]);
	});

	it('keeps the first occurrence through a dedupe', () => {
		expect(onValues(lines, (values) => [...new Set(values)])).toEqual([
			'1:1\tb',
			'2:1\ta',
		]);
	});

	it('leaves lines with no position as they were', () => {
		expect(onValues(['b', 'a', 'b'], (values) => [...new Set(values)])).toEqual(
			['b', 'a'],
		);
	});

	it('passes through a value the change made up', () => {
		expect(onValues(['1:1\ta'], () => ['z'])).toEqual(['z']);
	});
});
