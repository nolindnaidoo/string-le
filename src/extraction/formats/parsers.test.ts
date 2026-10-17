import { describe, expect, it, vi } from 'vitest';
import { extractStrings } from '../extract';
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

	it('reads dotted keys and refuses what rust-ini refuses', () => {
		// The `ini` package reads an unclosed header as a key and a dotted key
		// beside its section as a value, so no document reaches the catch in
		// `parseIni`. The test this replaces claimed to exercise a parse
		// failure and asserted only that an array came back. The crate's
		// reader is stricter here, and SPEC.md records the difference.
		const errors: string[] = [];
		const onParseError = (message: string): void => {
			errors.push(message);
		};
		expect(
			extractIni('a.b = 1\na = 2\na.c = 3\n', { onParseError } as never),
		).toEqual(['1', '2', '3']);
		expect(errors).toEqual([]);
		// rust-ini refuses an unclosed section header, as the crate does.
		expect(
			extractIni('[unclosed\nname = x', { onParseError } as never),
		).toEqual([]);
		expect(errors).toEqual([
			`Invalid INI: 2:9 expecting "[Some(']')]" but found EOF.`,
		]);
		expect(() => extractIni('a.b = 1\na = 2\na.c = 3\n', {})).not.toThrow();
	});

	it('handles a file with sections but no values', () => {
		expect(extractIni('[empty]\n', {})).toHaveLength(0);
	});
});

describe('nesting bounds on the parsed formats', () => {
	// Each bound is the weakest parser behind the format on either side, so a
	// document at the bound reads on both servers and one past it is refused
	// by both with the same words before either parser sees it.
	const errorsOf = (): {
		errors: string[];
		onParseError: (m: string) => void;
	} => {
		const errors: string[] = [];
		return { errors, onParseError: (message) => errors.push(message) };
	};

	it('TOML: 80 levels read, 81 refused', () => {
		const deep = (n: number): string =>
			`a = ${'{ b = '.repeat(n)}"x"${' }'.repeat(n)}`;
		const { errors, onParseError } = errorsOf();
		expect(extractStrings(deep(80), 'toml', { onParseError })).toEqual(['x']);
		expect(extractStrings(deep(81), 'toml', { onParseError })).toEqual([]);
		expect(errors).toEqual(['Invalid TOML: nested deeper than 80 levels']);
	});

	it('YAML: 98 levels read, 99 refused', () => {
		const deep = (n: number): string => `${'['.repeat(n)}"x"${']'.repeat(n)}`;
		const { errors, onParseError } = errorsOf();
		expect(extractStrings(deep(98), 'yaml', { onParseError })).toEqual(['x']);
		expect(extractStrings(deep(99), 'yaml', { onParseError })).toEqual([]);
		expect(errors).toEqual(['Invalid YAML: nested deeper than 98 levels']);
	});

	it('JSONC: counted on the raw text, comments included, as the crate counts it', () => {
		const { errors, onParseError } = errorsOf();
		expect(
			extractStrings(`// ${'['.repeat(600)}\n["x"]`, 'jsonc', { onParseError }),
		).toEqual([]);
		expect(errors).toEqual(['Invalid JSON: nested deeper than 512 levels']);
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
