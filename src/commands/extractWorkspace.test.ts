import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	_clipboardText,
	_createExtensionContext,
	_openedDocuments,
	_registeredCommands,
	_resetMockState,
	_respondToOpenDialog,
	_setConfig,
	_setWorkspaceFiles,
	_shownMessages,
	Uri,
	workspace,
} from '../__mocks__/vscode';
import { createTelemetry } from '../telemetry/telemetry';
import { createNotifier } from '../ui/notifier';
import { createStatusBar } from '../ui/statusBar';
import { registerExtractWorkspaceCommands } from './extractWorkspace';

const TREE = {
	'/w/src/a.ts':
		'const a = "Save changes";\nconst b = "Cancel";\nconst c = "Save changes";\n',
	'/w/src/b.py': 'label = "Save changes"\n',
	'/w/i18n/en.json': '{\n  "save": "Save changes",\n  "cancel": "Cancel"\n}\n',
	'/w/node_modules/x.js': 'const skipped = "from a dependency";\n',
	'/w/logo.png': '"not text"',
};

async function runCommand(id: string, ...args: unknown[]): Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	await handler(...args);
}

function report(): string {
	const last = _openedDocuments().at(-1);
	if (!last) throw new Error('no report was opened');
	return last.getText();
}

function open(files: Record<string, string> = TREE): void {
	_setWorkspaceFiles(files);
	workspace.workspaceFolders = [{ uri: Uri.file('/w'), name: 'w', index: 0 }];
}

beforeEach(() => {
	_resetMockState();
	const context = _createExtensionContext();
	registerExtractWorkspaceCommands(context as never, {
		telemetry: createTelemetry(context as never),
		notifier: createNotifier(),
		statusBar: createStatusBar(context as never),
	});
});

describe('string-le.extractWorkspace and string-le.extractFolder', () => {
	it('warns when no workspace is open', async () => {
		_setConfig('string-le.notificationsLevel', 'all');
		await runCommand('string-le.extractWorkspace');
		expect(_shownMessages()[0]).toMatchObject({ kind: 'warning' });
		expect(_openedDocuments()).toHaveLength(0);
	});

	it('lists each distinct string once, the most widely used first, with how often and where', async () => {
		open();
		await runCommand('string-le.extractWorkspace');

		const text = report();
		expect(text).toContain(
			'3 file(s) read · 2 distinct string(s), 6 occurrence(s) in 3 file(s)',
		);
		expect(text.split('\n').filter((line) => line.startsWith('| `'))).toEqual([
			'| `Save changes` | 4 | 3 |',
			'| `Cancel` | 2 | 2 |',
		]);
		// Left out by the built-in list, and a .png is never opened.
		expect(text).not.toContain('from a dependency');
		expect(text).not.toContain('not text');
	});

	it('follows the positions setting on screen, and decides the copy separately', async () => {
		open();
		_setConfig('string-le.showPositions', true);
		_setConfig('string-le.clipboardIncludesPositions', false);
		_setConfig('string-le.copyToClipboardEnabled', true);
		await runCommand('string-le.extractWorkspace');

		expect(report()).toContain(
			'- `/w/i18n/en.json` · **2:11**\n- `/w/src/a.ts` · **1:11**, **3:11**\n- `/w/src/b.py` · **1:9**',
		);
		expect(_clipboardText()).toContain('- `/w/src/a.ts` (2)');
		expect(_clipboardText()).not.toMatch(/\*\*\d+:\d+\*\*/);

		_setConfig('string-le.showPositions', false);
		await runCommand('string-le.extractWorkspace');
		expect(report()).toContain('- `/w/src/a.ts` (2)');
		expect(report()).not.toMatch(/\*\*\d+:\d+\*\*/);
	});

	it('names a file its format reader could not parse, with the reason', async () => {
		open({ ...TREE, '/w/bad.json': '{"a": ' });
		await runCommand('string-le.extractWorkspace');

		expect(report()).toContain('## Could not be read (1)');
		expect(report()).toMatch(/^- `\/w\/bad\.json`: Invalid JSON: /m);
	});

	it('shows a long or many-line string as one cut line, and still compares it whole', async () => {
		const long = 'x'.repeat(200);
		open({
			'/w/a.json': JSON.stringify({
				a: `${long}1`,
				b: `${long}2`,
				c: 'two\nlines',
			}),
		});
		await runCommand('string-le.extractWorkspace');

		const rows = report()
			.split('\n')
			.filter((line) => line.startsWith('| `'));
		// Two strings that differ only past the cut stay two rows.
		expect(rows).toHaveLength(3);
		expect(
			rows.filter((row) => row.includes(`${'x'.repeat(120)}…`)),
		).toHaveLength(2);
		expect(rows.some((row) => row.includes('`two lines`'))).toBe(true);
	});

	it('scans only the folder it is handed, and names files relative to it', async () => {
		open();
		await runCommand('string-le.extractFolder', Uri.file('/w/src'));

		expect(report()).toContain(
			'`/w/src` · 2 file(s) read · 2 distinct string(s), 4 occurrence(s) in 2 file(s)',
		);
		expect(report()).toMatch(/^- `a\.ts`/m);
	});

	it('asks for a folder from the palette, and does nothing when none is picked', async () => {
		open();
		_respondToOpenDialog(() => undefined);
		await runCommand('string-le.extractFolder');
		expect(_openedDocuments()).toHaveLength(0);

		_respondToOpenDialog(() => [Uri.file('/w/src')]);
		await runCommand('string-le.extractFolder');
		expect(report()).toContain('`/w/src` · 2 file(s) read');
	});

	it('stops at the results limit and says the rest was not read', async () => {
		open();
		_setConfig('string-le.workspace.scanMaxResults', 1);
		await runCommand('string-le.extractWorkspace');

		expect(report()).toContain(
			'1 distinct string(s), 1 occurrence(s) in 1 file(s)',
		);
		expect(report()).toContain(
			'> The results limit was reached. The rest of the files were not read.',
		);
	});

	it('says when a folder holds no strings', async () => {
		open({ '/w/a.json': '{"n": 1}\n' });
		await runCommand('string-le.extractWorkspace');
		expect(report()).toContain('No strings found.');
	});

	it('prints the report the README shows as its sample', async () => {
		open({ ...TREE, '/w/bad.json': '{"a": ' });
		_setConfig('string-le.showPositions', true);
		await runCommand('string-le.extractFolder', Uri.file('/w'));

		const readme = readFileSync(
			join(__dirname, '..', '..', 'README.md'),
			'utf8',
		);
		const shown = report()
			.split('\n')
			.filter(
				(line) =>
					line.startsWith('- ') ||
					line.startsWith('| `') ||
					line.startsWith('## '),
			);
		expect(shown).toHaveLength(11);
		for (const line of shown) expect(readme).toContain(line);
		expect(readme).toContain(
			'4 file(s) read · 2 distinct string(s), 6 occurrence(s) in 3 file(s)',
		);
	});
});
