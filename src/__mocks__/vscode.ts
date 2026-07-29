/**
 * Mock VS Code API for unit tests (aliased via vitest.config.ts).
 * Stateful pieces (config store, message log, command registry) expose
 * `_reset()`/`_set()` helpers prefixed with underscore — test-only API.
 */

export interface WorkspaceFolder {
	readonly uri: Uri;
	readonly name: string;
	readonly index: number;
}

// ---------------------------------------------------------------- Uri

export class Uri {
	scheme: string;
	authority: string;
	path: string;
	query: string;
	fragment: string;

	constructor(
		scheme: string,
		authority: string,
		path: string,
		query: string,
		fragment: string,
	) {
		this.scheme = scheme;
		this.authority = authority;
		this.path = path;
		this.query = query;
		this.fragment = fragment;
	}

	get fsPath(): string {
		return this.path;
	}

	with(change: {
		scheme?: string;
		authority?: string;
		path?: string;
		query?: string;
		fragment?: string;
	}): Uri {
		return new Uri(
			change.scheme ?? this.scheme,
			change.authority ?? this.authority,
			change.path ?? this.path,
			change.query ?? this.query,
			change.fragment ?? this.fragment,
		);
	}

	toString(_skipEncoding?: boolean): string {
		return `${this.scheme}://${this.authority}${this.path}`;
	}

	toJSON(): unknown {
		return {
			scheme: this.scheme,
			authority: this.authority,
			path: this.path,
			query: this.query,
			fragment: this.fragment,
		};
	}

	static file(path: string): Uri {
		return new Uri('file', '', path, '', '');
	}

	static parse(value: string): Uri {
		const match = value.match(/^(\w+):\/\/([^/]*)(.*)$/);
		if (match?.[1] && match[2] !== undefined && match[3] !== undefined) {
			return new Uri(match[1], match[2], match[3], '', '');
		}
		return new Uri('file', '', value, '', '');
	}
}

// ---------------------------------------------- positions and ranges

export class Position {
	constructor(
		public readonly line: number,
		public readonly character: number,
	) {}
}

export class Range {
	constructor(
		public readonly start: Position,
		public readonly end: Position,
	) {}
}

export class Selection extends Range {}

export class WorkspaceEdit {
	readonly replacements: Array<{ uri: Uri; range: Range; newText: string }> =
		[];

	replace(uri: Uri, range: Range, newText: string): void {
		this.replacements.push({ uri, range, newText });
	}
}

// ---------------------------------------------------------- documents

export interface MockDocumentInit {
	readonly content: string;
	readonly languageId?: string;
	readonly fileName?: string;
}

export function _createDocument(init: MockDocumentInit) {
	const content = init.content;
	const lines = content.split('\n');
	return {
		getText: () => content,
		languageId: init.languageId ?? 'plaintext',
		fileName: init.fileName ?? '/mock/document.txt',
		uri: Uri.file(init.fileName ?? '/mock/document.txt'),
		lineCount: lines.length,
		positionAt: (offset: number) => {
			let remaining = Math.max(0, Math.min(offset, content.length));
			for (let line = 0; line < lines.length; line++) {
				const length = (lines[line] ?? '').length;
				if (remaining <= length) return new Position(line, remaining);
				remaining -= length + 1;
			}
			return new Position(
				lines.length - 1,
				(lines[lines.length - 1] ?? '').length,
			);
		},
		lineAt: (line: number) => ({
			text: lines[line] ?? '',
			range: new Range(
				new Position(line, 0),
				new Position(line, (lines[line] ?? '').length),
			),
		}),
	};
}

export type MockDocument = ReturnType<typeof _createDocument>;

// ------------------------------------------------------ configuration

const configStore = new Map<string, unknown>();
const configUpdates: Array<{ key: string; value: unknown; target: unknown }> =
	[];

export function _setConfig(key: string, value: unknown): void {
	configStore.set(key, value);
}

export function _getConfigUpdates(): ReadonlyArray<{
	key: string;
	value: unknown;
	target: unknown;
}> {
	return configUpdates;
}

export const ConfigurationTarget = {
	Global: 1,
	Workspace: 2,
	WorkspaceFolder: 3,
};

type ConfigListener = (event: {
	affectsConfiguration: (section: string) => boolean;
}) => void;
const configListeners: ConfigListener[] = [];

export function _fireConfigChange(section: string): void {
	for (const listener of configListeners) {
		listener({
			affectsConfiguration: (candidate: string) =>
				section === candidate || section.startsWith(`${candidate}.`),
		});
	}
}

// --------------------------------------------------------- workspace

