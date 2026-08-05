import { extractStrings } from '../extraction/extract';
import {
	capped,
	createDiagnosticSink,
	DEFAULT_MAX_RESULTS,
	envelope,
	MAX_MAX_RESULTS,
	readMaxResults,
	readString,
} from './envelope';
import { resolveFormat, SUPPORTED_FORMATS } from './fileType';
import type { ToolDefinition } from './transport';

/**
 * The tools this server exposes.
 *
 * Names are a public API with no deprecation channel — once an agent's prompt
 * or memory references `extract_strings`, renaming it breaks silently. They are
 * pinned by a golden test for that reason.
 *
 * No tool touches the filesystem. The agent already has file-read tools;
 * duplicating them here would add a path-traversal surface for no capability.
 *
 * **The description is the API.** A model reads it to decide whether to call
 * this tool at all, so it states plainly what the tool handles rather than
 * gesturing at "many formats" — a model cannot reason about a vague claim, and
 * the cost is either a call that returns nothing or a tool never tried. The
 * same reasoning governs argument descriptions: each says what the value does,
 * not what type it is, because the type is already in the schema.
 */

// Advertised in the schema with its default visible, rather than silently
// enforced. A model that can see the cap can raise it when it genuinely needs
// more, and can read `meta.truncated` to know it should. A hidden cap just
// produces quietly incomplete answers.
const MAX_RESULTS_SCHEMA = {
	type: 'integer',
	minimum: 1,
	maximum: MAX_MAX_RESULTS,
	default: DEFAULT_MAX_RESULTS,
	description: `Cap on returned strings (default ${DEFAULT_MAX_RESULTS}). meta.truncated reports whether any were dropped.`,
};

function extract(args: Record<string, unknown>): Promise<unknown> {
	const content = readString(args, 'content');
	const maxResults = readMaxResults(args);

	const format = typeof args.format === 'string' ? args.format : undefined;
	const filename =
		typeof args.filename === 'string' ? args.filename : undefined;

	// An unresolved format falls back to the quoted-string extractor rather than
	// refusing: the engine has an extractor for exactly that case.
	const fileType = resolveFormat(format, filename);

	// The callback is the engine's only error channel. Not passing one loses
	// every parse failure silently.
	const sink = createDiagnosticSink();
	const values = extractStrings(content, fileType, {
		onParseError: sink.onParseError,
	});

	const deduped = args.dedupe === true ? [...new Set(values)] : values;
	const { items, truncated } = capped(deduped, maxResults);

	return Promise.resolve(
		envelope(
			'extract_strings',
			{ strings: items, fileType },
			items.length,
			sink.diagnostics(),
			truncated,
		),
	);
}

export const TOOLS: readonly ToolDefinition[] = Object.freeze([
	Object.freeze({
		name: 'extract_strings',
		description:
			'Extract every string value from a document. Parses JSON, YAML, CSV, TOML, INI and dotenv; for any other format it falls back to quoted strings — single, double or backtick — so a format is optional but unquoted prose yields nothing. Returns the values themselves, in document order, not their positions.',
		inputSchema: {
			type: 'object',
			properties: {
				content: {
					type: 'string',
					description: 'The document text to scan.',
				},
				format: {
					type: 'string',
					enum: SUPPORTED_FORMATS,
					description:
						'Document format. Optional — an unrecognised or absent format falls back to extracting quoted strings.',
				},
				filename: {
					type: 'string',
					description:
						'Filename used to infer the format when `format` is absent, e.g. "config.toml".',
				},
				dedupe: {
					type: 'boolean',
					default: false,
					description: 'Collapse repeated values to their first occurrence.',
				},
				maxResults: MAX_RESULTS_SCHEMA,
			},
			required: ['content'],
			additionalProperties: false,
		},
		handler: extract,
	}),
]);
