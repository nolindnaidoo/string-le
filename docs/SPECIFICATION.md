# String-LE VS Code Extension - Technical Specification

## Overview

String-LE is a VS Code extension for extracting strings from structured data files. This document defines the architecture, patterns, and implementation details specific to this codebase.

## Design goals and constraints

- Fast, reliable extraction for large files with predictable UX
- Minimal activation; core logic is pure and testable
- Immutable data flows; configuration and results are frozen
- Clear safety model for heavy operations with user choice
- Internationalization by default; accessibility-friendly feedback
- No network access; privacy-first operation

Non-goals:
- Rich transformation language or schema-aware editing (focus is extraction)
- Persisting project state or remote telemetry

## Architecture

See `ARCHITECTURE.md` for visuals (flow, sequence, and dependency diagrams) and component responsibilities.

### Design Patterns

#### Factory Pattern
All major components use factory functions returning frozen interfaces:

```typescript
// Factory functions return immutable interfaces
export function createStatusBar(context: vscode.ExtensionContext): StatusBar
export function createTelemetry(): Telemetry
export function createNotifier(): Notifier

// Interfaces define contracts
export interface StatusBar {
  flash(text: string): void
}
```

#### Dependency Injection
Commands receive dependencies as parameter objects:

```typescript
export function registerAllCommands(
  context: vscode.ExtensionContext,
  deps: Readonly<{
    telemetry: Telemetry
    notifier: Notifier
    statusBar: StatusBar
  }>
): void
```

#### Router Pattern
The extraction engine uses a lookup table for format handlers:

```typescript
const EXTRACTORS: Readonly<Record<string, Extractor>> = Object.freeze({
  json: extractJson,
  yaml: extractYaml,
  csv: extractCsv,
  // ...
})
```

#### Immutable Data
All data structures are frozen to prevent mutation:

```typescript
export type ExtractorOptions = Readonly<{
  onParseError?: (message: string) => void
  csvHasHeader?: boolean
  // ...
}>

// Functions return frozen arrays
export const extractJson: Extractor = (text, options): readonly string[] => {
  // ...
  return Object.freeze(strings)
}
```

## Data model: inputs and outputs

- Inputs: plain text from the active editor. Extractors operate per detected or selected format.
- Outputs: `readonly string[]` representing user-facing strings; order may be transformed by post-processing.
- Fallback mode: for unknown formats, regex-based quoted string capture.

Authoritative behavior is covered by unit/integration tests under `src/extraction/__data__/` and format specs in `src/extraction/formats/*.test.ts`.

## Invariants & Contracts

- All exported factory functions return immutable interfaces (`Object.freeze`).
- All public functions accept and return `readonly` data.
- No network calls. Processing is purely local.
- Errors in parsers never throw to the user; they surface via callbacks/UI and return safe defaults (`Object.freeze([])`).
- `src/extension.ts` contains no business logic beyond registration.

Contract examples:

```ts
export type Extractor = (
  text: string,
  options?: Readonly<ExtractorOptions>
) => readonly string[]

// Must never throw for user input; returns a frozen array.
```

## Configuration policy

### Settings Namespace
All settings use the `string-le.*` namespace:

```typescript
// Read configuration
const cfg = vscode.workspace.getConfiguration('string-le')
const enabled = Boolean(cfg.get('dedupeEnabled', false))

// Return frozen configuration object
export function readConfig(): StringLeConfig {
  // ...
  return Object.freeze({
    dedupeEnabled,
    sortEnabled,
    // ...
  })
}
```

### Stability and deprecations
- All keys live under `string-le.*`. New settings follow existing naming patterns.
- Backwards compatibility: deprecated keys may be supported for at least one minor version with migration notes.
- Validation: numeric settings enforce minimums; booleans default to safe values.

See `CONFIGURATION.md` for the full catalog.

## Localization System

### Manifest Prefix: `manifest.*`
Package.json strings use the `manifest` prefix:

```json
{
  "displayName": "%manifest.ext.name%",
  "description": "%manifest.ext.desc%",
  "commands": [{
    "title": "%manifest.command.extract.title%",
    "category": "%manifest.command.category%"
  }]
}
```

### Runtime Prefix: `runtime.*`
Runtime strings use the `runtime` prefix:

```typescript
const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

// Usage pattern
const message = localize('runtime.error.file-too-large', 'File too large: {0}', fileSize)
const tooltip = localize('runtime.status.tooltip', 'Run String-LE: Extract')
```

