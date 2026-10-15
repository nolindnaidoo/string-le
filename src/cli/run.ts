/**
 * The terminal surface, as the Rust CLI's `cli.rs` runs it.
 *
 * stdout is protocol: one JSON report per line whenever something is reading
 * it, and nothing when it is a terminal, because the stderr summary already
 * lists every string a person reads there. `--values` prints wherever stdout
 * goes, because asking for the values is asking to see them.
 */
import { FALLBACK_FORMAT } from '../mcp/fileType';
import { type Cli, parse } from './args';
import { decodeUtf8OrThrow, rustIoMessage } from './ioError';
import {
	describe,
	exitCode,
	type FileReport,
	scanContent,
	scanFile,
} from './scan';
import { USAGE } from './usage';
import { collect } from './walk';

export interface RunIo {
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly stdoutIsTerminal: boolean;
	readonly readStdin: () => Promise<Uint8Array>;
	readonly version: string;
}

export async function run(args: readonly string[], io: RunIo): Promise<number> {
	const first = args[0];
	if (first === '--help' || first === '-h') {
		io.stdout(`${USAGE}\n`);
		return 0;
	}
	if (first === '--version' || first === '-V') {
		io.stdout(`string-le ${io.version}\n`);
		return 0;
	}

	try {
		return await execute(args, io);
	} catch (error) {
		io.stderr(
			`string-le: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 2;
	}
}

async function execute(args: readonly string[], io: RunIo): Promise<number> {
	const options = parse(args);
	const { reports, binary } = options.stdin
		? { reports: [await scanStdin(options, io)], binary: 0 }
		: readTree(options);

	io.stdout(
		options.valuesOnly
			? values(reports)
			: jsonLines(reports, io.stdoutIsTerminal),
	);
	io.stderr(summary(reports, binary, options.valuesOnly));
	return exitCode(reports, options.strict);
}

/**
 * A binary file gets no report line, since it was never a text candidate, but
 * it is counted: a report that is silent about the files it never read claims
 * coverage it does not have.
 */
function readTree(options: Cli): { reports: FileReport[]; binary: number } {
	const reports: FileReport[] = [];
	let binary = 0;
	for (const target of collect(options.inputs, options.walk)) {
		const examined = scanFile(target, options.scan);
		if (examined.kind === 'binary') {
			binary += 1;
			continue;
		}
		reports.push(examined.report);
	}
	return { reports, binary };
}

/**
 * No file name to infer from, so an unnamed format falls back, the same answer
 * a source file gets. The stdin document keeps any byte-order mark, as the
 * crate's does.
 */
async function scanStdin(options: Cli, io: RunIo): Promise<FileReport> {
	let content: string;
	try {
		content = decodeUtf8OrThrow(await io.readStdin());
	} catch (error) {
		throw new Error(`could not read stdin: ${rustIoMessage(error)}`);
	}
	const format = options.scan.format ?? FALLBACK_FORMAT;
	return scanContent(content, '<stdin>', format, options.scan);
}

function jsonLines(reports: readonly FileReport[], terminal: boolean): string {
	if (terminal) return '';
	return reports.map((report) => `${JSON.stringify(report)}\n`).join('');
}

function values(reports: readonly FileReport[]): string {
	return reports
		.flatMap((report) => report.strings.map((found) => `${found.value}\n`))
		.join('');
}

/**
 * The human half. Every line restates something already on stdout, except the
 * binary count, the one fact stdout deliberately omits. Under `--values` the
 * strings are on stdout already, so they are not repeated here.
 */
function summary(
	reports: readonly FileReport[],
	binary: number,
	valuesOnStdout: boolean,
): string {
	const lines: string[] = [];
	for (const report of reports) {
		for (const diagnostic of report.diagnostics) {
			lines.push(`${report.file}: ${diagnostic.message}`);
		}
		if (valuesOnStdout) continue;
		for (const found of report.strings) lines.push(describe(report, found));
	}

	const strings = reports.reduce(
		(sum, report) => sum + report.summary.strings,
		0,
	);
	const unlocated = reports.reduce(
		(sum, report) => sum + report.summary.unlocated,
		0,
	);
	const passedOver =
		binary === 0
			? ''
			: `, ${plural(binary, 'binary file', 'binary files')} skipped`;
	lines.push(
		`${plural(strings, 'string', 'strings')} in ${plural(reports.length, 'file', 'files')}${passedOver}`,
	);
	if (unlocated > 0) {
		lines.push(
			`${plural(unlocated, 'value', 'values')} could not be located in the source`,
		);
	}
	return lines.map((line) => `${line}\n`).join('');
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}
