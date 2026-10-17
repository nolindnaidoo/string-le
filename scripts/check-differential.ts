/**
 * The shared `extract_strings` tool, generated rather than hand-written.
 *
 * One tool name, one schema, two servers: the npm server in
 * `src/mcp/tools.ts` and the crate's in `crate/src/mcp/extract.rs`. An
 * agent asking for a document's strings must get the same answer
 * whichever server it happens to reach, so this feeds both the same
 * generated documents and requires the same envelope back.
 *
 * `crate/fixtures/mcp-extract-strings.json` pins the cases somebody
 * thought of. This generates the ones nobody did — which is the only
 * thing that properly tests ten source-language scanners written twice.
 *
 * **Scope is the shared tool, not the two surfaces.** The extension is
 * IDE-first and the CLI is terminal-first, so the walk, `--strict`,
 * `--values`, exit codes and `--multiline` are the crate's alone and are
 * not compared here. What is compared is the one thing both servers
 * promise to answer identically.
 *
 * Documents are generated for the formats with no parse-failure path —
 * the ten source languages, dotenv and the fallback. The parsed formats
 * read with transcriptions of the crate's own parsers, which
 * `src/parsers/parsers.test.ts` holds to the crates themselves; here a set
 * of broken and once-divergent documents is held whole, refusal text
 * included, through both servers.
 *
 *   bun scripts/check-differential.ts [--seed <n>] [--cases <n>]
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { TOOLS } from '../src/mcp/tools';

const ROOT = join(import.meta.dir, '..');
const BINARY = join(ROOT, 'crate', 'target', 'debug', 'string-le');

const argv = process.argv.slice(2);

function flag(name: string, fallback: number): number {
	const at = argv.indexOf(`--${name}`);
	if (at === -1 || at + 1 >= argv.length) return fallback;
	const value = Number(argv[at + 1]);
	return Number.isFinite(value) ? value : fallback;
}

/**
 * Fixed unless asked otherwise, and always printed. A failure nobody can
 * reproduce is a failure somebody reruns rather than reads.
 */
const SEED = flag('seed', Number(process.env.DIFFERENTIAL_SEED ?? 20260812));
const CASES = flag('cases', Number(process.env.DIFFERENTIAL_CASES ?? 600));

/** Deterministic, small, and the same arithmetic every run. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = mulberry32(SEED);

function pick<T>(items: readonly T[]): T {
	return items[Math.floor(random() * items.length)] as T;
}

function chance(probability: number): boolean {
	return random() < probability;
}

/**
 * The values a crate should find. Deliberately awkward: a quote of
 * another style, a brace, a backslash, an astral character, a lone
 * carriage return — every one of them something a delimiter scanner can
 * get wrong.
 */
const VALUES: readonly string[] = Object.freeze([
	'Delete this permanently?',
	"It's fine",
	'He said "hi" loudly',
	'C:\\Users\\test',
	'a ${count} b',
	'line one\rline two',
	'café — naïve',
	'🎯 target reached',
	'{"nested":"json"}',
	'tag `code` span',
	'trailing backslash \\',
	'#not-a-comment',
	'<<NOTAHEREDOC',
	'=begin not a block',
	'a\tb',
	'/* not a comment */',
	'0123456789',
	'\u{feff}mark inside',
]);

/** Every format whose extractor has no shape it can reject. */
const GENERATED_FORMATS: readonly string[] = Object.freeze([
	'python',
	'rust',
	'go',
	'shellscript',
	'php',
	'ruby',
	'perl',
	'csharp',
	'javascript',
	'typescript',
	'env',
	'fallback',
]);

const TAGS: readonly string[] = Object.freeze(['EOF', 'EOT', 'NOW', 'END', '_X']);