### Translation Files
- `package.nls.json` - Base English strings
- `package.nls.{locale}.json` - Translated variants (de, es, fr, etc.)

## Command system

- Naming: all command IDs are prefixed `string-le.*`.
- UX conventions: progressive disclosure; prefer Status Bar for confirmations.
- See `COMMANDS.md` for detailed command semantics and prompts.

## Error model and safety contract

### Parse Errors
Format extractors handle parse errors gracefully:

```typescript
export const extractJson: Extractor = (text, options): readonly string[] => {
  try {
    const parsed = JSON.parse(text)
    return Object.freeze(collectStrings(parsed))
  } catch (err) {
    options?.onParseError?.(`Invalid JSON: ${err.message}`)
    return Object.freeze([] as string[])
  }
}
```

### User Feedback
- **Status Bar Flashing** - Subtle feedback for quick operations
- **Progress Dialogs** - Long-running operations with cancellation
- **Error Prompts** - User-friendly error messages with suggestions

### Error Taxonomy
- Parse errors (format-specific): surfaced when `string-le.showParseErrors` is true
- Safety warnings: file-size, large-output, many-documents
- Operational errors: missing editor, unsupported file type

All categories map to one of: Info, Warning, or Error, governed by `string-le.notificationsLevel`.

### Safety mechanisms
- File size prompt before large reads (default >1MB)
- Output size prompt before opening very large results (default >50k lines)
- Many documents prompt before editor fan-out (default >8 docs)
- Always offer Open/Copy/Cancel; never block without an alternative

## Performance model

### Memory Management
- Avoid caching full document content
- Use streaming for large CSV files (optional)
- Clean up timers and listeners in disposables

### Cancellation Support
- All long-running operations support cancellation tokens
- Use `vscode.window.withProgress` for user feedback

### Immutability Benefits
- Prevents accidental mutations
- Enables safe sharing of data structures
- Functional transformations over mutations

### Budgets & limits
- <50ms for small files (<50KB) common path
- Prefer streaming for CSV > ~5MB
- Avoid opening editors with results >50k lines; prefer Copy

## Testing obligations

### Test Structure
- Use Node.js built-in test runner with tsx for TypeScript
- Test data in `src/extraction/__data__/` with expected outputs
- Coverage reporting with c8

### Test Categories
- **Unit Tests** - Pure functions and extractors
- **Integration Tests** - End-to-end extraction workflows
- **Edge Cases** - Large files, malformed input, missing editors

### Test Data Organization
```
src/extraction/__data__/
├── sample.json + sample.json.expected.txt
├── sample.csv + sample.csv.expected.txt + sample.csv.meta.json
├── invalid.json + invalid.json.expected.txt
└── ...
```

### Invariant Tests
- No extractor throws on malformed input (returns empty, frozen array)
- Sorting/deduping are stable and pure (input unchanged)
- Config reader returns frozen objects with explicit defaults

## Security & privacy (threat model)

### Data Handling
- No data collection or transmission
- Local-only telemetry (Output panel when enabled)
- No filesystem writes unless explicitly requested

### Input Validation
- Validate all user inputs to prevent injection
- Sanitize file paths and user prompts
- Respect VS Code sandboxing policies

### Trust boundaries
- Untrusted/virtual workspaces: functionality is limited per VS Code capabilities
- Inputs are considered adversarial; parsers must not throw and should return safe defaults

## Compatibility, build & deployment

### Compatibility
- VS Code: `^1.70.0`
- Node: `>=18`

Build, scripts, and dependencies are documented in `README.md` and `DEVELOPMENT.md`.

## Extensibility contracts

- Extractors must implement `Extractor` and return frozen arrays; register in the router
- Commands are registered via factories and receive injected dependencies
- UI components consume settings reactively and respect localization rules

See `CONTRIBUTING.md` playbooks for concrete steps.

## Accessibility & localization policy

- All user-facing strings are localized; use `MessageFormat.file`
- Status Bar and notifications must be readable in light/dark themes
- Avoid color-only cues; provide textual descriptions

## Decision log (abridged)

- Factory functions over classes for testability and immutability
- Local-only telemetry instead of remote collection (privacy-first)
- Safety prompts with user choice over silent failure or forced behavior

## Future work

- Optional extractor options per format (e.g., CSV delimiter hints)
- Additional file types based on demand, behind settings flags
- Enhanced large-output handling with background file writes (opt-in)

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
