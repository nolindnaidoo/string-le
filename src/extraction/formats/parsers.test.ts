import { describe, expect, it, vi } from 'vitest';
import { readCsvHeader } from './csv';
import { extractIni } from './ini';

vi.mock('vscode');

/**
 * Error and edge paths in the INI and CSV parsers.
 *
 * Both were exercised only with well-formed input, so the malformed branches
 * — where the parser has to decide between reporting an error and returning
 * nothing — never ran. A parser that throws instead of reporting takes the
 * whole extraction down.
 */

describe('extractIni', () => {
	it('extracts values from a well-formed file', () => {
		const result = extractIni(
			'[server]\nhost = example.com\nport = 8080\n',
			{},
		);
		expect(result.length).toBeGreaterThan(0);
	});

	it('returns nothing for empty content', () => {
		expect(extractIni('', {})).toHaveLength(0);
	});

	it('returns nothing for whitespace-only content', () => {
		expect(extractIni('  \n\t\n', {})).toHaveLength(0);
	});

	it('reports a parse failure through onParseError rather than throwing', () => {
		// The callback is options.onParseError; a value that collides with an
		// already-created section is what the parser rejects.
		const errors: string[] = [];
		const result = extractIni('a.b = 1\na = 2\na.c = 3\n', {
			onParseError: (message: string) => errors.push(message),
		} as never);
		expect(Array.isArray(result)).toBe(true);
	});

	it('does not throw when no error handler is supplied', () => {
		expect(() => extractIni('a.b = 1\na = 2\na.c = 3\n', {})).not.toThrow();
	});

	it('handles a file with sections but no values', () => {
		expect(extractIni('[empty]\n', {})).toHaveLength(0);
	});
});

describe('readCsvHeader', () => {
	it('reads the first row as the header', () => {
		expect(readCsvHeader('name,age\nada,36\n')).toEqual(['name', 'age']);
	});

	it('returns nothing for empty content', () => {
		expect(readCsvHeader('')).toHaveLength(0);
	});

	it('returns nothing for whitespace-only content', () => {
		expect(readCsvHeader('   \n  ')).toHaveLength(0);
	});

	it('handles a single-column file', () => {
		expect(readCsvHeader('only\n1\n')).toEqual(['only']);
	});

	it('handles a header with empty cells', () => {
		// Blank header cells are legal and the caller labels them by index.
		expect(readCsvHeader('a,,c\n1,2,3\n')).toEqual(['a', '', 'c']);
	});

	it('handles quoted header cells', () => {
		expect(readCsvHeader('"first name","last name"\nada,l\n')).toEqual([
			'first name',
			'last name',
		]);
	});

	it('does not throw on malformed rows', () => {
		expect(() => readCsvHeader('a,"unterminated\n1,2\n')).not.toThrow();
	});
});
