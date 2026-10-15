/**
 * Requires the npm command line to behave exactly as the Rust one does.
 *
 * Both install a command named `string-le`, so a person or a CI step cannot
 * tell which one they have. This is a different contract from
 * `check-extraction-parity.ts`, which holds the extension's engine equal to
 * the crate's: here the whole terminal surface is compared, the walk, the
 * positions, the exit codes, stdout and stderr byte for byte, and the two
 * tools `string-le mcp` serves.
 *
 * One thing is not compared, and SPEC.md names it: the words a parser uses to
 * refuse a document. Both binaries report the same file as unparsed under the
 * same `Invalid <FORMAT>: ` prefix, and what follows is jsonc-parser, saphyr
 * or the `toml` crate on one side and `JSON.parse`, js-yaml or `@iarna/toml`
 * on the other. That text is cut back to its prefix before comparing, except
 * the nesting refusal, which both sides word identically and which is held.
 *
 * Every case runs both binaries over one generated tree with stdout piped,
 * which is how a script sees them. `--version` is compared too: every surface
 * carries one version, and two binaries of one name disagreeing about it is
 * the first thing a person comparing them would see.
 *
 * Run: bun run build:cli && cargo build --locked --manifest-path crate/Cargo.toml
 *      bun scripts/check-cli-parity.ts
 */
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmdirSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const RUST = process.env.STRING_LE_BIN ?? join(ROOT, 'crate', 'target', 'debug', 'string-le');
const NODE_CLI = join(ROOT, 'cli', 'cli.js');

interface Case {
	readonly args: readonly string[];
	readonly stdin?: string | Buffer;
}

