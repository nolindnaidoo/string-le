import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import { extractStrings } from '../extraction/extract';
import { exactPositions } from '../extraction/positions';
import { resolveFormat } from '../mcp/fileType';
import {
	listFiles,
	type ScanLimits,
	type ScanSummary,
	scanFiles,
	unreadNotes,
} from '../workspace/scan';
import {
	askForFolder,
	code,
	deliver,
	hasSomethingToScan,
	limitsFrom,
	type WorkspaceDeps,
} from './workspaceShared';

/** One place a string is written. A reader that resolved the value has no position for it. */
export interface Occurrence {
	readonly file: string;
	readonly position:
		| { readonly line: number; readonly column: number }
		| undefined;
}

/** A string, and every place it was found. */
export interface DistinctString {
	readonly value: string;
	readonly occurrences: readonly Occurrence[];
}

/** A file its format reader would not read, and why. */
export interface Refused {
	readonly file: string;
	readonly reason: string;
}

export function registerExtractWorkspaceCommands(
	context: vscode.ExtensionContext,
	deps: WorkspaceDeps,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('string-le.extractWorkspace', async () =>
			extractWorkspace(deps),
		),
		// The Explorer hands over the folder that was clicked. From the
		// palette there is none, and the command asks.
		vscode.commands.registerCommand(
			'string-le.extractFolder',
			async (picked?: vscode.Uri) => {
				const folder = picked ?? (await askForFolder());
				if (folder !== undefined) await extractWorkspace(deps, folder);
			},
		),
	);
}

/**
 * Extract every string in every file under a folder, or in the whole
 * workspace when no folder is given.
 *
 * A project writes the same string in many places, which is the thing worth
 * knowing about it, so the answer is the distinct strings and where each one
 * is. Files are read from disk, so an unsaved edit is not seen.
 */
async function extractWorkspace(
	deps: WorkspaceDeps,
	root?: vscode.Uri,
): Promise<void> {
	deps.telemetry.event('command', {
		name: root === undefined ? 'extractWorkspace' : 'extractFolder',
	});
	if (!hasSomethingToScan(root, deps)) return;
	const config = readConfig();
	const limits = limitsFrom(config);

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t('Scanning files...'),
			cancellable: true,
		},
		async (progress, token) => {
			const { files, fileLimitReached, ignored } = await listFiles(
				root,
				limits,
			);
			const found = new Map<string, Occurrence[]>();
			const refused: Refused[] = [];
			let total = 0;
			const scanned = await scanFiles(
				root,
				files,
				limits,
				token,
				(done, all) =>
					progress.report({
						message: vscode.l10n.t('{0} of {1} files', done, all),
					}),
				({ file, text }) => {
					const fileType = resolveFormat(undefined, file);
					const options = { multiline: config.fallbackMultiline };
					// A reader that could not parse a document found nothing in
					// it, which is not the same as the document holding nothing.
					let reason: string | undefined;
					const strings = extractStrings(text, fileType, {
						...options,
						onParseError: (message): void => {
							reason ??= message;
						},
					});
					if (reason !== undefined) refused.push({ file, reason });
					const positions = exactPositions(text, fileType, strings, options);
					for (const [index, value] of strings.entries()) {
						if (total >= config.workspaceScanMaxResults) return false;
						const occurrence = { file, position: positions?.[index] };
						const where = found.get(value);
						if (where === undefined) found.set(value, [occurrence]);
						else where.push(occurrence);
						total++;
					}
					return total < config.workspaceScanMaxResults;
				},
			);
			// A cancelled scan read part of the tree. Reporting that as the
			// project's strings would understate it without saying so.
			if (scanned.cancelled) return;
			const summary: ScanSummary = { ...scanned, fileLimitReached, ignored };

			const strings = distinct(found);
			const where =
				root === undefined
					? undefined
					: vscode.workspace.asRelativePath(root, false);
			await deliver(
				(positions) =>
					formatExtractWorkspaceReport({
						where,
						strings,
						refused,
						summary,
						limits,
						positions,
					}),
				config,
				deps,
			);

			deps.telemetry.event('workspace-extracted', {
				files: String(summary.read),
				strings: String(strings.length),
				occurrences: String(total),
			});
			deps.statusBar.flash(headline(strings));
		},
	);
}

/**
 * The most widely used first, then by the string's own text.
 *
 * A plain comparison rather than `localeCompare`: the order must not change
 * with the editor's display language.
 */