export const workspace = {
	workspaceFolders: undefined as WorkspaceFolder[] | undefined,
	getWorkspaceFolder: (_uri: Uri) => undefined as WorkspaceFolder | undefined,
	fs: {
		readFile: async (_uri: Uri) => new Uint8Array(),
		writeFile: async (_uri: Uri, _content: Uint8Array) => {},
		stat: async (_uri: Uri) => ({ type: 1, ctime: 0, mtime: 0, size: 0 }),
	},
	getConfiguration: (section?: string) => ({
		get: <T>(key: string, defaultValue?: T): T | undefined => {
			const full = section ? `${section}.${key}` : key;
			return configStore.has(full)
				? (configStore.get(full) as T)
				: defaultValue;
		},
		update: async (key: string, value: unknown, target?: unknown) => {
			const full = section ? `${section}.${key}` : key;
			configStore.set(full, value);
			configUpdates.push({ key: full, value, target });
		},
	}),
	onDidChangeConfiguration: (listener: ConfigListener) => {
		configListeners.push(listener);
		return {
			dispose: () => {
				const index = configListeners.indexOf(listener);
				if (index >= 0) configListeners.splice(index, 1);
			},
		};
	},
	openTextDocument: async (options?: {
		content?: string;
		language?: string;
	}) => {
		const document = _createDocument({
			content: options?.content ?? '',
			languageId: options?.language ?? 'plaintext',
		});
		openedDocuments.push(document);
		return document;
	},
	applyEdit: async (edit: WorkspaceEdit) => {
		appliedEdits.push(edit);
		return true;
	},
};

const openedDocuments: MockDocument[] = [];

export function _openedDocuments(): readonly MockDocument[] {
	return openedDocuments;
}

export const appliedEdits: WorkspaceEdit[] = [];

// ------------------------------------------------------------ window

export interface ShownMessage {
	readonly kind: 'info' | 'warning' | 'error';
	readonly message: string;
	readonly items: readonly unknown[];
}

const shownMessages: ShownMessage[] = [];
let activeTextEditor: { document: MockDocument } | undefined;
let quickPickResponder: ((items: unknown[]) => unknown) | undefined;
let warningResponder: ((items: unknown[]) => unknown) | undefined;

export function _shownMessages(): readonly ShownMessage[] {
	return shownMessages;
}

export function _setActiveEditor(document: MockDocument | undefined): void {
	activeTextEditor = document ? { document } : undefined;
}

export function _respondToQuickPick(
	responder: ((items: unknown[]) => unknown) | undefined,
): void {
	quickPickResponder = responder;
}

export function _respondToWarning(
	responder: ((items: unknown[]) => unknown) | undefined,
): void {
	warningResponder = responder;
}

export function _respondToInputBox(
	responder: (() => string | undefined) | undefined,
): void {
	inputBoxResponder = responder;
}

let inputBoxResponder: (() => string | undefined) | undefined;

export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2 };
export const ProgressLocation = { Notification: 15, Window: 10 };

export interface MockEditorInsertion {
	readonly position: Position;
	readonly text: string;
}

const editorInsertions: MockEditorInsertion[] = [];

export function _editorInsertions(): readonly MockEditorInsertion[] {
	return editorInsertions;
}

function createEditorFor(document: MockDocument) {
	return {
		document,
		edit: async (
			callback: (editBuilder: {
				insert: (position: Position, text: string) => void;
				replace: (range: Range, text: string) => void;
				delete: (range: Range) => void;
			}) => void,
		): Promise<boolean> => {
			callback({
				insert: (position: Position, text: string) => {
					editorInsertions.push({ position, text });
				},
				replace: (range: Range, text: string) => {
					replacedRanges.push({ range, text });
				},
				delete: () => {},
			});
			return true;
		},
	};
}

const replacedRanges: Array<{ range: Range; text: string }> = [];

export function _replacedRanges(): ReadonlyArray<{
	range: Range;
	text: string;
}> {
	return replacedRanges;
}

