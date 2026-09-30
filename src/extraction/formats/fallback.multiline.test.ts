import { describe, expect, it } from 'vitest';
import { extractFallback } from './fallback';

describe('extractFallback multiline', () => {
	const text =
		'notice = "Your data is kept for\n30 days."\nshort = `one line`\n';

	it('stops a quoted run at the end of a line by default', () => {
		expect(extractFallback(text)).toEqual(['one line']);
	});

	it('lets a quoted run span lines when asked', () => {
		expect(extractFallback(text, { multiline: true })).toEqual([
			'Your data is kept for\n30 days.',
			'one line',
		]);
	});

	it('still honours an escaped quote across lines', () => {
		expect(
			extractFallback('x = "a \\"quoted\\"\nword"', { multiline: true }),
		).toEqual(['a \\"quoted\\"\nword']);
	});
});