/** One literal, in the syntax of one language. */
function literal(format: string, value: string): string {
	switch (format) {
		case 'python':
			return pick([
				`x = "${value}"`,
				`x = '${value}'`,
				`x = """${value}"""`,
				`x = '''${value}'''`,
				`x = f"${value}"`,
				`x = rb'${value}'`,
				`x = "${value}`,
			]);
		case 'rust': {
			const hashes = '#'.repeat(Math.floor(random() * 4));
			return pick([
				`let s = "${value}";`,
				`let s = r${hashes}"${value}"${hashes};`,
				`let s = b"${value}";`,
				`let s = br${hashes}"${value}"${hashes};`,
				`let c = '"'; let s = "${value}";`,
				`fn f<'a>(x: &'a str) { "${value}" }`,
				`let s = r${hashes}"${value}`,
			]);
		}
		case 'go':
			return pick([
				`s := "${value}"`,
				's := `' + value + '`',
				`if c == '"' { s := "${value}" }`,
				's := `' + value,
			]);
		case 'shellscript': {
			const tag = pick(TAGS);
			return pick([
				`echo "${value}"`,
				`echo '${value}'`,
				`cat <<${tag}\n${value}\n${tag}`,
				`cat <<'${tag}'\n${value}\n${tag}`,
				`cat <<-${tag}\n\t${value}\n\t${tag}`,
				`cat <<${tag}\n${value}`,
				`x=$((1 << 2)); echo "${value}"`,
			]);
		}
		case 'php': {
			const tag = pick(TAGS);
			return pick([
				`$a = "${value}";`,
				`$a = '${value}';`,
				`$a = <<<${tag}\n${value}\n${tag};`,
				`$a = <<<'${tag}'\n${value}\n${tag},`,
				`$a = <<<${tag}\n${value}`,
				`# ${value}`,
			]);
		}
		case 'ruby': {
			const tag = pick(TAGS);
			return pick([
				`a = "${value}"`,
				`a = '${value}'`,
				`a = <<~${tag}\n  ${value}\n${tag}`,
				`a = <<-${tag}\n  ${value}\n  ${tag}`,
				`list << item; a = "${value}"`,
				`=begin\n${value}\n=end`,
				`a = <<~${tag}\n  ${value}`,
			]);
		}
		case 'perl': {
			const tag = pick(TAGS);
			return pick([
				`my $a = "${value}";`,
				`my $a = '${value}';`,
				`my $a = <<'${tag}';\n${value}\n${tag}`,
				`my $n = $#list; my $a = "${value}";`,
				`=pod\n${value}\n=cut`,
				`my $a = <<${tag};\n${value}`,
			]);
		}
		case 'csharp':
			return pick([
				`var s = "${value}";`,
				`var s = @"${value}";`,
				`var s = @"He said ""${value}"" loudly";`,
				`var s = $"${value}";`,
				`var s = $@"${value}";`,
				`var s = @$"${value}";`,
				`var c = '"'; var s = "${value}";`,
				`var s = @"${value}`,
			]);
		case 'javascript':
		case 'typescript':
			return pick([
				`const s = "${value}";`,
				`const s = '${value}';`,
				'const s = `' + value + '`;',
				'const s = `a ${x ? `' + value + '` : `b`} c`;',
				'const s = `a ${f("' + value + '")} b`;',
				'const s = `' + value,
			]);
		case 'env':
			return pick([
				`KEY=${value}`,
				`KEY="${value}"`,
				`KEY='${value}'`,
				`export KEY=${value}`,
				`# ${value}`,
				`KEY=`,
			]);
		default:
			return pick([
				`"${value}"`,
				`'${value}'`,
				'`' + value + '`',
				`plain ${value} unquoted`,
			]);
	}
}

/** Where the literal sits in the document. */
function wrap(format: string, fragment: string): string {
	switch (Math.floor(random() * 5)) {
		case 0:
			return fragment;
		case 1:
			return `${comment(format)} ${fragment}`;
		case 2:
			return `<element attr="${fragment.replace(/"/g, "'")}" />`;
		case 3:
			return `before(); ${fragment} after();`;
		default:
			return `  ${fragment}  `;
	}
}

function comment(format: string): string {
	if (format === 'python' || format === 'shellscript' || format === 'env') {
		return '#';
	}
	if (format === 'ruby' || format === 'perl') return '#';
	return '//';
}

function document(format: string): string {
	const fragments: string[] = [];
	const count = 1 + Math.floor(random() * 5);
	for (let i = 0; i < count; i += 1) {
		fragments.push(wrap(format, literal(format, pick(VALUES))));
	}
	const text = fragments.join('\n');
	// At EOF without a newline, and with one, both matter: a scanner that
	// reads one character past the end fails only on the first.
	return chance(0.5) ? text : `${text}\n`;
}

interface Case {
	readonly id: number;
	readonly format: string;
	readonly content: string;
	readonly dedupe: boolean;
	readonly multiline: boolean;
}

function cases(): Case[] {
	const built: Case[] = [];
	for (let i = 0; i < CASES; i += 1) {
		const format = GENERATED_FORMATS[i % GENERATED_FORMATS.length] as string;
		built.push({
			id: i + 1,
			format,
			content: document(format),
			dedupe: chance(0.2),
			multiline: chance(0.5),
		});
	}
	return built;
}

