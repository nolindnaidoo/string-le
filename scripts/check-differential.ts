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
 * Documents are drawn only from the formats with no parse-failure path —
 * the ten source languages, dotenv and the fallback — because those
 * answer with values alone. The parsed formats reach their failure
 * through a parser written twice in two languages, and that half is
 * checked separately below for the part both sides do promise: the same
 * `ok`, the same severity and code, and the same `Invalid <FORMAT>: `
 * prefix. The words after it belong to the parser.
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

/** Formats whose parser can refuse the document. */
const PARSED_FORMATS: readonly string[] = Object.freeze([
	'json',
	'yaml',
	'csv',
	'toml',
	'ini',
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
			},
		})),
	);

	for (const testCase of built) {
		const fromExtension = await tool.handler({
			content: testCase.content,
			format: testCase.format,
			...(testCase.dedupe ? { dedupe: true } : {}),
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
 * A document the parser refuses. The two servers run two parsers written
 * in two languages, so the words they use differ; what they promise is
 * that the check is reported as not having run, with the same severity,
 * the same code, and the same `Invalid <FORMAT>: ` prefix.
 *
 * `ini` is the exception and is pinned as one rather than skipped: the
 * `ini` package accepts everything a line has to offer and `rust-ini`
 * refuses a section header that never closes. Two parsers, two
 * tolerances, and no way to have the stricter one be lenient without
 * writing a third. It is recorded in crate/SPEC.md, and asserted here in
 * the direction it actually goes — so the day either parser changes its
 * mind, this goes red and somebody updates the document.
 */
const BROKEN: Readonly<Record<string, string>> = Object.freeze({
	json: '{not json',
	yaml: 'a:\n- b\n  c: [',
	toml: 'a = = 1',
	ini: '[unclosed\nkey',
	csv: '"never closed\n',
});

/** Formats where only one parser refuses, and which one. */
const STRICTER: Readonly<Record<string, 'crate' | 'extension'>> = Object.freeze({
	ini: 'crate',
});

async function checkRefusalsAgree(): Promise<void> {
	const formats = PARSED_FORMATS.filter((format) => BROKEN[format]);
	const replies = await askTheCrate(
		formats.map((format, index) => ({
			id: index + 1,
			arguments: { content: BROKEN[format], format },
		})),
	);

	for (const [index, format] of formats.entries()) {
		const fromExtension = (await tool.handler({
			content: BROKEN[format],
			format,
		})) as Envelope;
		const fromCrate = replies.get(index + 1) as Envelope;

		const stricter = STRICTER[format];
		if (stricter) {
			const refused = stricter === 'crate' ? fromCrate : fromExtension;
			const accepted = stricter === 'crate' ? fromExtension : fromCrate;
			if (!refused.ok && accepted.ok) continue;
			failures.push(
				`refusal for ${format} — SPEC.md records the ${stricter}'s parser as the stricter one, and it no longer is:\n` +
					`  extension: ${canonical(fromExtension)}\n` +
					`  crate:     ${canonical(fromCrate)}`,
			);
			continue;
		}

		const problem = disagreement(fromExtension, fromCrate, format);
		if (!problem) continue;
		failures.push(
			`refusal for ${format} — the SHARED extract_strings tool disagrees: ${problem}\n` +
				`  extension: ${canonical(fromExtension)}\n` +
				`  crate:     ${canonical(fromCrate)}`,
		);
	}
}

interface Envelope {
	readonly ok: boolean;
	readonly diagnostics: readonly {
		severity: string;
		code: string;
		message: string;
	}[];
}

function disagreement(
	extension: Envelope,
	crate: Envelope,
	format: string,
): string | null {
	if (extension.ok !== crate.ok) return `ok differs`;
	const a = extension.diagnostics[0];
	const b = crate.diagnostics[0];
	if (!a || !b) return 'one side carries no diagnostic';
	if (a.severity !== b.severity) return 'severity differs';
	if (a.code !== b.code) return 'code differs';
	const prefix = `Invalid ${format.toUpperCase()}: `;
	if (!a.message.startsWith(prefix) || !b.message.startsWith(prefix)) {
		return `the shared ${JSON.stringify(prefix)} prefix is missing`;
	}
	return null;
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