interface Outcome {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

for (const [label, path] of [
	['the Rust binary', RUST],
	['cli/cli.js', NODE_CLI],
] as const) {
	if (!existsSync(path)) {
		console.error(`FAIL: ${label} is missing at ${path}. Build it first.`);
		process.exit(1);
	}
}

const tree = mkdtempSync(join(tmpdir(), 'string-le-cli-parity-'));
const created: string[] = [];
const dirs: string[] = [tree];

function dir(relative: string): void {
	mkdirSync(join(tree, relative));
	dirs.push(join(tree, relative));
}

function file(relative: string, content: string | Buffer): void {
	writeFileSync(join(tree, relative), content);
	created.push(join(tree, relative));
}

const canLock = process.platform !== 'win32' && process.getuid?.() !== 0;

function build(): void {
	dir('repo');
	dir('repo/.git');
	dir('repo/.git/info');
	file('repo/.git/info/exclude', 'excluded.txt\n');
	file('repo/.gitignore', 'ignored.ts\nbuild/\n*.log\n!keep.log\n');
	file('repo/ignored.ts', "const a = 'ignored';\n");
	file('repo/excluded.txt', '"excluded"\n');
	file('repo/noise.log', '"noise"\n');
	file('repo/keep.log', '"kept log"\n');
	dir('repo/build');
	file('repo/build/out.js', "const b = 'built';\n");

	file(
		'repo/config.json',
		'{\n  "b": "two",\n  "10": "ten",\n  "1": "one",\n  "esc": "first\\nsecond",\n' +
			'  "quote": "say \\"hi\\"",\n  "dup": "first",\n  "dup": "second",\n' +
			'  "pad": "  padded  ",\n  "blank": "   ",\n  "n": 1,\n  "list": ["x", "x", {"deep": "café 🎯"}],\n' +
			'  "same": "two"\n}\n',
	);
	file(
		'repo/settings.jsonc',
		'// a comment with "quotes": "not a value"\n{\n  /* block "x" */ "a": "http://kept//here",\n' +
			'  "b": ["one", "two",],\n}\n',
	);
	file('repo/only-comments.jsonc', '// nothing here\n/* or here */\n');
	file(
		'repo/app.yaml',
		'title: Hello\nbody: |\n  first line\n  second line\nfolded: >\n  one\n  two\nquoted: "Hello"\n' +
			"single: 'it''s'\nlist:\n  - alpha\n  - beta\nanchor: &a shared\nref: *a\n",
	);
	file('repo/data.csv', 'name,city,note\nAda, "London, UK",\n"Grace","New York","said ""hi"""\nragged\n');
	file('repo/data.tsv', 'a\tb\nc\td\n');
	file(
		'repo/config.toml',
		'title = "Hello"\nlit = \'C:\\path\'\nmulti = """\nfirst\nsecond"""\n[table]\nname = "inner"\narr = ["x", "y"]\n',
	);
	file('repo/settings.ini', '[section]\nname = "quoted"\npath = C:\\Users\\test\nbare = plain value\n');
	file('repo/.env', 'export NAME=plain\nQUOTED="with space"\n# COMMENT="no"\nEMPTY=\n');
	file('repo/.env.local', 'LOG_DIR=./my logs/app.log\n');
	file(
		'repo/main.py',
		'def f():\n    """One\n    docstring."""\n    return f"Hello {name}" + \'x\' + r"raw\\n"\n',
	);
	file('repo/lib.rs', 'fn main() {\n    let a = "text";\n    let b = r#"raw "quoted""#;\n    let c = \'c\';\n}\n');
	file('repo/main.go', 'package main\nvar a = "go"\nvar b = `back\ntick`\n');
	file('repo/run.sh', 'echo "Hello $USER"\necho \'single\'\n');
	file('repo/index.php', '<?php echo "php"; echo \'single\'; ?>\n');
	file('repo/app.rb', 'puts "ruby"\nputs \'single\'\n');
	file('repo/script.pl', 'print "perl\\n";\n');
	file('repo/Program.cs', 'var a = @"verbatim ""q""";\nvar b = $"interp {x}";\n');
	file('repo/app.js', 'const t = `Hello ${name}, welcome`;\nconst u = "x";\n');
	file(
		'repo/messages.ts',
		"export const m = 'Delete this?';\nexport const n = \"Delete this?\";\nconst t = `multi\nline`;\n",
	);
	file('repo/notes.md', 'Some `code` and "quoted words" in prose.\n');
	file('repo/notes.txt', 'say "one\ntwo" then "three"\n');
	file('repo/Makefile', 'NAME = "make"\n');
	file('repo/crlf.yaml', 'a: first\r\nb: second\r\n');
	file('repo/bom.json', '\uFEFF{"a": "after bom"}\n');
	file('repo/lead.json', '\n\n   {"a": "indented"}\n');
	file('repo/empty.json', '');
	file('repo/blank.yaml', '   \n\n');
	file('repo/latin1.txt', Buffer.from([0x22, 0x63, 0x61, 0x66, 0xe9, 0x22, 0x0a]));
	file('repo/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a, 0x0a]));
	file('repo/bad.json', '{"a": "x",}\n');
	file('repo/bad.yaml', 'x: [1, 2\n');
	file('repo/bad.toml', 'k = "v"\n[t\n');
	file('repo/bad.csv', 'a,"unterminated\n');
	file('repo/deep.json', `${'['.repeat(513)}"x"${']'.repeat(513)}\n`);
	file('repo/ünïcode.json', '{"k": "ünïcode"}\n');
	file('repo/od\\d.json', '{"k": "backslash"}\n');
	dir('repo/a');
	file('repo/a/b.json', '{"k": "nested"}\n');
	file('repo/a.json', '{"k": "sibling"}\n');
	dir('repo/nested');
	file('repo/nested/.gitignore', '!ignored.ts\nlocal.txt\n');
	file('repo/nested/ignored.ts', "const n = 'unignored';\n");
	file('repo/nested/local.txt', '"local"\n');
	file('repo/nested/.ignore', 'dot-ignored.txt\n');
	file('repo/nested/dot-ignored.txt', '"dot ignored"\n');
	file('repo/.hidden.json', '{"h": "hidden"}\n');
	dir('repo/.hiddendir');
	file('repo/.hiddendir/in.json', '{"h": "hidden dir"}\n');
	symlinkSync(join(tree, 'repo', 'a.json'), join(tree, 'repo', 'link.json'));
	created.push(join(tree, 'repo', 'link.json'));

	dir('loose');
	file('loose/.gitignore', 'not-a-repo.txt\n');
	file('loose/not-a-repo.txt', '"outside a repo"\n');
	file('loose/.ignore', 'dot.txt\n');
	file('loose/dot.txt', '"dot"\n');

	if (canLock) {
		file('repo/locked.json', '{"l": "locked"}\n');
		chmodSync(join(tree, 'repo', 'locked.json'), 0o000);
		dir('closed');
		dir('closed/shut');
		file('closed/shut/inside.json', '{"s": "shut"}\n');
		chmodSync(join(tree, 'closed', 'shut'), 0o000);
	}
}

function cases(): readonly Case[] {
	const repo = join(tree, 'repo');
	const at = (name: string): string => join(repo, name);
	return [
		{ args: ['--help'] },
		{ args: ['--version'] },
		{ args: ['-V'] },
		{ args: ['-h'] },
		{ args: [] },
		{ args: [repo] },
		{ args: [`${repo}/`] },
		{ args: [repo, '--dedupe'] },
		{ args: [repo, '--values'] },
		{ args: [repo, '--values', '--dedupe'] },
		{ args: [repo, '--hidden'] },
		{ args: [repo, '--no-ignore'] },
		{ args: [repo, '--hidden', '--no-ignore'] },
		{ args: [repo, '--strict'] },
		{ args: [repo, '--multiline'] },
		{ args: [repo, '--format', 'json'] },
		{ args: [repo, '--format', 'JSONC'] },
		// Not the whole tree: config.json repeats a key, which js-yaml refuses
		// and saphyr reads, a parser strictness SPEC.md already names.
		{ args: [at('app.yaml'), at('settings.ini'), at('main.py'), '--format', '.yml'] },
		{ args: [repo, '--format', 'klingon'] },
		{ args: [repo, '--format', 'fallback', '--multiline'] },
		{ args: [repo, '--format'] },
		{ args: [at('data.csv'), '--csv-header'] },
		{ args: [at('data.csv'), '--csv-column', '1'] },
		{ args: [at('data.csv'), '--csv-header', '--csv-column', '+2'] },
		{ args: [at('data.csv'), '--csv-column', '9'] },
		{ args: [at('data.tsv'), '--csv-column', '0'] },
		{ args: [at('data.csv'), '--csv-column', '-1'] },
		{ args: [at('data.csv'), '--csv-column', 'second'] },
		{ args: [at('data.csv'), '--csv-column', ' 1'] },
		{ args: [at('data.csv'), '--csv-column', '99999999999999999999999'] },
		{ args: [at('data.csv'), '--csv-column'] },
		{ args: [at('ignored.ts'), at('.hidden.json'), at('config.json')] },
		{ args: [at('config.json'), at('config.json')] },
		{ args: [at('a.json'), at('a')] },
		{ args: [at('.env.local'), at('.env')] },
		{ args: [at('logo.png')] },
		{ args: [at('latin1.txt'), '--strict'] },
		{ args: [at('empty.json')] },
		{ args: [at('bad.yaml'), at('bad.json'), '--values'] },
		{ args: [at('notes.txt'), '--multiline'] },
		{ args: [join(tree, 'loose')] },
		{ args: [join(tree, 'missing')] },
		{ args: [repo, '--dedup'] },
		{ args: [repo, '--help'] },
		{ args: [repo, '-'] },
		{ args: ['--stdin'], stdin: "const a = 'from stdin';\n" },
		{ args: ['--stdin', repo] },
		{ args: ['--stdin', '--format', 'json'], stdin: '{"a": "x", "b": "y"}\n' },
		{ args: ['--stdin', '--format', 'yaml', '--values'], stdin: 'a: x\nb: |\n  y\n  z\n' },
		{ args: ['--stdin', '--format', 'json'], stdin: '\uFEFF{"a": "bom"}\n' },
		{ args: ['--stdin'], stdin: Buffer.from([0x22, 0xff, 0x22, 0x0a]) },
		{ args: ['--stdin', '--format', 'json'], stdin: '' },
		{ args: ['--stdin', '--format', 'json'], stdin: '{"a": ' },
		{ args: ['--stdin', '--dedupe'], stdin: '"a" "b" "a"\n' },
		...(canLock ? [{ args: [join(tree, 'closed')] }] : []),
		{ args: [join(ROOT, 'crate', 'fixtures', 'documents')] },
		{ args: [join(ROOT, 'crate', 'fixtures', 'documents'), '--dedupe', '--multiline'] },
		{ args: [join(ROOT, 'src', 'extraction', '__fixtures__')] },
		{ args: [join(ROOT, 'samples')] },
	];
}

/**
 * Cut a parser's own words back to the shared prefix. The nesting refusal is
 * the one parse message both sides word identically, so it is left whole.
 */
function shared(message: string): string {
	if (/^Invalid [A-Z]+: nested deeper than \d+ levels$/.test(message)) return message;
	const prefix = /^Invalid [A-Z]+: /.exec(message)?.[0];
	return prefix ? `${prefix}<parser's words>` : message;
}

function withSharedMessages(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withSharedMessages);
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			key,
			key === 'message' && typeof item === 'string' ? shared(item) : withSharedMessages(item),
		]),
	);
}

