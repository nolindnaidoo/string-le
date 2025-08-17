# String‑LE Status Bar System

API-style guide for the Status Bar integration providing subtle feedback and quick access to the main command.

## Overview

- Purpose: provide low-noise, always-available entrypoint and progress hints
- Placement: Left alignment, priority 100
- Command: `string-le.extractStrings`

## Public interface

```ts
export interface StatusBar {
	flash(text: string): void
}

export function createStatusBar(context: vscode.ExtensionContext): StatusBar
```

Implementation reference: `src/ui/statusBar.ts`.

## Behavior

- Default text: `$(quote) String-LE`
- Tooltip: localized, e.g., `Run String-LE: Extract`
- Click action: runs `string-le.extractStrings`
- CSV streaming indicator: when `string-le.csv.streamingEnabled` is true, text shows `String-LE (CSV Streaming)`
- `flash(text)`: temporarily sets status text for ~2 seconds, then restores default/streaming label
- Respects `string-le.statusBar.enabled`: hides/shows on change

## Related settings

- `string-le.statusBar.enabled` (default: true)
- `string-le.csv.streamingEnabled` (default: false)

## Event handling

- Subscribes to `workspace.onDidChangeConfiguration` and updates on:
  - `string-le.statusBar.enabled`
  - `string-le.csv.streamingEnabled`
- Disposes timers and Status Bar item via `context.subscriptions`

## Usage patterns

- Prefer `flash('Extracting…')` for short operations instead of notifications
- Pair with Notifier for warnings/errors; keep Status Bar for progress/confirmation

Example:

```ts
statusBar.flash(localize('runtime.status.extracting', 'Extracting…'))
```

## Troubleshooting

- Status Bar not visible: ensure `string-le.statusBar.enabled` is true
- Label not reflecting CSV streaming: toggle `string-le.csv.streamingEnabled` or reload window

## Testing guidance

- Toggle settings at runtime and assert text/visibility updates
- Ensure timers are cleared on deactivate/dispose

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
