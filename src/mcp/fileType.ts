/**
 * Resolving a format hint from whatever an agent happens to send.
 *
 * As with numbers-le, an unresolved format is not an error: the engine falls
 * back to a plain-text extractor, which is a useful answer rather than an empty
 * one. So this resolver always returns a key the engine accepts, and
 * `fallback` is the deliberate default.
 */

/** Every extractor key the engine registers, keyed by what a caller might send. */
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
});

/** The formats a caller can name, for the tool schema's enum. */
export const SUPPORTED_FORMATS: readonly string[] = Object.freeze([
	'json',
	'yaml',
	'csv',
	'toml',
	'ini',
	'env',
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