/** The parse messages a binary reported for a case, read from its own JSON. */
function parseMessages(command: readonly string[], testCase: Case): string[] {
	const reports = run(command, {
		...testCase,
		args: testCase.args.filter((arg) => arg !== '--values'),
	}).stdout;
	return reports
		.split('\n')
		.filter((line) => line.startsWith('{'))
		.flatMap((line) => (JSON.parse(line) as { diagnostics?: { code: string; message: string }[] }).diagnostics ?? [])
		.filter((diagnostic) => diagnostic.code === 'unparsed')
		.map((diagnostic) => diagnostic.message);
}

function run(command: readonly string[], testCase: Case): Outcome {
	const [program, ...rest] = command as [string, ...string[]];
	const result = spawnSync(program, [...rest, ...testCase.args], {
		input: testCase.stdin ?? '',
		cwd: tree,
	});
	return {
		status: result.status,
		stdout: result.stdout.toString('utf8'),
		stderr: result.stderr.toString('utf8'),
	};
}

/**
 * A line carrying a parse message is compared re-serialized with the message
 * cut back; every other line is compared exactly as written.
 */
function comparableOutcome(command: readonly string[], testCase: Case): Outcome {
	const outcome = run(command, testCase);
	const messages = parseMessages(command, testCase);
	const stdout = outcome.stdout
		.split('\n')
		.map((line) => {
			if (!line.startsWith('{') || !line.includes('"unparsed"')) return line;
			return JSON.stringify(withSharedMessages(JSON.parse(line)));
		})
		.join('\n');
	const stderr = messages.reduce((text, message) => text.replaceAll(message, shared(message)), outcome.stderr);
	return { status: outcome.status, stdout, stderr };
}

