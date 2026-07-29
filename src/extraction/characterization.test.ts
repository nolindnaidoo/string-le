import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractStrings } from './extract';

/**
 * Characterization tests: pin the CURRENT extraction output per format,
 * including known bugs (YAML/TOML/INI route to the quoted-string fallback
 * so unquoted values are missed entirely; multiline quoted strings are
 * missed by the fallback regex; CSV keeps numeric cells and includes the
 * header row unless csvHasHeader is set; JSON drops keys and non-string
 * primitives and trims values). Behavior changes must update these
 * snapshots in the same commit, so every output diff is explicit.
 */

const FIXTURES: ReadonlyArray<{ fixture: string; fileType: string }> = [
	{ fixture: 'strings.json', fileType: 'json' },
	{ fixture: 'strings.yaml', fileType: 'yaml' },
	{ fixture: 'strings.yaml', fileType: 'yml' },
	{ fixture: 'strings.csv', fileType: 'csv' },
	{ fixture: 'strings.toml', fileType: 'toml' },
	{ fixture: 'strings.ini', fileType: 'ini' },
	{ fixture: 'strings.env', fileType: 'env' },
	{ fixture: 'strings.txt', fileType: 'fallback' },
];

function readFixture(name: string): string {
	return readFileSync(join(__dirname, '__fixtures__', name), 'utf8');
}

describe('extraction characterization', () => {
	for (const { fixture, fileType } of FIXTURES) {
		it(`${fixture} as ${fileType}`, () => {
			const result = extractStrings(readFixture(fixture), fileType);
			expect(result).toMatchSnapshot();
		});
	}

	it('strings.csv with csvHasHeader', () => {
		const result = extractStrings(readFixture('strings.csv'), 'csv', {
			csvHasHeader: true,
		});
		expect(result).toMatchSnapshot();
	});

	it('strings.csv with csvHasHeader and csvColumnIndex 1', () => {
		const result = extractStrings(readFixture('strings.csv'), 'csv', {
			csvHasHeader: true,
			csvColumnIndex: 1,
		});
		expect(result).toMatchSnapshot();
	});

	it('invalid JSON reports parse error and returns empty', () => {
		const errors: string[] = [];
		const result = extractStrings('{not valid json', 'json', {
			onParseError: (message) => errors.push(message),
		});
		expect(result).toEqual([]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('Invalid JSON');
	});

	it('unknown file type routes to fallback', () => {
		const text = 'body { content: "quoted css string"; }';
		expect(extractStrings(text, 'css')).toEqual(
			extractStrings(text, 'fallback'),
		);
	});
});
