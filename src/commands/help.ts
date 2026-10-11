import * as vscode from 'vscode';
import type { Telemetry } from '../telemetry/telemetry';
import type { Notifier } from '../ui/notifier';
import type { StatusBar } from '../ui/statusBar';
import { guarded } from './guard';

export function registerHelpCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	}>,
): void {
	const command = vscode.commands.registerCommand(
		'string-le.help',
		guarded(deps.notifier, () => executeHelp(deps)),
	);

	context.subscriptions.push(command);
}

async function executeHelp(
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	}>,
): Promise<void> {
	deps.telemetry.event('command-help');

	const helpContent = buildHelpContent();
	await displayHelpDocument(helpContent);
}

/**
 * Every claim here is backed by the code: the formats are the extractor
 * table's, the languages are the source scanner's, and the settings are the
 * manifest's. The page once said YAML, TOML and INI were read by the
 * quoted-run scan, long after each had its own reader.
 */
function buildHelpContent(): string {
	return `
# String-LE Help & Troubleshooting

## Commands
- **Extract Strings**: the string values in the active document, in a new editor
- **Extract Strings from Workspace**: the distinct strings in every file in the workspace, and where each one is
- **Extract Strings from Folder**: the same for one folder. Also on a folder in the Explorer
- **Deduplicate Strings**: remove duplicate lines from the active document
- **Sort Strings**: sort lines alphabetically or by length
- **Toggle CSV Streaming**: enable or disable streaming for large CSV files
- **Open Settings**: open String-LE's settings
- **Help & Troubleshooting**: this page

## What is read

Parsed formats return values only, never keys:
- **JSON** and **JSONC**: string values. Numbers, booleans and keys are not strings
- **YAML**: string values, quoted or not
- **TOML**: string values
- **INI**: every value, quoted or not
- **.env**: values, with export prefixes, quotes and inline comments handled. \`.env.local\` and the other spellings are read the same way
- **CSV** and **TSV**: cells, with header handling and column selection. CSV can stream

Source code is scanned by a reader that knows the language's string literals:
- **JavaScript**, **TypeScript** (and JSX, TSX), **Python**, **Rust**, **Go**, **Shell**, **PHP**, **Ruby**, **Perl**, **C#**

Everything else, Markdown included, gets the quoted-string scan: "double", 'single' and \`backtick\` runs on one line. \`string-le.fallback.multiline\` lets a run span lines. Unquoted text is not read.

## Positions
\`string-le.showPositions\` adds the line and column of each string to the output, and \`string-le.clipboardIncludesPositions\` adds them to the clipboard copy. Positions are exact for JSON, the source languages and the quoted-string scan. For the other parsed formats a warning says they are not available.

## Post-Processing

### Deduplicate
Removes repeated lines, keeping the first of each. \`string-le.dedupeEnabled\` applies it to every extraction.

### Sort
Orders lines A-Z, Z-A, or by length short-long or long-short, the same on every machine. \`string-le.sortEnabled\` and \`string-le.sortMode\` apply it to every extraction.

## CSV Features
For large CSV files, enable streaming mode:
- Command: "String-LE: Toggle CSV Streaming"
- Setting: \`string-le.csv.streamingEnabled\`
- Column selection prompts let you target one, several, or all columns

## Folder and Workspace Scans
The \`string-le.workspace.*\` settings say which files a scan reads: the glob patterns, the excludes, the globs read regardless, whether \`.gitignore\` and binary files are skipped, and the limits on files and results. The report ends with what was not read and why.

## Troubleshooting

### No strings found
- JSON, YAML, TOML: only string values are read. A file of numbers yields nothing
- A format with no reader of its own gets the quoted-string scan, which does not read unquoted text
- A document that does not parse yields nothing. \`string-le.showParseErrors\` shows the reason

### Incorrect extraction
- Check that the file parses in its own tool
- Check the string delimiters

## Settings
Access settings via Command Palette: "String-LE: Open Settings"

## Support
- GitHub Issues: https://github.com/nolindnaidoo/string-le/issues
- Documentation: https://github.com/nolindnaidoo/string-le#readme
- LE Tools: https://letools.dev

Enjoying it? A rating helps more than you'd think:
- Rate on VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.string-le&ssr=false#review-details
- Rate on Open VSX: https://open-vsx.org/extension/nolindnaidoo/string-le/reviews

Built by nolindnaidoo (https://github.com/nolindnaidoo) — MIT licensed.
	`.trim();
}

async function displayHelpDocument(content: string): Promise<void> {
	const document = await vscode.workspace.openTextDocument({
		content,
		language: 'markdown',
	});

	await vscode.window.showTextDocument(document, {
		preview: false,
		viewColumn: vscode.ViewColumn.Beside,
	});
}
