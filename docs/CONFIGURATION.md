## String‑LE Settings API

This document describes the full configuration surface for the String‑LE VS Code extension. Each setting lists its key, type, default, behavior, and related commands. All settings live under the `string-le.*` namespace and can be changed in the Settings UI or via `settings.json`.

### Where to configure
- VS Code UI: Preferences → Settings → Extensions → String‑LE
- Settings JSON example:

```json
{
  "string-le.openResultsSideBySide": true,
  "string-le.postProcess.openInNewFile": false,
  "string-le.copyToClipboardEnabled": false,
  "string-le.notificationsLevel": "all",
  "string-le.showParseErrors": false,
  "string-le.sortEnabled": false,
  "string-le.sortMode": "off",
  "string-le.statusBar.enabled": true,
  "string-le.safety.enabled": true,
  "string-le.safety.fileSizeWarnBytes": 1000000,
  "string-le.safety.largeOutputLinesThreshold": 50000,
  "string-le.safety.manyDocumentsThreshold": 8,
  "string-le.csv.streamingEnabled": false,
  "string-le.telemetryEnabled": false
}
```

### Quick reference

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `string-le.openResultsSideBySide` | boolean | `false` | Open extraction results in a new editor to the side instead of replacing the current one. |
| `string-le.postProcess.openInNewFile` | boolean | `false` | Open post‑processed content in a new editor instead of replacing the existing document. |
| `string-le.copyToClipboardEnabled` | boolean | `false` | Automatically copy extraction results to the clipboard (not applied for CSV outputs). |
| `string-le.notificationsLevel` | enum | `"all"` | Notification verbosity: `all`, `important`, or `silent`. |
| `string-le.showParseErrors` | boolean | `false` | Show parse errors as VS Code notifications when parsing fails. |
| `string-le.sortEnabled` | boolean | `false` | Enable automatic sorting of extracted strings. |
| `string-le.sortMode` | enum | `"off"` | Sorting mode: `off`, `alpha-asc`, `alpha-desc`, `length-asc`, `length-desc`. |
| `string-le.statusBar.enabled` | boolean | `true` | Show String‑LE status bar entry for quick access. |
| `string-le.safety.enabled` | boolean | `true` | Enable safety checks for large files, large outputs, and multi‑document fan‑out. |
| `string-le.safety.fileSizeWarnBytes` | number | `1000000` | Warn when input file size exceeds this many bytes. Minimum `1000`. |
| `string-le.safety.largeOutputLinesThreshold` | number | `50000` | Warn before opening/copying when result lines exceed this threshold. Minimum `100`. |
| `string-le.safety.manyDocumentsThreshold` | number | `8` | Warn before opening multiple result documents when count exceeds this threshold. Minimum `1`. |
| `string-le.csv.streamingEnabled` | boolean | `false` | Stream CSV extraction incrementally into the editor. |
| `string-le.telemetryEnabled` | boolean | `false` | Enable local‑only telemetry logs to the Output panel. |

---

## Detailed settings

### Editor behavior

#### `string-le.openResultsSideBySide`
- **Type**: boolean
- **Default**: `false`
- **Behavior**: When enabled, extracted results open in a new editor with `viewColumn = Beside`, keeping the source editor visible. When disabled, results reuse the active editor where appropriate.
- **Used by**: `extractStrings` result presentation.
- **Example**:
```json
{ "string-le.openResultsSideBySide": true }
```

#### `string-le.postProcess.openInNewFile`
- **Type**: boolean
- **Default**: `false`
- **Behavior**: When running post‑processing commands (dedupe/sort), open the processed output in a new editor. If disabled, post‑processing updates the current document.
- **Used by**: post‑process helper during dedupe/sort operations.

#### `string-le.copyToClipboardEnabled`
- **Type**: boolean
- **Default**: `false`
- **Behavior**: After extraction completes, automatically copies the final output to the clipboard. For CSV workflows, clipboard copy is skipped (CSV is typically opened/streamed into an editor).
- **Used by**: extraction command finalization.