function distinct(found: ReadonlyMap<string, Occurrence[]>): DistinctString[] {
	return [...found]
		.map(([value, occurrences]) => ({ value, occurrences }))
		.sort(
			(a, b) =>
				b.occurrences.length - a.occurrences.length ||
				(a.value < b.value ? -1 : Number(a.value > b.value)),
		);
}

function filesOf(occurrences: readonly Occurrence[]): string[] {
	return [...new Set(occurrences.map((occurrence) => occurrence.file))];
}

function headline(strings: readonly DistinctString[]): string {
	const occurrences = strings.flatMap((entry) => entry.occurrences);
	return vscode.l10n.t(
		'{0} distinct string(s), {1} occurrence(s) in {2} file(s)',
		strings.length,
		occurrences.length,
		filesOf(occurrences).length,
	);
}

/** A file and the places in it, or how many times when positions are off. */
function placed(
	file: string,
	here: readonly Occurrence[],
	positions: boolean,
): string {
	const places = here.flatMap((o) =>
		o.position === undefined
			? []
			: [`**${o.position.line}:${o.position.column}**`],
	);
	if (positions && places.length > 0)
		return `${code(file)} · ${places.join(', ')}`;
	return here.length > 1 ? `${code(file)} (${here.length})` : code(file);
}

/** The longest a string is shown in a row or a heading. */
const SHOWN_LENGTH = 120;

/**
 * A string as one line of a report: a line break becomes a space, and a long
 * one is cut. The scan compares whole strings; this is only how one is shown.
 */
function shown(value: string): string {
	const characters = Array.from(value);
	return code(
		characters.length > SHOWN_LENGTH
			? `${characters.slice(0, SHOWN_LENGTH).join('')}…`
			: value,
	);
}

export interface ExtractWorkspaceReportInput {
	/** The folder that was scanned, or undefined for the whole workspace. */
	readonly where: string | undefined;
	readonly strings: readonly DistinctString[];
	readonly refused: readonly Refused[];
	readonly summary: ScanSummary;
	readonly limits: ScanLimits;
	readonly positions?: boolean;
}

/**
 * The report for a folder or a workspace: a table of the distinct strings
 * with how often and in how many files each is written, then where each
 * repeated one is, and last whatever the scan left unread.
 */
export function formatExtractWorkspaceReport({
	where,
	strings,
	refused,
	summary,
	limits,
	positions = true,
}: ExtractWorkspaceReportInput): string {
	const lines: string[] = [
		`# ${vscode.l10n.t('{0} workspace report', 'String-LE')}`,
		'',
	];
	const scope = where === undefined ? '' : `${code(where)} · `;
	lines.push(
		`${scope}${vscode.l10n.t('{0} file(s) read', summary.read)} · ${headline(strings)}`,
		'',
	);
	if (strings.length === 0) lines.push(vscode.l10n.t('No strings found.'), '');

	if (strings.length > 0) {
		lines.push(
			`| ${vscode.l10n.t('String')} | ${vscode.l10n.t('Occurrences')} | ${vscode.l10n.t('Files')} | ${vscode.l10n.t('Where')} |`,
			'|---|---|---|---|',
		);
		// Most strings in a project are written once. Such a one is placed in
		// its row, so the sections below are only the repeated ones.
		for (const entry of strings) {
			const row = `| ${shown(entry.value).replace(/\|/g, '\\|')} | ${entry.occurrences.length} | ${filesOf(entry.occurrences).length} |`;
			const only =
				entry.occurrences.length === 1 ? entry.occurrences[0] : undefined;
			lines.push(
				only === undefined
					? `${row} |`
					: `${row} ${placed(only.file, [only], positions)} |`,
			);
		}
		lines.push('');
	}

	for (const entry of strings) {
		if (entry.occurrences.length === 1) continue;
		lines.push(`## ${shown(entry.value)} (${entry.occurrences.length})`, '');
		// One line per file, with every place in it.
		for (const file of filesOf(entry.occurrences))
			lines.push(
				`- ${placed(
					file,
					entry.occurrences.filter((o) => o.file === file),
					positions,
				)}`,
			);
		lines.push('');
	}

	if (refused.length > 0) {
		lines.push(
			`## ${vscode.l10n.t('Could not be read ({0})', refused.length)}`,
			'',
			...refused.map((entry) => `- ${code(entry.file)}: ${entry.reason}`),
			'',
		);
	}

	const notes = unreadNotes(summary, limits, code('string-le.workspace.*'));
	if (notes.length > 0) lines.push(...notes.map((note) => `> ${note}`), '');
	return lines.join('\n');
}
