import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

	static joinPath(base: Uri, ...segments: string[]): Uri {
		const parts = base.path.split('/').filter(Boolean);
		for (const segment of segments.flatMap((s) => s.split('/'))) {
			if (segment === '..') parts.pop();
			else if (segment && segment !== '.') parts.push(segment);
		}
		return base.with({ path: `/${parts.join('/')}` });
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
	translate(lines: number, characters: number): Position {
		return new Position(this.line + lines, this.character + characters);
	}
}

export class RelativePattern {
	constructor(
		public readonly baseUri: Uri,
		public readonly pattern: string,
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

/**
 * An in-memory filesystem: absolute path to the file's bytes. While it is
 * empty the filesystem answers as it always did, with an empty file for any
 * path, which is what the single-document tests were written against.
 */
const workspaceFiles = new Map<string, Uint8Array>();

export function _setWorkspaceFiles(
	files: Readonly<Record<string, string | Uint8Array>>,
): void {
	workspaceFiles.clear();
	for (const [path, content] of Object.entries(files)) {
		workspaceFiles.set(
			path,
			typeof content === 'string' ? new TextEncoder().encode(content) : content,
		);
	}
}

export const workspace = {
	workspaceFolders: undefined as WorkspaceFolder[] | undefined,
	getWorkspaceFolder: (_uri: Uri) => undefined as WorkspaceFolder | undefined,
	asRelativePath: (target: Uri | string, _includeFolder?: boolean) =>
		typeof target === 'string' ? target : target.path,
	fs: {
		readFile: async (uri: Uri) => {
			if (workspaceFiles.size === 0) return new Uint8Array();
			const bytes = workspaceFiles.get(uri.path);
			if (bytes === undefined) throw new Error(`no such file: ${uri.path}`);
			return bytes;
		},
		writeFile: async (_uri: Uri, _content: Uint8Array) => {},
		stat: async (uri: Uri) => {
			if (workspaceFiles.size === 0)
				return { type: 1, ctime: 0, mtime: 0, size: 0 };
			const bytes = workspaceFiles.get(uri.path);
			if (bytes !== undefined)
				return { type: 1, ctime: 0, mtime: 0, size: bytes.length };
			const prefix = `${uri.path}/`;
			if ([...workspaceFiles.keys()].some((file) => file.startsWith(prefix)))
				return { type: 2, ctime: 0, mtime: 0, size: 0 };
			throw new Error(`no such file or directory: ${uri.path}`);
		},
	},
	// Globs are read as the editor reads the ones this code sends: `**/`
	// for any depth, `/**` for everything beneath, `*` within one segment.
	findFiles: async (
		include: string | RelativePattern,
		exclude?: string | null,
		maxResults?: number,
	) => {
		const toRegExp = (glob: string) =>
			new RegExp(
				`^${glob
					.split(/(\*\*\/|\/\*\*|\*)/)
					.map((part) =>
						part === '**/'
							? '(?:.*/)?'
							: part === '/**'
								? '/.*'
								: part === '*'
									? '[^/]*'
									: part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
					)
					.join('')}$`,
			);
		const excluded = (exclude ?? '')
			.replace(/^\{|\}$/g, '')
			.split(',')
			.filter(Boolean)
			.map(toRegExp);
		const base = typeof include === 'string' ? '' : `${include.baseUri.path}/`;
		const wanted = toRegExp(
			typeof include === 'string' ? include : include.pattern,
		);
		return [...workspaceFiles.keys()]
			.filter((path) => path.startsWith(base))
			.filter((path) => wanted.test(path.slice(base.length)))
			.filter((path) => !excluded.some((glob) => glob.test(path.slice(1))))
			.slice(0, maxResults)
			.map((path) => Uri.file(path));
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
		if (openDocumentError) throw openDocumentError;
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

const shownDocumentOptions: Array<{ viewColumn?: number }> = [];

export function _shownDocumentOptions(): readonly { viewColumn?: number }[] {
	return shownDocumentOptions;
}

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
let activeTextEditor: ReturnType<typeof createEditorFor> | undefined;
let quickPickResponder: ((items: unknown[]) => unknown) | undefined;
let warningResponder: ((items: unknown[]) => unknown) | undefined;

export function _shownMessages(): readonly ShownMessage[] {
	return shownMessages;
}

export function _setActiveEditor(document: MockDocument | undefined): void {
	// A full editor, not just { document }. The bare object had no edit(), so
	// every command that calls editor.edit(...) hit a TypeError and silently
	// took its error path — in-place replacement had never actually run in a
	// test, and a test asserting success was asserting the failure branch.
	activeTextEditor = document ? createEditorFor(document) : undefined;
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

/** Values an input-box validator refused, in order. */
const inputBoxRejections: Array<{ value: string; message: string }> = [];

export function _inputBoxRejections(): readonly {
	value: string;
	message: string;
}[] {
	return inputBoxRejections;
}

export function _respondToInputBox(
	responder: (() => string | undefined) | undefined,
): void {
	inputBoxResponder = responder;
}

let inputBoxResponder: (() => string | undefined) | undefined;

let openDialogResponder: (() => Uri[] | undefined) | undefined;

export function _respondToOpenDialog(
	responder: (() => Uri[] | undefined) | undefined,
): void {
	openDialogResponder = responder;
}

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
			if (editError) throw editError;
			return editResult;
		},
	};
}

// VS Code returns false when an edit is rejected — a read-only document, or
// one that changed underneath the command. Tests need to reach that path.
let editResult = true;

export function _setEditResult(value: boolean): void {
	editResult = value;
}

/** Make editor.edit throw, for the error-handling path. */
let editError: Error | undefined;

export function _setEditError(error: Error | undefined): void {
	editError = error;
}

/** Make workspace.openTextDocument throw, for the same reason. */
let openDocumentError: Error | undefined;

export function _setOpenDocumentError(error: Error | undefined): void {
	openDocumentError = error;
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
	showOpenDialog: async (_options?: unknown) => openDialogResponder?.(),
	showQuickPick: async (items: unknown[], _options?: unknown) =>
		quickPickResponder ? quickPickResponder(items) : undefined,
	showInputBox: async (options?: unknown) => {
		const value = inputBoxResponder ? inputBoxResponder() : undefined;

		// VS Code runs validateInput against what the user types and refuses to
		// accept a value the validator rejects. Ignoring it leaves validators
		// uncovered AND lets a test hand a command a value the real UI would
		// never deliver.
		const validate = (options as { validateInput?: (v: string) => unknown })
			?.validateInput;
		if (typeof validate === 'function' && typeof value === 'string') {
			const message = validate(value);
			if (message !== undefined && message !== null && message !== '') {
				inputBoxRejections.push({ value, message: String(message) });
				return undefined;
			}
		}
		return value;
	},
	showTextDocument: async (document: unknown, options?: unknown) => {
		// Recorded so tests can assert placement — openResultsSideBySide sets
		// viewColumn, and the editor object itself carries no such field.
		shownDocumentOptions.push(
			(options as { viewColumn?: number } | undefined) ?? {},
		);
		return createEditorFor(document as MockDocument);
	},
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
			{
				report: () => {
					// The command declares cancellable: true, so a user really can
					// cancel partway through. Counting reports is how a test reaches
					// the checks the task makes between its steps.
					progressReports += 1;
					if (
						cancelAfterReports !== undefined &&
						progressReports >= cancelAfterReports
					) {
						progressToken.isCancellationRequested = true;
					}
				},
			},
			progressToken,
		),
	createOutputChannel: (name: string) => {
		const linesOut: string[] = [];
		const channel = {
			name,
			disposed: false,
			appendLine: (line: string) => linesOut.push(line),
			dispose: () => {
				channel.disposed = true;
			},
			_lines: linesOut,
		};
		outputChannels.push(channel);
		return channel;
	},
	createStatusBarItem: (_alignment?: unknown, _priority?: number) => {
		const item = {
			text: '',
			tooltip: '',
			command: undefined as unknown,
			visible: false,
			disposed: false,
			show(): void {
				item.visible = true;
			},
			hide(): void {
				item.visible = false;
			},
			dispose(): void {
				item.disposed = true;
			},
		};
		statusBarItems.push(item);
		return item;
	},
};

const outputChannels: Array<{
	name: string;
	disposed: boolean;
	_lines: string[];
}> = [];
const statusBarItems: Array<{
	text: string;
	visible: boolean;
	disposed: boolean;
}> = [];

/** Every output channel created, disposed or not, in creation order. */
export function _outputChannels(): readonly {
	name: string;
	disposed: boolean;
	_lines: string[];
}[] {
	return outputChannels;
}

/** Every status bar item created, disposed or not, in creation order. */
export function _statusBarItems(): readonly {
	text: string;
	visible: boolean;
	disposed: boolean;
}[] {
	return statusBarItems;
}

// ---------------------------------------------------------------- lm

export class McpStdioServerDefinition {
	constructor(
		public readonly label: string,
		public readonly command: string,
		public readonly args: readonly string[] = [],
		public readonly env: Record<string, string | number | null> = {},
		public readonly version?: string,
	) {}
}

type McpProvider = { provideMcpServerDefinitions: () => unknown };
const mcpProviders: Array<{ id: string; provider: McpProvider }> = [];

/** Every MCP server definition provider registered and not yet disposed. */
export function _mcpProviders(): ReadonlyArray<{
	id: string;
	provider: McpProvider;
}> {
	return mcpProviders;
}

/**
 * `vscode.lm` as a host without the MCP API presents it: present, and empty.
 * The extension feature-detects `registerMcpServerDefinitionProvider`
 * because a fork can report a recent version and lack it; the default here
 * is that fork, and `_setLmApi(true)` gives the host VS Code 1.101's.
 */
export const lm: {
	registerMcpServerDefinitionProvider?: (
		id: string,
		provider: McpProvider,
	) => { dispose(): void };
} = {};

export function _setLmApi(present: boolean): void {
	if (!present) {
		delete lm.registerMcpServerDefinitionProvider;
		return;
	}
	lm.registerMcpServerDefinitionProvider = (id, provider) => {
		const entry = { id, provider };
		mcpProviders.push(entry);
		return {
			dispose: () => {
				const index = mcpProviders.indexOf(entry);
				if (index >= 0) mcpProviders.splice(index, 1);
			},
		};
	};
}

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

/** The version the manifest declares, read rather than typed so it cannot go stale. */
const PACKAGE_VERSION: string = (
	JSON.parse(
		readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
	) as { version: string }
).version;

export function _createExtensionContext() {
	const globalStateStore = new Map<string, unknown>();
	return {
		subscriptions: [] as Array<{ dispose(): void }>,
		asAbsolutePath: (relative: string) => join('/ext', relative),
		globalState: {
			get: <T>(key: string, defaultValue?: T): T | undefined =>
				globalStateStore.has(key)
					? (globalStateStore.get(key) as T)
					: defaultValue,
			update: async (key: string, value: unknown) => {
				globalStateStore.set(key, value);
			},
			setKeysForSync: (_keys: readonly string[]) => {},
		},
		extension: {
			id: 'nolindnaidoo.string-le',
			packageJSON: { displayName: 'Strings-LE', version: PACKAGE_VERSION },
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
const progressToken = {
	isCancellationRequested: false,
	onCancellationRequested: () => ({ dispose: () => {} }),
};
let progressReports = 0;
let cancelAfterReports: number | undefined;

/** Cancel the operation once it has reported progress `n` times (0 = at once). */
export function _cancelAfterProgress(n: number | undefined): void {
	cancelAfterReports = n;
	progressToken.isCancellationRequested = n === 0;
}

export function _resetMockState(): void {
	progressReports = 0;
	cancelAfterReports = undefined;
	progressToken.isCancellationRequested = false;
	editResult = true;
	editError = undefined;
	openDocumentError = undefined;
	inputBoxRejections.length = 0;
	shownDocumentOptions.length = 0;
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
	workspaceFiles.clear();
	openDialogResponder = undefined;
	workspace.workspaceFolders = undefined;
	openedDocuments.length = 0;
	editorInsertions.length = 0;
	replacedRanges.length = 0;
	codeActionProviders.length = 0;
	statusBarItems.length = 0;
	outputChannels.length = 0;
	mcpProviders.length = 0;
	_setLmApi(false);
}

/**
 * What is still alive: created and not disposed, registered and not removed.
 * A deactivation that leaves any of these behind is a leak.
 */
export function _live(): {
	statusBarItems: number;
	outputChannels: number;
	configListeners: number;
	commands: number;
	codeActionProviders: number;
	mcpProviders: number;
} {
	return {
		statusBarItems: statusBarItems.filter((item) => !item.disposed).length,
		outputChannels: outputChannels.filter((channel) => !channel.disposed)
			.length,
		configListeners: configListeners.length,
		commands: registeredCommands.size,
		codeActionProviders: codeActionProviders.length,
		mcpProviders: mcpProviders.length,
	};
}

export const l10n = {
	t(message: string, ...args: unknown[]): string {
		if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
			const named = args[0] as Record<string, unknown>;
			return message.replace(/\{(\w+)\}/g, (whole, key) =>
				key in named ? String(named[key]) : whole,
			);
		}
		return message.replace(/\{(\d+)\}/g, (whole, index) => {
			const value = args[Number(index)];
			return value === undefined ? whole : String(value);
		});
	},
};
