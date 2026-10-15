#!/usr/bin/env node
/**
 * npm command-line package gate.
 *
 * Packs `cli/`, installs the tarball into a clean throwaway project, and runs
 * the *installed* `string-le` over a real file. That is what `npx string-le`
 * does, minus the registry, so it catches what a source-level test cannot: a
 * missing `files` entry, a bin path that does not resolve, a lost shebang, or
 * a bundle that still reaches for a dev dependency.
 *
 * Runs before publishing, because a broken version can never be reused. The
 * throwaway project is left in the OS temp directory rather than deleted.
 *
 *   node scripts/build-cli.js --prod && node scripts/check-cli-package.js
 */
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('cli/package.json', 'utf8'));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-check-'));

function fail(message, detail) {
	console.error(`\n  ✗ ${message}`);
	if (detail) console.error(`    ${detail}`);
	process.exit(1);
}

const npm = (args, cwd) => cp.execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

if (manifest.version !== root.version) {
	fail(`cli/package.json is ${manifest.version}, package.json is ${root.version}`);
}

const packed = JSON.parse(
	npm(['pack', path.resolve('cli'), '--json', '--pack-destination', workspace]),
)[0];
const shipped = packed.files.map((file) => file.path).sort();
const expected = ['LICENSE', 'README.md', 'cli.js', 'package.json'];
if (JSON.stringify(shipped) !== JSON.stringify(expected)) {
	fail('the tarball does not carry exactly the expected files', `got: ${shipped.join(', ')}`);
}

const project = path.join(workspace, 'project');
fs.mkdirSync(project);
fs.writeFileSync(
	path.join(project, 'package.json'),
	JSON.stringify({ name: 'cli-check', version: '1.0.0', private: true }),
);
npm(['install', path.join(workspace, packed.filename), '--no-audit', '--no-fund'], project);

const bin = path.join(project, 'node_modules', '.bin', 'string-le');
if (!fs.existsSync(bin)) fail('npm did not install a `string-le` binary', 'check the bin field');

const run = (args) => cp.spawnSync(bin, args, { cwd: project, encoding: 'utf8' });

const version = run(['--version']);
if (version.stdout.trim() !== `string-le ${root.version}`) {
	fail('--version does not report the release', `got: ${JSON.stringify(version.stdout)}`);
}

fs.writeFileSync(path.join(project, 'messages.ts'), "const a = 'Delete this?';\n");
fs.writeFileSync(path.join(project, 'gone.json'), '{"a": "x",}\n');
const scan = run(['messages.ts', 'gone.json']);
let reports;
try {
	reports = scan.stdout.trim().split('\n').map((line) => JSON.parse(line));
} catch {
	fail('the installed binary did not write JSON reports', scan.stderr || scan.stdout);
}
const found = reports.map((report) => `${report.file}:${report.strings.map((s) => s.value).join('|')}:${report.diagnostics.map((d) => d.code).join('|')}`).join(' ');
if (scan.status !== 0 || found !== 'gone.json::unparsed messages.ts:Delete this?:') {
	fail('the installed binary answered wrongly', `exit ${scan.status}, ${found}`);
}

const mcp = cp.spawnSync(bin, ['mcp'], {
	cwd: project,
	encoding: 'utf8',
	input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`,
});
const tools = JSON.parse(mcp.stdout.split('\n')[0] || '{}').result?.tools ?? [];
const names = tools.map((tool) => tool.name).join(', ');
if (names !== 'extract_strings, string_le_scan') {
	fail('`string-le mcp` does not serve both tools', `got: ${names}`);
}

console.log(`  ✓ ${manifest.name}@${manifest.version}: packed, installed, scanned, served`);
