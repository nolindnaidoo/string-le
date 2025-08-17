# String‑LE Notifications System

API-style guide for the notification layer used across commands and UI components.

## Overview

- Purpose: provide concise user feedback while respecting user-configured verbosity.
- Backed by VS Code notifications; titles and messages should be localized by callers.
- Prefer subtle feedback via Status Bar where possible; reserve notifications for actionable info.

## Public interface

```ts
export interface Notifier {
	info(message: string): void
	warn(message: string): void
	error(message: string): void
}

export function createNotifier(): Notifier
```

- Messages should be caller-localized using `vscode-nls` with `MessageFormat.file`.

## Behavior

- Respects `string-le.notificationsLevel` at call time
- Mapping by level:
  - `all`: shows info, warnings, and errors
  - `important`: shows warnings and errors only
  - `silent`: suppresses all notifications

Implementation reference: `src/ui/notifier.ts`.

## Related settings

- `string-le.notificationsLevel`: `"all" | "important" | "silent"` (default: `all`)
- `string-le.showParseErrors`: when true, parse errors from extractors are surfaced via notifications

## Usage patterns

- Informational (short operations): prefer `statusBar.flash()` over `notifier.info()`
- Warnings (large outputs, safety prompts): `notifier.warn(localize(...))`
- Errors (operation failed): `notifier.error(localize(...))`

Example:

```ts
const localize = nls.config({ messageFormat: nls.MessageFormat.file })()
notifier.warn(localize('runtime.warn.large-output', 'Large output; choose Copy to avoid UI lockups'))
```

## Accessibility & UX

- Uses native VS Code notification UI; honors user themes and accessibility settings
- Avoid notification spam: coalesce frequent events via status bar updates

## Troubleshooting

- Seeing too many notifications: set `string-le.notificationsLevel` to `important` or `silent`
- Not seeing errors: ensure level is not `silent`; some errors may be surfaced in the Output channel if telemetry is enabled

## Testing guidance

- Mock notification level via `workspace.getConfiguration('string-le').update('notificationsLevel', 'all')`
- Verify that each method respects the level mapping

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
