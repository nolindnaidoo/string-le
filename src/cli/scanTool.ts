/**
 * `string_le_scan`, the tool the Rust server offers beside the shared
 * `extract_strings`: files or directories in, the same reports the command
 * line writes. `string-le mcp` serves both, as the crate's `string-le mcp`
 * does, so an agent configured with either binary sees the same two tools.
 */
import { envelope } from '../mcp/envelope';
import { resolveFormat } from '../mcp/fileType';
import type { ToolDefinition } from '../mcp/transport';
import { DEFAULT_SCAN, type FileReport, scanFile } from './scan';
import { collect } from './walk';

const DESCRIPTION =
	'Extract every string value from files or directories, with the file it came from and, ' +
	'where it can be located, its line and column. Reads the filesystem; never writes to ' +
	'it, and never judges a string.';

async function scan(args: Record<string, unknown>): Promise<unknown> {
	const inputs = requestedPaths(args);
	const flag = (name: string): boolean => args[name] === true;
	const options = {
		dedupe: flag('dedupe'),
		extract: { ...DEFAULT_SCAN.extract, multiline: flag('multiline') },
		format:
			typeof args.format === 'string'
				? resolveFormat(args.format, undefined)
				: null,
	};
	const targets = collect(inputs, {
		hidden: flag('hidden'),
		respectIgnore: !flag('ignored'),
	});

	const reports: FileReport[] = [];
	for (const target of targets) {
		const examined = scanFile(target, options);
		if (examined.kind === 'text') reports.push(examined.report);
	}
	// A binary file was never text. Left out of the reports and counted, so a
	// caller comparing this against its own file list has the difference
	// explained rather than left to be noticed.
	const binary = targets.length - reports.length;
	const strings = sum(reports, (report) => report.summary.strings);
	const unlocated = sum(reports, (report) => report.summary.unlocated);

	const diagnostics = reports
		.filter((report) =>
			report.diagnostics.some((found) => found.severity === 'error'),
		)
		.map((report) =>
			warning(
				'unreadable',
				`${report.file} could not be read, so this scan does not cover it`,
			),
		);
	if (unlocated > 0) {
		diagnostics.push(
			warning(
				'unlocated',
				`${unlocated} values could not be located in their source`,
			),
		);
	}
	if (binary > 0) {
		diagnostics.push(
			warning('binary', `${binary} files were not text and were not read`),
		);
	}

	return envelope(
		'string_le_scan',
		{ reports, strings, binaryFiles: binary },
		reports.length,
		diagnostics,
		false,
	);
}

function sum(
	reports: readonly FileReport[],
	count: (report: FileReport) => number,
): number {
	return reports.reduce((total, report) => total + count(report), 0);
}

function warning(code: string, message: string) {
	return { severity: 'warning' as const, code, message };
}

function requestedPaths(args: Record<string, unknown>): readonly string[] {
	if (typeof args.path === 'string') return [args.path];
	if (!Array.isArray(args.paths))
		throw new Error('no file or directory was supplied to read');
	const paths = args.paths.filter(
		(item): item is string => typeof item === 'string',
	);
	if (paths.length === 0) throw new Error('the list of paths was empty');
	return paths;
}

export const SCAN_TOOL: ToolDefinition = Object.freeze({
	name: 'string_le_scan',
	description: DESCRIPTION,
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'a file or directory to read' },
			paths: {
				type: 'array',
				items: { type: 'string' },
				description: 'several files or directories, instead of `path`',
			},
			format: {
				type: 'string',
				description:
					'Force a format for every file instead of inferring one per file name. ' +
					'An unrecognised name falls back to quoted strings.',
			},
			dedupe: {
				type: 'boolean',
				default: false,
				description: 'Collapse repeated values to their first occurrence.',
			},
			multiline: {
				type: 'boolean',
				default: false,
				description:
					'Let a quoted run span lines, so a multi-line template literal is read ' +
					"too, as the extension's `string-le.fallback.multiline` setting does.",
			},
			hidden: {
				type: 'boolean',
				default: false,
				description: 'Walk hidden files and directories too.',
			},
			ignored: {
				type: 'boolean',
				default: false,
				description: 'Walk files excluded by .gitignore too.',
			},
		},
	},
	handler: scan,
});
