# String‑LE Troubleshooting

Structured guide to diagnose and resolve common issues. For full behavior see `SPECIFICATION.md` and `CONFIGURATION.md`.

## Quick mapping (symptom → fix)

- Command missing → open a supported file, ensure workspace trust, reload window
- Keybinding ignored → ensure editor focus, resolve keybinding conflicts
- Parse errors → enable parse error display, validate/format input
- CSV looks wrong → check delimiter/quotes, select correct columns, consider streaming
- “File too large” → increase threshold or proceed after confirmation
- “Output too large” → choose Copy, lower thresholds cautiously, reduce scope
- Results replaced file → enable side-by-side or open-in-new-file
- No clipboard copy → clipboard applies to non-CSV flows only

---

## 1) Activation & Commands

- Commands do not appear
  - Ensure active editor extension is one of: `.json`, `.yaml`, `.yml`, `.csv`, `.toml`, `.ini`, `.env`
  - Reload: run “Developer: Reload Window”
  - Workspace trust: trust the workspace or move to a trusted folder

- Keybinding does nothing
  - Focus must be in a text editor (`when: editorTextFocus`)
  - Check conflicts: “Preferences: Open Keyboard Shortcuts” → search `string-le.extractStrings`

Related settings: none

---

## 2) Parsing & Extraction

- Invalid JSON/YAML/TOML/INI
  - Turn on `string-le.showParseErrors` to see parse messages
  - Format/validate the document with a formatter; fix syntax issues and retry

- CSV extraction looks incorrect
  - Verify delimiter and quotes are consistent in source
  - If prompted, pick the correct column(s) and indicate header presence
  - For large files, enable `string-le.csv.streamingEnabled`

Related settings:
- `string-le.showParseErrors`
- `string-le.csv.streamingEnabled`

---

## 3) Performance & Safety Prompts

- File too large warning
  - Default: `string-le.safety.fileSizeWarnBytes = 1000000`
  - Options: proceed once, or raise the threshold if you understand the trade‑offs

- Output too large warning
  - Default: `string-le.safety.largeOutputLinesThreshold = 50000`
  - Choose Copy instead of Open to avoid UI lockups
  - Reduce data size (narrow columns/pages) or process in smaller parts

- Many documents warning
  - Default: `string-le.safety.manyDocumentsThreshold = 8`
  - Consider consolidating output or copying instead of opening all

Related settings:
- `string-le.safety.enabled`
- `string-le.safety.fileSizeWarnBytes`
- `string-le.safety.largeOutputLinesThreshold`
- `string-le.safety.manyDocumentsThreshold`

---

## 4) UX & Results Placement

- Results replaced the current document
  - Enable `string-le.openResultsSideBySide`

- Post‑processing should open in a new editor
  - Enable `string-le.postProcess.openInNewFile`

- Clipboard copy missing
  - `string-le.copyToClipboardEnabled` applies to non‑CSV flows

Related settings:
- `string-le.openResultsSideBySide`
- `string-le.postProcess.openInNewFile`
- `string-le.copyToClipboardEnabled`

---

## 5) Notifications & Telemetry

- Too many or too few notifications
  - Tune `string-le.notificationsLevel` (`all`, `important`, `silent`)

- Where to find logs
  - Enable `string-le.telemetryEnabled`
  - Open “Output” panel → “String‑LE” channel

Related settings:
- `string-le.notificationsLevel`
- `string-le.telemetryEnabled`

---

## 6) Troubleshooting flow (recommended)

1. Identify file type and validate syntax (formatter/linter)
2. Enable `showParseErrors` and re‑run
3. Check safety prompts; choose Copy for very large outputs
4. Adjust placement settings (`openResultsSideBySide`, `postProcess.openInNewFile`)
5. For CSV, confirm columns/headers and consider streaming
6. If issues persist, capture diagnostics and file an issue

Diagnostics to include:
- File type and a minimal sample input
- Expected vs actual output snippet
- Current settings (from `CONFIGURATION.md` keys)
- Log excerpts from the Output panel (when telemetry is enabled)

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