/** Key order is an encoder's business; what a caller reads is not. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).sort(
			([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
		);
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

const tool = TOOLS.find((candidate) => candidate.name === 'extract_strings');
if (!tool) {
	console.error('the extension no longer offers extract_strings');
	process.exit(1);
}

/** Every reply from one run of the crate's server, keyed by request id. */
async function askTheCrate(
	requests: readonly { id: number; arguments: unknown }[],
): Promise<Map<number, unknown>> {
	const child = spawn(BINARY, ['mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
	const chunks: Buffer[] = [];
	child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
	const stderr: Buffer[] = [];
	child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

	for (const request of requests) {
		child.stdin.write(
			`${JSON.stringify({
				jsonrpc: '2.0',
				id: request.id,
				method: 'tools/call',
				params: { name: 'extract_strings', arguments: request.arguments },
			})}\n`,
		);
	}
	child.stdin.end();

	const code: number = await new Promise((resolve, reject) => {
		child.on('error', reject);
		child.on('close', resolve);
	});
	if (code !== 0) {
		throw new Error(
			`the crate's server exited ${code}: ${Buffer.concat(stderr).toString()}`,
		);
	}

	const replies = new Map<number, unknown>();
	for (const line of Buffer.concat(chunks).toString().split('\n')) {
		if (!line.trim()) continue;
		const parsed = JSON.parse(line) as {
			id: number;
			result?: { structuredContent?: unknown };
			error?: unknown;
		};
		replies.set(parsed.id, parsed.result?.structuredContent ?? parsed.error);
	}
	return replies;
}

function show(text: string): string {
	return JSON.stringify(text);
}

const failures: string[] = [];

async function checkGeneratedDocuments(): Promise<void> {
	const built = cases();
	const replies = await askTheCrate(
		built.map((testCase) => ({
			id: testCase.id,
			arguments: {
				content: testCase.content,
				format: testCase.format,
				...(testCase.dedupe ? { dedupe: true } : {}),
				...(testCase.multiline ? { multiline: true } : {}),
			},
		})),
	);

	for (const testCase of built) {
		const fromExtension = await tool.handler({
			content: testCase.content,
			format: testCase.format,
			...(testCase.dedupe ? { dedupe: true } : {}),
			...(testCase.multiline ? { multiline: true } : {}),
		});
		const fromCrate = replies.get(testCase.id);
		if (canonical(fromExtension) === canonical(fromCrate)) continue;

		failures.push(
			`case ${testCase.id} (format ${testCase.format}, seed ${SEED}) — the SHARED extract_strings tool disagrees:\n` +
				`  document:  ${show(testCase.content)}\n` +
				`  extension: ${canonical(fromExtension)}\n` +
				`  crate:     ${canonical(fromCrate)}`,
		);
	}
}

/**
 * Documents a parser refuses, and documents the two servers once read
 * differently when the extension parsed with npm libraries: a repeated YAML
 * key, a TOML array of mixed types, a lone surrogate escape in JSON and an
 * INI section header that never closes. Every one must now answer
 * identically, refusal text included.
 */
const AGREE: ReadonlyArray<{ readonly format: string; readonly content: string }> =
	Object.freeze([
		{ format: 'json', content: '{not json' },
		{ format: 'json', content: '{"a": "\\ud800"}' },
		{ format: 'jsonc', content: '{"a": "x",,}' },
		{ format: 'yaml', content: 'a:\n- b\n  c: [' },
		{ format: 'yaml', content: 'a: 1\na: "two"\n' },
		{ format: 'toml', content: 'a = = 1' },
		{ format: 'toml', content: 'a = ["x", 1]\n' },
		{ format: 'ini', content: '[unclosed\nkey' },
		{ format: 'csv', content: '"never closed\n' },
		{ format: 'tsv', content: 'a\t"b\n' },
	]);

async function checkRefusalsAgree(): Promise<void> {
	const replies = await askTheCrate(
		AGREE.map((pinned, index) => ({
			id: index + 1,
			arguments: { content: pinned.content, format: pinned.format },
		})),
	);
	for (const [index, pinned] of AGREE.entries()) {
		const fromExtension = await tool.handler({
			content: pinned.content,
			format: pinned.format,
		});
		const fromCrate = replies.get(index + 1);
		if (canonical(fromExtension) === canonical(fromCrate)) continue;
		failures.push(
			`${pinned.format} ${JSON.stringify(pinned.content)} — the SHARED extract_strings tool disagrees\n` +
				`  extension: ${canonical(fromExtension)}\n` +
				`  crate:     ${canonical(fromCrate)}`,
		);
	}
}

console.log(`differential: seed ${SEED}, ${CASES} generated documents`);
await checkGeneratedDocuments();
await checkRefusalsAgree();

if (failures.length > 0) {
	console.error(
		`\nDifferential FAILED (${failures.length}) — rerun with --seed ${SEED}\n`,
	);
	for (const failure of failures) console.error(`- ${failure}\n`);
	process.exit(1);
}
console.log(
	'OK: both servers answer the shared extract_strings tool identically.',
);
