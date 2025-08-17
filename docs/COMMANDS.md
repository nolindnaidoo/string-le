## String‑LE Commands Guide

This document describes all commands exposed by the String‑LE VS Code extension in an API-style format. Each command lists its identifier, availability, keybinding (if any), behavior, preconditions, prompts/inputs, outputs/side effects, related settings, and expected warnings/errors.

### Where to run
- Command: View → Command → search for "String‑LE" (macOS: Cmd+Shift+P, Windows/Linux: Ctrl+Shift+P)
- Keyboard shortcuts: when provided (see Quick reference)
- Editor context menu: for supported file types where noted

![String‑LE commands in the Command](https://github.com/nolindnaidoo/string-le/blob/main/src/assets/images/command-palette.png)

### Quick reference

| Command | Identifier | Keybinding | Where available | Description |
| --- | --- | --- | --- | --- |
| Extract Strings | `string-le.extractStrings` | macOS: `cmd+alt+e` • Win/Linux: `ctrl+alt+e` | Command; Editor context menu for `.json`, `.yaml`, `.yml`, `.csv`, `.toml`, `.ini`, `.env`; when editor has focus | Extracts strings from the active document; supports JSON, YAML, CSV, TOML, INI, and .ENV. Respects dedupe/sort and safety settings. |
| Post‑process: Dedupe | `string-le.postProcess.dedupe` | — | Command; active editor | Deduplicates lines from the current editor/document and outputs per settings. |
| Post‑process: Sort | `string-le.postProcess.sort` | — | Command; active editor | Sorts lines in the current editor. Prompts for mode (alpha asc/desc, length asc/desc). |
| Toggle CSV Streaming | `string-le.csv.toggleStreaming` | — | Command | Toggles `string-le.csv.streamingEnabled`. Status bar reflects the streaming state when enabled. |
| Open Settings | `string-le.openSettings` | — | Command | Opens the Settings UI filtered to `string-le.*`. |
| Help & Troubleshooting | `string-le.help` | — | Command | Opens a help webview with troubleshooting information. |

---

## Detailed commands

### Extract Strings
- **Identifier**: `string-le.extractStrings`
- **Keybinding**: macOS `cmd+alt+e`, Windows/Linux `ctrl+alt+e`
- **Availability**:
  - Command
  - Editor context menu when file extension is `.json`, `.yaml`, `.yml`, `.csv`, `.toml`, `.ini`, `.env`
  - Requires an active text editor
- **Behavior**:
  - Detects file type or prompts when ambiguous (e.g., .env variants)
  - Supports CSV extraction with optional column selection and header handling
  - Applies dedupe/sort according to settings and shows progress with cancellation
  - For very large outputs, offers Open/Copy/Cancel to protect the UI
- **Related settings**:
  - `string-le.dedupeEnabled`
  - `string-le.sortEnabled`, `string-le.sortMode`
  - `string-le.copyToClipboardEnabled`
  - `string-le.openResultsSideBySide`, `string-le.postProcess.openInNewFile`
  - `string-le.safety.*` (enabled, thresholds)
  - `string-le.csv.streamingEnabled`
 - **Preconditions**:
   - Active text editor with a supported file type
   - Workspace is trusted or supports limited functionality
 - **Prompts/Inputs**:
   - May prompt for CSV column(s) and header presence
   - May prompt to proceed when hitting safety thresholds
 - **Outputs/Side effects**:
   - Opens results in the editor (current or side-by-side) and/or copies to clipboard
   - Updates Status Bar; may display info/warning notifications based on `notificationsLevel`
 - **Warnings/Errors**:
   - Parse errors are surfaced when `string-le.showParseErrors` is true
   - Safety prompts for large file/output/many documents
 - **Telemetry (local-only)**:
   - Emits operation start/finish events to Output channel when `string-le.telemetryEnabled` is true

### Post‑process: Dedupe
- **Identifier**: `string-le.postProcess.dedupe`
- **Availability**: Command; requires an active editor
- **Behavior**: Removes duplicate lines from the current document then outputs per your open‑in‑place/new‑file settings.
- **Related settings**:
  - `string-le.postProcess.openInNewFile`
 - **Preconditions**:
   - Active text editor with a text document
 - **Prompts/Inputs**: None
 - **Outputs/Side effects**:
   - Replaces current document contents or opens a new editor per settings
 - **Warnings/Errors**:
   - None (no-ops when document is empty)
 - **Telemetry (local-only)**:
   - Emits dedupe start/finish events when enabled

### Post‑process: Sort
- **Identifier**: `string-le.postProcess.sort`
- **Availability**: Command; requires an active editor
- **Behavior**: Prompts for a sort mode and sorts the current document's lines accordingly.
- **Sort modes**: `alpha-asc`, `alpha-desc`, `length-asc`, `length-desc`
- **Related settings**:
  - `string-le.postProcess.openInNewFile`
 - **Preconditions**:
   - Active text editor with a text document
 - **Prompts/Inputs**:
   - Sort mode picker (unless already configured in settings)
 - **Outputs/Side effects**:
   - Replaces current document contents or opens a new editor per settings
 - **Warnings/Errors**:
   - None (no-ops when document is empty)
 - **Telemetry (local-only)**:
   - Emits sort start/finish events when enabled

### Toggle CSV Streaming
- **Identifier**: `string-le.csv.toggleStreaming`
- **Availability**: Command
- **Behavior**: Flips `string-le.csv.streamingEnabled`. When enabled, extraction from CSV can stream incrementally into an editor; the status bar label indicates streaming.
- **Related settings**:
  - `string-le.csv.streamingEnabled`
  - `string-le.statusBar.enabled`
 - **Preconditions**: None
 - **Prompts/Inputs**: Confirmation toast
 - **Outputs/Side effects**:
   - Status Bar label reflects `(CSV Streaming)` when enabled
 - **Warnings/Errors**: None
 - **Telemetry (local-only)**: Emits toggle event when enabled

### Open Settings
- **Identifier**: `string-le.openSettings`
- **Availability**: Command
- **Behavior**: Opens the Settings UI filtered to `string-le.*` for quick access to all extension settings.
 - **Preconditions**: None
 - **Prompts/Inputs**: None
 - **Outputs/Side effects**: Opens Settings UI
 - **Warnings/Errors**: None

### Help & Troubleshooting
- **Identifier**: `string-le.help`
- **Availability**: Command
- **Behavior**: Opens the built‑in troubleshooting webview.
 - **Preconditions**: None
 - **Prompts/Inputs**: None
 - **Outputs/Side effects**: Opens webview with help docs
 - **Warnings/Errors**: None

---

## Examples
- Extract via keybinding: focus an editor with a supported file type and press `Cmd+Alt+E` / `Ctrl+Alt+E`.
- Extract via context menu: right-click in a supported file and choose “String‑LE: Extract”.

## Command return conventions
- Commands do not return values; results are presented in the editor and/or clipboard.
- All operations are cancellable during progress dialogs where applicable.

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
