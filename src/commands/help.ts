import * as vscode from 'vscode';
import type { Telemetry } from '../telemetry/telemetry';
import type { Notifier } from '../ui/notifier';
import type { StatusBar } from '../ui/statusBar';

export function registerHelpCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry;
		notifier: Notifier;
		statusBar: StatusBar;
	}>,
): void {
	const command = vscode.commands.registerCommand('string-le.help', () =>
		executeHelp(deps),
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

function buildHelpContent(): string {
	return `
# String-LE Help & Troubleshooting

## Commands
- **Extract Strings** (Ctrl+Alt+E / Cmd+Alt+E): Extract strings from the current document
- **Deduplicate Strings**: Remove duplicate lines from the current document
- **Sort Strings**: Sort lines alphabetically or by length
- **Toggle CSV Streaming**: Enable/disable streaming for large CSV files
- **Open Settings**: Configure String-LE settings
- **Help**: Open this help documentation

## Supported File Types
- **JSON** - parsed; extracts string values (not keys, numbers, or booleans)
- **CSV** - parsed; extracts cells, with optional header handling and column selection
- **.env** - line-based; extracts values (handles export prefixes, quotes, inline comments)
- **Everything else** (YAML, TOML, INI, unknown types) - fallback scan for
  quoted strings only: "double", 'single', or \`backtick\` quoted values on a
  single line. Unquoted values are not extracted.

## Post-Processing

### Deduplicate
Removes duplicate lines, keeping only unique values.

### Sort
Sorts lines alphabetically (A-Z / Z-A) or by length (short-long / long-short).

## CSV Features
For large CSV files, enable streaming mode:
- Command: "String-LE: Toggle CSV Streaming"
- Setting: \`string-le.csv.streamingEnabled\`
- Column selection prompts let you target one, several, or all columns

## Troubleshooting

### No strings found
- JSON: only string values are extracted; a file of numbers yields nothing
- YAML/TOML/INI: only quoted values are found (fallback scan)
- Enable parse error notifications via \`string-le.showParseErrors\`

### Incorrect extraction
- Verify file syntax is valid
- Check for proper string delimiters (quotes)

## Settings
Access settings via Command Palette: "String-LE: Open Settings"

## Support
- GitHub Issues: https://github.com/nolindnaidoo/string-le/issues
- Documentation: https://github.com/nolindnaidoo/string-le#readme
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