#### `string-le.statusBar.enabled`
- **Type**: boolean
- **Default**: `true`
- **Behavior**: Shows/hides the String‑LE status bar item. When CSV streaming is active, the status bar label reflects it.
- **Used by**: status bar UI component.

### Extraction and processing

#### `string-le.dedupeEnabled`
- **Type**: boolean
- **Default**: `false`
- **Behavior**: Deduplicate extracted strings. Applies to both normal and CSV workflows.

#### `string-le.sortEnabled`
- **Type**: boolean
- **Default**: `false`
- **Behavior**: Enable sorting for extracted strings. Sorting is applied according to `string-le.sortMode`.

#### `string-le.sortMode`
- **Type**: enum `"off" | "alpha-asc" | "alpha-desc" | "length-asc" | "length-desc"`
- **Default**: `"off"`
- **Behavior**: Selects how results are sorted when `sortEnabled` is true.

#### `string-le.showParseErrors`
- **Type**: boolean
- **Default**: `false`
- **Behavior**: Emits parse error messages through VS Code notifications during extraction (e.g., malformed CSV/JSON/TOML/etc.). Respectful of `notificationsLevel`.

#### `string-le.notificationsLevel`
- **Type**: enum `"all" | "important" | "silent"`
- **Default**: `"all"`
- **Behavior**: Controls the verbosity of informational and warning/error notifications shown by the extension.

### CSV workflow

#### `string-le.csv.streamingEnabled`
- **Type**: boolean
- **Default**: `false`
- **Behavior**: Streams CSV extraction incrementally into the editor. Useful for large CSVs. Sorting and deduplication options are still respected by the streaming paths but may increase processing time on very large datasets.
- **Related command**: `String‑LE: Toggle CSV Streaming` (`string-le.csv.toggleStreaming`).
- **Shown in UI**: Status bar label includes “(CSV Streaming)” when enabled.

### Safety guards

#### `string-le.safety.enabled`
- **Type**: boolean
- **Default**: `true`
- **Behavior**: Master switch for safety checks. When enabled, the extension may warn before heavy operations and offer alternatives (open/copy/cancel).

#### `string-le.safety.fileSizeWarnBytes`
- **Type**: number (minimum `1000`)
- **Default**: `1000000`
- **Behavior**: Warn when the input file size exceeds the configured threshold in bytes.

#### `string-le.safety.largeOutputLinesThreshold`
- **Type**: number (minimum `100`)
- **Default**: `50000`
- **Behavior**: When the number of extracted lines exceeds this value, the extension offers to copy instead of opening to avoid UI lockups.

#### `string-le.safety.manyDocumentsThreshold`
- **Type**: number (minimum `1`)
- **Default**: `8`
- **Behavior**: For multi‑document outputs (e.g., multiple columns/pages), warns before opening many editors.

### Telemetry

#### `string-le.telemetryEnabled`
- **Type**: boolean
- **Default**: `false`
- **Behavior**: Enables local‑only telemetry logs (no remote data collection). Messages are written to a VS Code Output channel for troubleshooting.

---

## Related commands

- **Open Settings**: `string-le.openSettings` — opens the Settings UI filtered to `string-le.*`.
- **Toggle CSV Streaming**: `string-le.csv.toggleStreaming` — flips `string-le.csv.streamingEnabled` and shows a confirmation message.
- **Post‑process: Dedupe**: `string-le.postProcess.dedupe` — deduplicates the current document or results.
- **Post‑process: Sort**: `string-le.postProcess.sort` — sorts the current document or results based on `sortMode`.

---

## Notes and best practices

- For very large CSVs, consider enabling `csv.streamingEnabled` and keeping `sortEnabled` off to optimize responsiveness.
- Use `openResultsSideBySide` to preserve your current context when inspecting results next to source data.
- Keep safety checks enabled unless you are automating workflows and understand the performance trade‑offs.

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)

