import * as assert from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';

/**
 * Both localization mechanisms, loaded by a real host running in German.
 *
 * `test/integration/l10n.test.ts` holds the catalogues complete and in parity,
 * and says why it cannot show that either mechanism loads: `vscode.l10n.t`
 * resolves against the extension that calls it, and a test file is its own
 * extension with an empty bundle. What a test can read is what this extension
 * produces: the workspace report, whose headings go through `l10n.t()` inside
 * the extension's own code. That is the runtime half, the one a catalogue in
 * parity says nothing about.
 *
 * The manifest half is not shown here. The host does not localize the manifest
 * of an extension loaded from a development path, whatever catalogues sit next
 * to it, so a German command title can only be read off an installed VSIX. The
 * English substitution is held by the integration suite, the German catalogue's
 * presence in the VSIX by the packaging gate, and its keys by the parity tests.
 *
 * Launched by the `german host` config in `.vscode-test.mjs`, with
 * `--locale=de` and the German language pack installed into the test profile.
 */
describe('String-LE in a German host', function () {
	this.timeout(60_000);

	const extension = vscode.extensions.getExtension('nolindnaidoo.string-le');

	it('runs in German', () => {
		assert.strictEqual(vscode.env.language, 'de');
	});

	it('shows the runtime half in German: the workspace report', async () => {
		assert.ok(extension, 'extension not found');
		await extension.activate();
		const root = mkdtempSync(join(tmpdir(), 'string-le-de-'));
		mkdirSync(join(root, 'src'));
		writeFileSync(join(root, 'src', 'a.json'), '{"greeting": "Guten Tag"}\n');

		await vscode.commands.executeCommand('string-le.extractFolder', vscode.Uri.file(root));

		const report = vscode.workspace.textDocuments.find(
			(doc) => doc.languageId === 'markdown' && doc.getText().includes('`Guten Tag`'),
		);
		assert.ok(report, 'no workspace report was opened');
		const text = report.getText();
		assert.ok(text.includes('String-LE-Arbeitsbereichsbericht'), text);
		assert.ok(text.includes('| Zeichenfolge | Vorkommen | Dateien | Wo |'), text);
	});
});
