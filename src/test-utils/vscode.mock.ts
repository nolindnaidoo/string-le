import { vi } from 'vitest';

export const Uri = {
	file: vi.fn((path: string) => ({
		fsPath: path,
		path,
		scheme: 'file',
		toString: () => `file://${path}`,
	})),
	parse: vi.fn((str: string) => ({
		fsPath: str.replace('file://', ''),
		path: str.replace('file://', ''),
		scheme: 'file',
		toString: () => str,
	})),
};

export const workspace = {
	getConfiguration: vi.fn(() => ({
		get: vi.fn(),
		update: vi.fn(),
		has: vi.fn(),
	})),
	openTextDocument: vi.fn(),
	applyEdit: vi.fn(),
	createFileSystemWatcher: vi.fn(() => ({
		onDidCreate: vi.fn(),
		onDidDelete: vi.fn(),
		onDidChange: vi.fn(),
		dispose: vi.fn(),
	})),
	workspaceFolders: [
		{
			uri: Uri.file('/root/folder'),
			name: 'test-workspace',
			index: 0,
		},
	],
	env: {
		clipboard: {
			writeText: vi.fn(),
		},
	},
	onDidChangeConfiguration: vi.fn(() => ({
		dispose: vi.fn(),
	})),
};

export const window = {
	activeTextEditor: undefined,
	showInformationMessage: vi.fn(),
	showWarningMessage: vi.fn(),
	showErrorMessage: vi.fn(),
	showQuickPick: vi.fn().mockResolvedValue(undefined),
	showTextDocument: vi.fn(),
	withProgress: vi.fn((_options, task) => task({}, CancellationToken.None)),
	setStatusBarMessage: vi.fn(),
	createStatusBarItem: vi.fn(() => ({
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
	})),
	createOutputChannel: vi.fn(() => ({
		appendLine: vi.fn(),
		show: vi.fn(),
		dispose: vi.fn(),
	})),
};

export const commands = {
	registerCommand: vi.fn(),
	executeCommand: vi.fn(),
};

export const ViewColumn = {
	One: 1,
	Two: 2,
	Three: 3,
	Four: 4,
	Five: 5,
	Six: 6,
	Seven: 7,
	Eight: 8,
	Nine: 9,
	Active: -1,
	Beside: -2,
};

export const mockExtensionContext = {
	subscriptions: {
		push: vi.fn(),
	},
};

export const languages = {
	registerCodeActionsProvider: vi.fn(),
};

export const CodeActionKind = {
	QuickFix: 'quickfix',
	Refactor: 'refactor',
	Source: 'source',
	Empty: '',
};

export const ProgressLocation = {
	SourceControl: 1,
	Window: 10,
	Notification: 15,
};

export const CancellationToken = {
	None: {
		isCancellationRequested: false,
		onCancellationRequested: vi.fn(),
	},
};

export const Range = vi.fn(
	(startLine: number, startChar: number, endLine: number, endChar: number) => ({
		start: { line: startLine, character: startChar },
		end: { line: endLine, character: endChar },
	}),
);

export const Position = {
	create: vi.fn(),
};

export const StatusBarAlignment = {
	Left: 1,
	Right: 2,
};

export const TextEditorEdit = vi.fn();

export const TextEdit = {
	replace: vi.fn(),
	insert: vi.fn(),
	delete: vi.fn(),
};
