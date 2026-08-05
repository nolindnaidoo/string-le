import * as vscode from 'vscode';

const SUPPORTED_LANGUAGES: readonly string[] = [
	'json',
	'yaml',
	'csv',
	'toml',
	'ini',
	'dotenv',
	'env',
];

/**
 * Register code actions for string extraction.
 * Provides Quick Fix actions across supported file types.
 */
export function registerCodeActions(context: vscode.ExtensionContext): void {
	const provider = createCodeActionProvider();
	const metadata = createProviderMetadata();

	registerProviderForLanguages(context, provider, metadata);
}

function createCodeActionProvider(): vscode.CodeActionProvider {
	return {
		provideCodeActions(document): vscode.CodeAction[] | undefined {
			return provideExtractStringAction(document);
		},
	};
}

function provideExtractStringAction(
	document: vscode.TextDocument,
): vscode.CodeAction[] | undefined {
	// Guard: Empty document
	if (isDocumentEmpty(document)) {
		return undefined;
	}

	const action = buildExtractStringAction();
	return [action];
}

function isDocumentEmpty(document: vscode.TextDocument): boolean {
	const text = document.getText();
	return !text || text.trim().length === 0;
}

function buildExtractStringAction(): vscode.CodeAction {
	const title = vscode.l10n.t('Extract strings');

	const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);

	action.command = {
		command: 'string-le.extractStrings',
		title,
	};

	action.isPreferred = true;

	return action;
}

function createProviderMetadata(): vscode.CodeActionProviderMetadata {
	return {
		providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
	};
}

function registerProviderForLanguages(
	context: vscode.ExtensionContext,
	provider: vscode.CodeActionProvider,
	metadata: vscode.CodeActionProviderMetadata,
): void {
	for (const language of SUPPORTED_LANGUAGES) {
		const disposable = vscode.languages.registerCodeActionsProvider(
			language,
			provider,
			metadata,
		);

		context.subscriptions.push(disposable);
	}
}
