/**
 * Resolving a format hint from whatever an agent happens to send.
 *
 * As with numbers-le, an unresolved format is not an error: the engine falls
 * back to a plain-text extractor, which is a useful answer rather than an empty
 * one. So this resolver always returns a key the engine accepts, and
 * `fallback` is the deliberate default.
 */

/**
 * Every extractor key the engine registers, keyed by what a caller might send.
 *
 * The source languages carry both the VS Code language id and the file
 * extension, because one frontend dispatches on the id it is handed and the
 * other on the name of a file it walked. Held byte-for-byte equal to
 * crate/src/extract/format.rs.
 *
 * A `Map`, not a plain object: on an object, `constructor`, `__proto__` and
 * every other `Object.prototype` name is a hit, and a caller sending one as a
 * format got a function back for its file type while the crate's server
 * answered `fallback`.
 */
const ALIASES: ReadonlyMap<string, string> = new Map([
	['json', 'json'],
	['jsonc', 'jsonc'],
	['yaml', 'yaml'],
	['yml', 'yaml'],
	['csv', 'csv'],
	['tsv', 'tsv'],
	['toml', 'toml'],
	['ini', 'ini'],
	['env', 'env'],
	['dotenv', 'env'],
	['python', 'python'],
	['py', 'python'],
	['rust', 'rust'],
	['rs', 'rust'],
	['go', 'go'],
	['shellscript', 'shellscript'],
	['sh', 'shellscript'],
	['bash', 'shellscript'],
	['zsh', 'shellscript'],
	['php', 'php'],
	['ruby', 'ruby'],
	['rb', 'ruby'],
	['perl', 'perl'],
	['pl', 'perl'],
	['pm', 'perl'],
	['csharp', 'csharp'],
	['cs', 'csharp'],
	['javascript', 'javascript'],
	['javascriptreact', 'javascript'],
	['js', 'javascript'],
	['jsx', 'javascript'],
	['mjs', 'javascript'],
	['cjs', 'javascript'],
	['typescript', 'typescript'],
	['typescriptreact', 'typescript'],
	['ts', 'typescript'],
	['tsx', 'typescript'],
	['mts', 'typescript'],
	['cts', 'typescript'],
	// Prose has no literals; naming it asks for the quoted runs a fenced
	// code block and a backtick span leave behind.
	['markdown', 'fallback'],
	['md', 'fallback'],
]);

/**
 * The formats a caller can name, for the tool schema's enum.
 *
 * `fallback` is nameable on purpose: now that a `.py` file is read as
 * Python, asking for the quoted runs instead has to be something a caller
 * can say.
 */
export const SUPPORTED_FORMATS: readonly string[] = Object.freeze([
	'json',
	'jsonc',
	'yaml',
	'csv',
	'tsv',
	'toml',
	'ini',
	'env',
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
	'fallback',
]);

/** What the engine uses when it recognises nothing. */
export const FALLBACK_FORMAT = 'fallback';

function normalise(value: string): string {
	return value.trim().toLowerCase().replace(/^\./, '');
}

/**
 * Resolve an extractor key from an explicit format, else from a filename.
 *
 * Falls back to the plain-text extractor, so a caller who knows nothing about
 * the document still gets its strings.
 */
export function resolveFormat(
	format: string | undefined,
	filename: string | undefined,
): string {
	if (format) {
		const direct = ALIASES.get(normalise(format));
		if (direct) return direct;
	}

	if (filename) {
		// The name alone. A folder scan hands over `src/.env.local`, and an
		// agent may send a path too; the directory says nothing about the
		// format and hides a dotfile's whole name.
		const name = basename(filename);

		// A dotfile like `.env` has no extension to split on; its whole name is
		// the type.
		const bare = normalise(name);
		const whole = ALIASES.get(bare.startsWith('.') ? bare.slice(1) : bare);
		if (whole) return whole;

		// A dotenv file is `.env` and everything after it. Splitting on the
		// last dot asked `local` for a format, so `.env.local` fell to the
		// quoted-run scan and an unquoted `NAME=plain` vanished while the
		// `.env` beside it read both values. The crate resolves these to
		// `env`, and the shared tool answers the same whichever server it
		// reaches.
		if (isDotenv(name.trim().toLowerCase())) return 'env';

		const extension = name.includes('.')
			? name.slice(name.lastIndexOf('.') + 1)
			: '';
		const inferred = ALIASES.get(normalise(extension));
		if (inferred) return inferred;
	}

	return FALLBACK_FORMAT;
}

/** The last path segment, whichever separator wrote the path. */
function basename(filename: string): string {
	return filename.slice(
		Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1,
	);
}

/**
 * Whether a filename names a dotenv file: `.env` and any suffix of it, plus
 * the `<name>.env` spelling.
 *
 * The leading dot is the signal, so this reads the name before `normalise`
 * strips it. Without it `env.ts`, an ordinary TypeScript file, would read as
 * dotenv, which silences a source file rather than adding noise to a config.
 * `.envrc` is direnv's shell script and is likewise not a dotenv file.
 */
function isDotenv(name: string): boolean {
	if (name === '.env' || name.startsWith('.env.')) return true;
	return name.endsWith('.env') && name.length > '.env'.length;
}
