/**
 * The `string-le` npm binary: the Rust CLI's surface over the extension's
 * extraction engine. `string-le mcp` serves the crate's two tools over stdio.
 */
import { name, version } from '../mcp/info';
import { TOOLS } from '../mcp/tools';
import { serve } from '../mcp/transport';
import { exitWhenDrained } from './exit';
import { run } from './run';
import { SCAN_TOOL } from './scanTool';

async function readStdin(): Promise<Uint8Array> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

function main(args: readonly string[]): void {
	if (args[0] === 'mcp') {
		serve({ name, version }, [...TOOLS, SCAN_TOOL]);
		return;
	}
	run(args, {
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
		stdoutIsTerminal: process.stdout.isTTY === true,
		readStdin,
		version,
	}).then(exitWhenDrained);
}

main(process.argv.slice(2));
