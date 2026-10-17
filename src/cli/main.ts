/**
 * The `string-le` npm binary: the Rust CLI's surface over the extension's
 * extraction engine. `string-le mcp` serves the crate's two tools over stdio.
 */
import { name, version } from '../mcp/info';
import { TOOLS } from '../mcp/tools';
import { serve } from '../mcp/transport';
import { crateOutput } from './output';
import { run } from './run';
import { SCAN_TOOL } from './scanTool';

async function readStdin(): Promise<Uint8Array> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

function main(args: readonly string[]): void {
	const output = crateOutput(name);
	if (args[0] === 'mcp') {
		// The crate's server stops at the first reply it cannot write.
		process.stdout.once('error', () => output.exit(2, null));
		serve({ name, version }, [...TOOLS, SCAN_TOOL]);
		return;
	}
	run(args, {
		stdout: output.stdout,
		stderr: output.stderr,
		stdoutIsTerminal: process.stdout.isTTY === true,
		readStdin,
		version,
	}).then((code) =>
		output.exit(
			code,
			// `--values` writes bare values, and the crate names them so.
			args.includes('--values')
				? 'could not write the values'
				: 'could not write the report',
		),
	);
}

main(process.argv.slice(2));
