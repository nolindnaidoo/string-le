# String‑LE Privacy & Security Guide

## Philosophy

- Privacy‑first by design: no data leaves your machine.
- Minimal data handling: process only what is necessary to fulfill a command.
- Safe defaults: telemetry is off; safety prompts are on.
- Transparency: this document enumerates all relevant data flows and controls.

Non‑goals:
- Remote telemetry or analytics.
- Background data collection or network access.

---

## What data String‑LE handles

String‑LE operates entirely locally within VS Code. Typical data interactions:

- Active editor content: read to extract strings (JSON, YAML, CSV, TOML, INI, .ENV). Not persisted by the extension.
- Configuration values: read from `string-le.*` settings to control behavior.
- Output presentation: open results in an editor and/or copy to the OS clipboard (opt‑in).
- Status and notifications: show localized messages in VS Code UI.

Data sources intentionally not used:

- No network access (HTTP, WebSocket, etc.).
- No filesystem writes beyond opening editors via VS Code APIs.
- No workspace indexing or scanning beyond the active editor content.

---

## Telemetry policy (local‑only)

String‑LE includes an optional, local‑only telemetry mechanism to aid troubleshooting. When enabled, events are written to a VS Code Output channel named “String‑LE”. They are not transmitted over any network.

Key properties:

- Opt‑in: controlled by `string-le.telemetryEnabled` (default `false`).
- Local‑only: messages appear in the Output panel and stay on your machine.
- Minimal content: event name and optional key‑value pairs you supply in code paths; no editor content is logged by the extension.
- Ephemeral: Output channel text is not persisted by the extension and typically does not survive VS Code restarts.

Implementation excerpt:

```ts
export function createTelemetry(): Telemetry {
  const channel = vscode.window.createOutputChannel('String-LE')
  function isEnabled(): boolean {
    return Boolean(vscode.workspace.getConfiguration('string-le').get('telemetryEnabled', false))
  }
  return Object.freeze({
    event(name: string, props?: Record<string, string>): void {
      // Telemetry is local-only (Output panel); never sent over the network
      if (!isEnabled()) return
      const time = new Date().toISOString()
      const kv = props ? ` ${JSON.stringify(props)}` : ''
      channel.appendLine(`[${time}] ${name}${kv}`)
    },
  })
}
```

See also: `src/telemetry/telemetry.ts`.

---

## Network access

- The extension does not perform any network I/O.
- Dependencies used for parsing (e.g., `js-yaml`, `csv-parse`, `toml`, `ini`) run in‑process and do not make network calls.
- Updates occur only through the VS Code Marketplace/extension mechanism you control.

Audit tip: search the codebase for `http`, `https`, `fetch`, `net`, `ws`, or `socket` — none are used.

---

## Clipboard behavior

- `string-le.copyToClipboardEnabled` (default `false`): when enabled, extraction results may be copied to the OS clipboard after processing.
- CSV workflows: clipboard copy is skipped by design when streaming or extracting all columns.
- The clipboard is managed by your operating system; the extension does not read back or transmit clipboard contents.

Risk note: if you share your machine, treat clipboard contents as visible to other local applications/users until overwritten.

---

## Storage & retention

- Persistent storage: none. The extension does not write files or databases.
- Output channel: ephemeral strings shown in the VS Code Output panel when telemetry is enabled; not persisted by the extension.
- Settings: stored by VS Code in your user/workspace settings as usual; the extension only reads them.

---

## Permissions, workspace trust, and virtual workspaces

- Workspace Trust: supported with “limited” capabilities per VS Code guidelines. Extraction uses only the active document text and built‑in APIs.
- Virtual workspaces (e.g., remote or read‑only providers): supported with “limited” behavior; no file system assumptions are made.
- No shell execution, no external tools, and no custom OS permissions requested.

---

## Security practices

- Input validation: all user inputs (prompts, indexes) are validated and sanitized.
- Parser safety: extractors catch parse errors and return safe defaults; they never throw unhandled exceptions to the user.
- Immutability: configuration and outputs are frozen to avoid unintended mutation.
- UI safety rails: large output checks prompt users to Open/Copy/Cancel, protecting the editor from lockups.
- Localization: all user‑visible strings are localizable and use `MessageFormat.file` for predictable placeholder handling.

---

## Threat model (abridged)

In scope:
- Accidental disclosure via network: mitigated by having no network I/O.
- Persistence of sensitive content: mitigated by not writing to disk; Output panel is ephemeral.
- Unsafe code execution: mitigated by no shell commands and pure parsing libraries.

Out of scope:
- OS‑level clipboard sharing or inspection by other local applications.
- Documents already synced by your editor/environment (e.g., remote workspaces, cloud storage configured by you).

---

## Auditing & verification

Recommended checks for maintainers and security‑conscious users:

- Code search: verify absence of network APIs (`fetch`, `http`, `ws`).
- Dependency review: ensure parsing libraries are up to date and do not perform I/O.
- Telemetry inspection: enable `string-le.telemetryEnabled`, run commands, and observe Output panel contents.
- Configuration review: confirm safety settings match your policy (see next section).

---

## Related settings

- `string-le.telemetryEnabled` (boolean, default `false`): enables local‑only telemetry to the Output channel.
- `string-le.copyToClipboardEnabled` (boolean, default `false`): may copy results to the OS clipboard after extraction (non‑CSV workflows by default).
- `string-le.safety.enabled` (boolean, default `true`): master switch for safety prompts.
- `string-le.safety.fileSizeWarnBytes` (number, default `1000000`): warn before processing very large files.
- `string-le.safety.largeOutputLinesThreshold` (number, default `50000`): prompt before opening very large results.
- `string-le.safety.manyDocumentsThreshold` (number, default `8`): prompt before opening many editors.

See `CONFIGURATION.md` for full details.

---

## FAQ

Q: Does String‑LE send any data over the network?
- A: No. There is no network I/O. Telemetry, when enabled, is local‑only.

Q: Are my files written or modified on disk?
- A: No. The extension opens editors to display results; it does not save files unless you explicitly do so in VS Code.

Q: Can I disable all notifications or telemetry?
- A: Yes. Set `string-le.notificationsLevel` to `silent` to suppress notifications; leave `string-le.telemetryEnabled` as `false` (default) to disable telemetry.

Q: What about the clipboard?
- A: Copying is opt‑in. When enabled, results are placed in your OS clipboard. The extension does not read or transmit clipboard contents.

---

## Reporting security or privacy issues

- Open an issue in the GitHub repository with a clear description and reproduction steps.
- For sensitive disclosures, contact the maintainer via GitHub profile email if available.

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
