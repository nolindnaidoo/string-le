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
 */
const ALIASES: Readonly<Record<string, string>> = Object.freeze({
	json: 'json',
	jsonc: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	csv: 'csv',
	tsv: 'csv',
	toml: 'toml',
	ini: 'ini',
	cfg: 'ini',
	conf: 'ini',
	env: 'env',
	dotenv: 'env',
	python: 'python',
	py: 'python',
	rust: 'rust',
	rs: 'rust',
	go: 'go',
	shellscript: 'shellscript',
	sh: 'shellscript',
	bash: 'shellscript',
	zsh: 'shellscript',
	php: 'php',
	ruby: 'ruby',
	rb: 'ruby',
	perl: 'perl',
	pl: 'perl',
	pm: 'perl',
	csharp: 'csharp',
	cs: 'csharp',
	javascript: 'javascript',
	javascriptreact: 'javascript',
	js: 'javascript',
	jsx: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	typescript: 'typescript',
	typescriptreact: 'typescript',
	ts: 'typescript',
	tsx: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	// Prose has no literals; naming it asks for the quoted runs a fenced
	// code block and a backtick span leave behind.
	markdown: 'fallback',
	md: 'fallback',
});

/**
 * The formats a caller can name, for the tool schema's enum.
 *
 * `fallback` is nameable on purpose: now that a `.py` file is read as
 * Python, asking for the quoted runs instead has to be something a caller
 * can say.
 */
export const SUPPORTED_FORMATS: readonly string[] = Object.freeze([
	'json',
	'yaml',
	'csv',
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
		const direct = ALIASES[normalise(format)];
		if (direct) return direct;
	}

	if (filename) {
		// A dotfile like `.env` has no extension to split on; its whole name is
		// the type.
		const bare = normalise(filename);
		const whole = ALIASES[bare.startsWith('.') ? bare.slice(1) : bare];
		if (whole) return whole;

		const extension = filename.includes('.')
			? filename.slice(filename.lastIndexOf('.') + 1)
			: '';
		const inferred = ALIASES[normalise(extension)];
		if (inferred) return inferred;
	}

	return FALLBACK_FORMAT;
}