function compareCli(): string[] {
	const failures: string[] = [];
	for (const testCase of cases()) {
		const rust = comparableOutcome([RUST], testCase);
		const node = comparableOutcome([process.execPath, NODE_CLI], testCase);
		for (const field of ['status', 'stdout', 'stderr'] as const) {
			if (rust[field] === node[field]) continue;
			failures.push(
				`string-le ${testCase.args.join(' ')}\n  ${field} differs\n` +
					`  rust: ${JSON.stringify(rust[field])}\n  node: ${JSON.stringify(node[field])}`,
			);
		}
	}
	return failures;
}

/** Key order is not compared: the crate's JSON values are sorted maps. */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
	);
}

/** Tool results with the text half parsed, so pretty-printing order cannot differ. */
function comparable(response: Record<string, unknown>): unknown {
	const result = response.result as Record<string, unknown> | undefined;
	const content = result?.content as { type: string; text: string }[] | undefined;
	if (!content || result?.isError === true) return canonical(response);
	const parsed = content.map((item) => ({ ...item, text: JSON.parse(item.text) }));
	return canonical(withSharedMessages({ ...response, result: { ...result, content: parsed } }));
}

function mcpRequests(): readonly Record<string, unknown>[] {
	const repo = join(tree, 'repo');
	const call = (id: number, name: string, args: Record<string, unknown>) => ({
		jsonrpc: '2.0',
		id,
		method: 'tools/call',
		params: { name, arguments: args },
	});
	return [
		call(1, 'string_le_scan', { path: repo }),
		call(2, 'string_le_scan', { paths: [repo, join(tree, 'loose')], dedupe: true }),
		call(3, 'string_le_scan', { path: repo, hidden: true, ignored: true, format: 'json' }),
		call(4, 'string_le_scan', { path: repo, format: 'klingon', multiline: true }),
		call(5, 'string_le_scan', { paths: [] }),
		call(6, 'string_le_scan', {}),
		call(7, 'string_le_scan', { path: join(tree, 'missing') }),
		call(8, 'string_le_scan', { path: join(repo, 'config.json'), format: 7 }),
		call(9, 'extract_strings', { content: '{"a": "x"}', format: 'json' }),
		call(10, 'extract_strings', { content: 'a: x\n', filename: 'src/.env.local' }),
	];
}

