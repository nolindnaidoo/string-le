import { describe, expect, it } from 'vitest';
import { extractStrings } from './extract';
import { exactPositions } from './positions';

function positionsOf(text: string, fileType: string) {
	return exactPositions(text, fileType, extractStrings(text, fileType));
}

describe('exactPositions', () => {
	it('places a source string, a quoted run in a comment, and a second string', () => {
		const text = 'const a = "x";\n// say "hi"\nconst b = \'y\';';
		expect(extractStrings(text, 'javascript')).toEqual(['x', 'hi', 'y']);
		expect(positionsOf(text, 'javascript')).toEqual([
			{ line: 1, column: 11 },
			{ line: 2, column: 8 },
			{ line: 3, column: 11 },
		]);
	});

	it('counts columns the way an editor does, past a character outside the BMP', () => {
		expect(positionsOf('s = "😀"; t = "b"', 'python')).toEqual([
			{ line: 1, column: 5 },
			{ line: 1, column: 15 },
		]);
	});

	it('places JSON string values and never a key', () => {
		expect(
			positionsOf('{"a": "first", "b": {"c": "second"}, "n": 7}', 'json'),
		).toEqual([
			{ line: 1, column: 7 },
			{ line: 1, column: 27 },
		]);
	});

	it('places quoted runs in plain text, counting what the engine trims off the front', () => {
		expect(positionsOf('\n\n  say \'a\' and "b"', 'markdown')).toEqual([
			{ line: 3, column: 7 },
			{ line: 3, column: 15 },
		]);
	});

	it('places none when JSON reports its values in another order than they are written', () => {
		const text = '{"2": "b", "1": "a"}';
		expect(extractStrings(text, 'json')).toEqual(['a', 'b']);
		expect(positionsOf(text, 'json')).toBeUndefined();
	});

	it('places none for a format whose parser already resolved the values', () => {
		for (const fileType of ['yaml', 'toml', 'ini', 'env', 'csv', 'jsonc'])
			expect(exactPositions('a = "b"', fileType, ['b'])).toBeUndefined();
	});

	it('places none when handed a list that is not what the scan finds', () => {
		expect(exactPositions('"a" "b"', 'markdown', ['a'])).toBeUndefined();
		expect(exactPositions('"a" "b"', 'markdown', ['a', 'c'])).toBeUndefined();
	});

	it('agrees with the extractor for every source language it reads', () => {
		const samples: Record<string, string> = {
			python: 'x = """doc\nstring"""\ny = \'a\'  # see "note"\n',
			rust: 'let a = "x"; let c = \'"\'; let r = r#"raw"#;',
			go: 'a := "x"\nb := `raw`\n',
			shellscript: 'echo "hi" \'there\'\ncat <<EOF\nbody\nEOF\n',
			php: '<?php $a = "x"; $b = \'y\';',
			ruby: 'a = "x"\nb = \'y\'\n',
			perl: 'my $a = "x"; my $b = \'y\';',
			csharp: 'var a = "x"; var b = @"y";',
			typescript: 'const a = `t`; const b = "x";',
		};
		for (const [fileType, text] of Object.entries(samples)) {
			const strings = extractStrings(text, fileType);
			const positions = exactPositions(text, fileType, strings);
			expect(strings.length, fileType).toBeGreaterThan(0);
			expect(positions, fileType).toHaveLength(strings.length);
		}
	});
});
