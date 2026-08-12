export function normalizeFileType(
	raw: string | undefined,
): SupportedFileType | undefined {
	if (!raw) return undefined;
	const v = raw.trim().toLowerCase();
	return isSupportedFileType(v) ? v : undefined;
}

/**
 * Every language id the extract command can act on without asking.
 *
 * The source languages are VS Code language ids rather than file
 * extensions, because this is the list the editor path checks against
 * `document.languageId`. The MCP resolver's alias table
 * (`src/mcp/fileType.ts`) is the wider one; it also has to answer for a
 * filename.
 */
export type SupportedFileType =
	| 'json'
	| 'yaml'
	| 'yml'
	| 'csv'
	| 'toml'
	| 'ini'
	| 'env'
	| 'python'
	| 'rust'
	| 'go'
	| 'shellscript'
	| 'php'
	| 'ruby'
	| 'perl'
	| 'csharp'
	| 'javascript'
	| 'javascriptreact'
	| 'typescript'
	| 'typescriptreact'
	| 'markdown'
	| 'fallback';

const SUPPORTED: ReadonlySet<string> = new Set([
	'json',
	'yaml',
	'yml',
	'csv',
	'toml',
	'ini',
	'env',
	'python',
	'rust',
	'go',
	'shellscript',
	'php',
	'ruby',
	'perl',
	'csharp',
	'javascript',
	'javascriptreact',
	'typescript',
	'typescriptreact',
	'markdown',
	'fallback',
]);

export function isSupportedFileType(value: string): value is SupportedFileType {
	return SUPPORTED.has(value);
}
