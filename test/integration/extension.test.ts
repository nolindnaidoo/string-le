import * as assert from 'node:assert';
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
});