export const window = {
	get activeTextEditor() {
		return activeTextEditor;
	},
	showInformationMessage: async (message: string, ...items: unknown[]) => {
		shownMessages.push({ kind: 'info', message, items });
		return undefined;
	},
	showWarningMessage: async (message: string, ...items: unknown[]) => {
		shownMessages.push({ kind: 'warning', message, items });
		return warningResponder?.(items);
	},
	showErrorMessage: async (message: string, ...items: unknown[]) => {
		shownMessages.push({ kind: 'error', message, items });
		return undefined;
	},
	showQuickPick: async (items: unknown[], _options?: unknown) =>
		quickPickResponder ? quickPickResponder(items) : undefined,
	showInputBox: async (_options?: unknown) =>
		inputBoxResponder ? inputBoxResponder() : undefined,
	showTextDocument: async (document: unknown, _column?: unknown) =>
		createEditorFor(document as MockDocument),
	withProgress: async <T>(
		_options: unknown,
		task: (
			progress: { report: (value: unknown) => void },
			token: {
				isCancellationRequested: boolean;
				onCancellationRequested: (listener: () => void) => {
					dispose(): void;
				};
			},
		) => Thenable<T>,
	): Promise<T> =>
		task(
			{ report: () => {} },
			{
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose: () => {} }),
			},
		),
	createOutputChannel: (_name: string) => {
		const linesOut: string[] = [];
		return {
			appendLine: (line: string) => linesOut.push(line),
			dispose: () => {},
			_lines: linesOut,
		};
	},
	createStatusBarItem: (_alignment?: unknown, _priority?: number) => ({
		text: '',
		tooltip: '',
		command: undefined as unknown,
		visible: false,
		show(): void {
			(this as { visible: boolean }).visible = true;
		},
		hide(): void {
			(this as { visible: boolean }).visible = false;
		},
		dispose: () => {},
	}),
};

// ---------------------------------------------------------- languages

export class CodeAction {
	command: { command: string; title: string } | undefined;
	isPreferred: boolean | undefined;

	constructor(
		public readonly title: string,
		public readonly kind: unknown,
	) {}
}

export const CodeActionKind = { QuickFix: 'quickfix' };

const codeActionProviders: Array<{ language: string; provider: unknown }> = [];

export function _codeActionProviders(): ReadonlyArray<{
	language: string;
	provider: unknown;
}> {
	return codeActionProviders;
}

export const languages = {
	registerCodeActionsProvider: (
		language: string,
		provider: unknown,
		_metadata?: unknown,
	) => {
		codeActionProviders.push({ language, provider });
		return {
			dispose: () => {
				const index = codeActionProviders.findIndex(
					(entry) => entry.provider === provider,
				);
				if (index >= 0) codeActionProviders.splice(index, 1);
			},
		};
	},
};

// ---------------------------------------------------------- commands

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

export function _registeredCommands(): ReadonlyMap<
	string,
	(...args: unknown[]) => unknown
> {
	return registeredCommands;
}

export const commands = {
	registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
		registeredCommands.set(id, handler);
		return {
			dispose: () => {
				registeredCommands.delete(id);
			},
		};
	},
	executeCommand: async (id: string, ...args: unknown[]) => {
		const handler = registeredCommands.get(id);
		if (handler) return handler(...args);
		executedBuiltins.push({ id, args });
		return undefined;
	},
};

export const executedBuiltins: Array<{ id: string; args: unknown[] }> = [];

// --------------------------------------------------------------- env

const clipboard = { value: '' };

export const env = {
	clipboard: {
		writeText: async (text: string) => {
			clipboard.value = text;
		},
		readText: async () => clipboard.value,
	},
	openExternal: async (_uri: Uri) => true,
};

export function _clipboardText(): string {
	return clipboard.value;
}

// ------------------------------------------------- extension context

export function _createExtensionContext() {
	const globalStateStore = new Map<string, unknown>();
	return {
		subscriptions: [] as Array<{ dispose(): void }>,
		globalState: {
			get: <T>(key: string, defaultValue?: T): T | undefined =>
				globalStateStore.has(key)
					? (globalStateStore.get(key) as T)
					: defaultValue,
			update: async (key: string, value: unknown) => {
				globalStateStore.set(key, value);
			},
		},
	};
}

export type MockExtensionContext = ReturnType<typeof _createExtensionContext>;

// -------------------------------------------------------------- misc

export const FileType = {
	Unknown: 0,
	File: 1,
	Directory: 2,
	SymbolicLink: 64,
};

/** Reset all mutable mock state between tests. */
export function _resetMockState(): void {
	configStore.clear();
	configUpdates.length = 0;
	configListeners.length = 0;
	shownMessages.length = 0;
	appliedEdits.length = 0;
	executedBuiltins.length = 0;
	registeredCommands.clear();
	activeTextEditor = undefined;
	quickPickResponder = undefined;
	warningResponder = undefined;
	inputBoxResponder = undefined;
	clipboard.value = '';
	workspace.workspaceFolders = undefined;
	openedDocuments.length = 0;
	editorInsertions.length = 0;
	replacedRanges.length = 0;
	codeActionProviders.length = 0;
}
