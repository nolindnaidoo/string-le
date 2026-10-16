import {
	mkdirSync,
	mkdtempSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from './args';
import { rustIoMessage } from './ioError';
import { jsonSpans, locate } from './locate';
import { run } from './run';
import { DEFAULT_SCAN, exitCode, describe as line, scanContent } from './scan';
import { FLAGS, USAGE } from './usage';
import { collect, DEFAULT_WALK } from './walk';

describe('usage', () => {
	it('names every flag the parser accepts, and no other', () => {
		const named = new Set(
			USAGE.split(/\s+/)
				.filter((word) => word.startsWith('--'))
				.map((word) => word.replace(/[,.:;]+$/, ''))
				.filter((word) => word !== '--version' && word !== '--help'),
		);
		expect([...named].sort()).toEqual([...FLAGS].sort());
	});

	it('offers no judgment about which strings matter', () => {
		for (const word of ['spell', 'translat', 'banned', 'score'])
			expect(USAGE).not.toContain(word);
	});
});

describe('parse', () => {
	it('refuses an unknown flag rather than ignoring it', () => {
		expect(() => parse(['--dedup', 'x'])).toThrow('--dedup is not an option');
	});

	it('falls back on a format it does not name, and resolves one it does', () => {
		expect(parse(['--format', 'klingon', 'x']).scan.format).toBe('fallback');
		expect(parse(['--format', '.YML', 'x']).scan.format).toBe('yaml');
	});

	it('reads a column number as Rust reads a usize', () => {
		const column = (value: string) =>
			parse(['--csv-column', value, 'x']).scan.extract.csvColumn;
		expect(column('2')).toBe(2);
		expect(column('+2')).toBe(2);
		for (const refused of ['-1', ' 1', '1.0', 'second', '', '1'.repeat(25)])
			expect(() => column(refused), refused).toThrow('is not a column number');
	});

	it('refuses a flag with no value', () => {
		expect(() => parse(['--format'])).toThrow('--format needs a format');
		expect(() => parse(['--csv-column'])).toThrow(
			'--csv-column needs a column number',
		);
	});

	it('refuses naming nothing, and stdin with files', () => {
		expect(() => parse([])).toThrow('name a file or a directory');
		expect(() => parse(['--stdin', 'x'])).toThrow('takes no file arguments');
	});
});

describe('locate', () => {
	it('gives repeated values their own occurrences, and never goes back', () => {
		const found = locate('a: same\nb: other\nc: same\n', [
			'same',
			'other',
			'same',
			'other',
		]);
		expect(found.map((item) => item.position?.line ?? null)).toEqual([
			1,
			2,
			3,
			null,
		]);
	});

	it('counts columns in UTF-16 units, as an editor does', () => {
		const [found] = locate('🎯 é = "x"\n', ['x']);
		expect(found?.position).toEqual({ line: 1, column: 9 });
	});

	it('places JSON in source order, keeps a repeated key, and skips keys', () => {
		const spans = jsonSpans('{"2": "b", "1": "a", "k": "x", "k": "y"}', false);
		expect(spans.map((span) => span.value)).toEqual(['b', 'a', 'x', 'y']);
		expect(spans[0]?.offset).toBe(7);
	});

	it('reads JSONC around its comments, and refuses a broken document', () => {
		expect(
			jsonSpans('// "no": "x"\n{"a": "yes",}', true).map((s) => s.value),
		).toEqual(['yes']);
		expect(jsonSpans('{"a": "x",}', false)).toEqual([]);
	});
});

describe('scan', () => {
	it('exits 0 with strings and 1 with none, as grep does', () => {
		const found = scanContent('{"a":"one"}', 'a.json', 'json', DEFAULT_SCAN);
		const none = scanContent('{}', 'a.json', 'json', DEFAULT_SCAN);
		expect(exitCode([found], false)).toBe(0);
		expect(exitCode([none], false)).toBe(1);
		expect(exitCode([], false)).toBe(1);
	});

	it('reports a parse failure as a warning that does not end the run', () => {
		const report = scanContent('{not json', 'a.json', 'json', DEFAULT_SCAN);
		expect(report.diagnostics).toHaveLength(1);
		expect(report.diagnostics[0]).toMatchObject({
			severity: 'warning',
			code: 'unparsed',
		});
		expect(report.diagnostics[0]?.message.startsWith('Invalid JSON: ')).toBe(
			true,
		);
		expect(exitCode([report], false)).toBe(1);
	});

	it('counts a value the source does not spell, and gives it no position', () => {
		const report = scanContent(
			'a: plain\nb: |\n  first\n  second\n',
			'a.yaml',
			'yaml',
			DEFAULT_SCAN,
		);
		expect(report.summary).toEqual({ strings: 2, unlocated: 1 });
		expect(report.strings[1]).toEqual({ value: 'first\nsecond' });
		expect(line(report, report.strings[1] as never)).toBe(
			'a.yaml:-  first\nsecond',
		);
	});

	it('places a JSON value by its span, escapes and all', () => {
		const report = scanContent(
			'\n  {"a":"first\\nsecond"}',
			'a.json',
			'json',
			DEFAULT_SCAN,
		);
		expect(report.strings[0]).toEqual({
			value: 'first\nsecond',
			line: 2,
			column: 9,
		});
	});

	it('keeps the first occurrence, with its own position, under --dedupe', () => {
		const report = scanContent(
			'{"a":"same","b":"other","c":"same"}',
			'a.json',
			'json',
			{ ...DEFAULT_SCAN, dedupe: true },
		);
		expect(report.strings.map((found) => found.value)).toEqual([
			'same',
			'other',
		]);
		expect(report.strings[0]?.column).toBe(7);
	});

	it('reads an empty document as no strings, not an error', () => {
		const report = scanContent('   \n', 'a.json', 'json', DEFAULT_SCAN);
		expect(report.diagnostics).toEqual([]);
		expect(report.summary.strings).toBe(0);
	});
});

describe('ioError', () => {
	it('speaks as Rust does about a missing file', () => {
		const error = Object.assign(
			new Error("ENOENT: no such file or directory, stat 'x'"),
			{ code: 'ENOENT', errno: -2 },
		);
		expect(rustIoMessage(error, 'darwin')).toBe(
			'No such file or directory (os error 2)',
		);
	});

	const failure = (code: string, errno: number, path?: string) =>
		Object.assign(new Error(`${code}: failed`), { code, errno, path });

	it('speaks as Rust does on Linux and Windows too', () => {
		expect(rustIoMessage(failure('EBUSY', -16), 'darwin')).toBe(
			'Resource busy (os error 16)',
		);
		expect(rustIoMessage(failure('EBUSY', -16), 'linux')).toBe(
			'Device or resource busy (os error 16)',
		);
		expect(rustIoMessage(failure('EPERM', -4048), 'win32')).toBe(
			'Access is denied. (os error 5)',
		);
	});

	/** libuv folds both Windows codes into ENOENT, numbered -4058. */
	it('tells a missing file from a missing directory on Windows', () => {
		const root = mkdtempSync(join(tmpdir(), 'io-error-'));
		writeFileSync(join(root, 'file'), '');
		const missing = (...parts: string[]) =>
			rustIoMessage(failure('ENOENT', -4058, join(root, ...parts)), 'win32');
		try {
			expect(missing('gone')).toBe(
				'The system cannot find the file specified. (os error 2)',
			);
			expect(missing('no', 'gone')).toBe(
				'The system cannot find the path specified. (os error 3)',
			);
			expect(missing('file', 'gone')).toBe(
				'The system cannot find the path specified. (os error 3)',
			);
		} finally {
			unlinkSync(join(root, 'file'));
			rmdirSync(root);
		}
	});
});

describe('walk and run', () => {
	const made: string[] = [];
	const dirs: string[] = [];

	function tree(files: Record<string, string>): string {
		const root = mkdtempSync(join(tmpdir(), 'string-le-cli-test-'));
		dirs.push(root);
		for (const [name, content] of Object.entries(files)) {
			const parts = name.split('/');
			for (let depth = 1; depth < parts.length; depth++) {
				const dir = join(root, ...parts.slice(0, depth));
				if (dirs.includes(dir)) continue;
				mkdirSync(dir);
				dirs.push(dir);
			}
			writeFileSync(join(root, name), content);
			made.push(join(root, name));
		}
		return root;
	}

	function io(stdin = '') {
		const captured = { out: '', err: '' };
		return {
			captured,
			io: {
				stdout: (text: string) => {
					captured.out += text;
				},
				stderr: (text: string) => {
					captured.err += text;
				},
				stdoutIsTerminal: false,
				readStdin: async () => new TextEncoder().encode(stdin),
				version: '0.0.0',
			},
		};
	}

	afterEach(() => {
		for (const file of made.splice(0)) unlinkSync(file);
		for (const dir of dirs.splice(0).reverse()) rmdirSync(dir);
	});

	it('sorts by component, as Rust sorts a path', () => {
		const root = tree({ 'a.json': '', 'a/b.json': '', 'z.json': '' });
		const walked = collect([root], DEFAULT_WALK).map((path) =>
			path.slice(root.length + 1),
		);
		expect(walked).toEqual([join('a', 'b.json'), 'a.json', 'z.json']);
	});

	it('writes JSON Lines to a pipe and the summary to stderr', async () => {
		const root = tree({ 'm.ts': "const m = 'Delete this?';\n" });
		const { captured, io: handles } = io();
		const code = await run([join(root, 'm.ts')], handles);
		expect(code).toBe(0);
		expect(JSON.parse(captured.out)).toMatchObject({
			format: 'typescript',
			strings: [{ value: 'Delete this?', line: 1, column: 12 }],
			summary: { strings: 1, unlocated: 0 },
		});
		expect(captured.err.endsWith('1 string in 1 file\n')).toBe(true);
	});

	it('writes nothing to a terminal but the values it was asked for', async () => {
		const root = tree({ 'a.json': '{"a": "x"}\n' });
		const { captured, io: handles } = io();
		const terminal = { ...handles, stdoutIsTerminal: true };
		await run([root], terminal);
		expect(captured.out).toBe('');
		await run([root, '--values'], terminal);
		expect(captured.out).toBe('x\n');
	});

	it('reads stdin as the fallback when no format is named', async () => {
		const { captured, io: handles } = io('say "hello"\n');
		expect(await run(['--stdin'], handles)).toBe(0);
		expect(JSON.parse(captured.out)).toMatchObject({
			file: '<stdin>',
			format: 'fallback',
			strings: [{ value: 'hello', line: 1, column: 6 }],
		});
	});
});