function serve(command: readonly string[], requests: readonly unknown[]): unknown[] {
	const [program, ...rest] = command as [string, ...string[]];
	const input = `${requests.map((request) => JSON.stringify(request)).join('\n')}\n`;
	const result = spawnSync(program, [...rest, 'mcp'], { input, encoding: 'utf8', cwd: tree });
	return result.stdout
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function compareMcp(): string[] {
	const failures: string[] = [];
	const list = { jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} };
	const requests = [list, ...mcpRequests()];
	const rust = serve([RUST], requests) as Record<string, unknown>[];
	const node = serve([process.execPath, NODE_CLI], requests) as Record<string, unknown>[];
	// By id, not by line: the npm server answers each call as it finishes,
	// which JSON-RPC allows, so its replies need not arrive in request order.
	const byId = (replies: Record<string, unknown>[], id: unknown) =>
		replies.find((reply) => reply.id === id) ?? {};
	requests.forEach((request) => {
		const left = JSON.stringify(comparable(byId(rust, request.id)));
		const right = JSON.stringify(comparable(byId(node, request.id)));
		if (left === right) return;
		failures.push(
			`string-le mcp ${JSON.stringify((request as { params: unknown }).params)}\n` +
				`  rust: ${left}\n  node: ${right}`,
		);
	});
	return failures;
}

function cleanUp(): void {
	const locked = join(tree, 'repo', 'locked.json');
	if (existsSync(locked)) chmodSync(locked, 0o600);
	const shut = join(tree, 'closed', 'shut');
	if (existsSync(shut)) chmodSync(shut, 0o700);
	for (const path of created) unlinkSync(path);
	for (const path of [...dirs].reverse()) rmdirSync(path);
}

build();
let failures: string[];
try {
	failures = [...compareCli(), ...compareMcp()];
} finally {
	cleanUp();
}

if (failures.length > 0) {
	console.error(failures.join('\n\n'));
	console.error(`\nFAIL: ${failures.length} difference(s) between the npm and Rust CLIs`);
	process.exit(1);
}
console.log(`OK: the npm CLI matches the Rust CLI on ${cases().length} commands and the MCP surface`);
