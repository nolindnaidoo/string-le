import * as assert from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'nolindnaidoo.string-le';

async function openEditor(
	content: string,
	language: string,
): Promise<vscode.TextEditor> {
	const document = await vscode.workspace.openTextDocument({
		content,
		language,
	});
	return vscode.window.showTextDocument(document);
}

describe('String-LE integration', function () {
	this.timeout(30_000);

	it('activates', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, `extension ${EXTENSION_ID} not found`);
		await extension.activate();
		assert.strictEqual(extension.isActive, true);
	});

	it('registers every declared command', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		await extension?.activate();
		const commands = await vscode.commands.getCommands(true);
		for (const id of [
			'string-le.extractStrings',
			'string-le.extractWorkspace',
			'string-le.extractFolder',
			'string-le.postProcess.dedupe',
			'string-le.postProcess.sort',
			'string-le.csv.toggleStreaming',
			'string-le.openSettings',
			'string-le.help',
		]) {
			assert.ok(commands.includes(id), `missing command: ${id}`);
		}
	});

	it('extracts JSON string values into a results document', async () => {
		await openEditor(
			'{"greeting": "hello world", "nested": {"msg": "second value"}, "n": 7}',
			'json',
		);

		await vscode.commands.executeCommand('string-le.extractStrings');

		const resultDoc = vscode.workspace.textDocuments.find(
			(doc) =>
				doc.languageId === 'plaintext' &&
				doc.getText().includes('hello world'),
		);
		assert.ok(resultDoc, 'no results document found');
		assert.deepStrictEqual(resultDoc.getText().split('\n'), [
			'hello world',
			'second value',
		]);
	});

	it('offers its MCP server to agent mode', async () => {
		// The provider is registered against the id the manifest declares; a
		// mismatch leaves the tools invisible with nothing logged. Assert the
		// declaration and the API the floor was raised for, together — the
		// registration itself is only observable in a real host, which
		// scripts/e2e-vsix.js covers against the installed VSIX.
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		await extension?.activate();

		assert.strictEqual(
			typeof vscode.lm.registerMcpServerDefinitionProvider,
			'function',
			'this VS Code build predates the MCP provider API',
		);

		const providers = extension?.packageJSON.contributes
			.mcpServerDefinitionProviders as { id: string; label: string }[];
		assert.deepStrictEqual(
			providers.map((p) => p.id),
			['string-le'],
		);
	});

	it('extracts unquoted YAML scalars (real parsing, not the quote scan)', async () => {
		await openEditor(
			'title: Plain unquoted value\nquoted: "Quoted value"\n',
			'yaml',
		);

		await vscode.commands.executeCommand('string-le.extractStrings');

		const resultDoc = vscode.workspace.textDocuments.find(
			(doc) =>
				doc.languageId === 'plaintext' &&
				doc.getText().includes('Plain unquoted value'),
		);
		assert.ok(resultDoc, 'no results document found');
		assert.deepStrictEqual(resultDoc.getText().split('\n'), [
			'Plain unquoted value',
			'Quoted value',
		]);
	});

	it('dedupe opens a results document without duplicates', async () => {
		await openEditor('alpha\nbravo\nalpha\ncharlie\nbravo', 'plaintext');

		await vscode.commands.executeCommand('string-le.postProcess.dedupe');

		const resultDoc = vscode.workspace.textDocuments.find(
			(doc) => doc.getText() === 'alpha\nbravo\ncharlie',
		);
		assert.ok(resultDoc, 'no deduplicated results document found');
	});
	it('extracts the distinct strings of a folder from disk, with how often and where', async () => {
		const root = mkdtempSync(join(tmpdir(), 'string-le-extract-'));
		for (const dir of ['src', 'node_modules', 'generated']) mkdirSync(join(root, dir));
		writeFileSync(join(root, '.gitignore'), 'generated/\n');
		writeFileSync(join(root, 'src', 'a.ts'), 'const a = "Save changes";\nconst b = "Save changes";\n');
		writeFileSync(join(root, 'src', 'en.json'), '{\n  "save": "Save changes"\n}\n');
		writeFileSync(join(root, 'node_modules', 'x.js'), 'const s = "from a dependency";\n');
		writeFileSync(join(root, 'generated', 'g.ts'), 'const g = "from generated";\n');
		writeFileSync(join(root, 'bad.json'), '{"a": ');

		await vscode.commands.executeCommand('string-le.extractFolder', vscode.Uri.file(root));

		const report = vscode.workspace.textDocuments.find(
			(doc) => doc.languageId === 'markdown' && doc.getText().includes('string-le-extract-'),
		);
		assert.ok(report, 'no workspace report was opened');
		const text = report.getText();
		assert.ok(text.includes('| `Save changes` | 3 | 2 |'));
		assert.ok(!text.includes('from a dependency') && !text.includes('from generated'));
		assert.match(text, /^- `bad\.json`: Invalid JSON: /m);
		assert.match(text, /1 file\(s\) ignored by \.gitignore/);
	});
});
