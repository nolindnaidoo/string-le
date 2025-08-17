# Contributing

This project targets a 1.0 production‑ready, enterprise‑grade bar. Contributions should maintain strong test coverage, immutability, and strict TypeScript.

[Issues](https://github.com/nolindnaidoo/string-le/issues)
[Pull Requests](https://github.com/nolindnaidoo/string-le/pulls).

- For larger changes, please open an issue first.
- Follow the code quality guidelines below.
- Add tests for new behavior and keep logic decoupled from VS Code APIs where possible.
- Keep `extension.ts` lean; put logic in commands/utilities.

## TL;DR for Contributors
- Prereqs: Node.js 18+, VS Code 1.70+
- Install deps: `npm ci`
- Run tests + lint: `npm test && npm run lint`
- Launch extension host: Press F5 ("Launch Extension")
- Build once: `npm run build` (runs on publish)
- Watch type‑check: `npm run watch`
- Package/publish (maintainers): `npm run package` / `npm run publish`

See also: `DEVELOPMENT.md` for a step-by-step dev guide.

## Scripts you’ll use
```bash
npm run clean          # remove dist/ and coverage/
npm run build          # tsc build (also runs on vscode:prepublish)
npm run watch          # tsc --watch for local dev
npm test               # Node test runner via tsx
npm run test:coverage  # c8 coverage report
npm run lint           # biome check
npm run lint:fix       # biome check --apply
npm run package        # vsce package -> vsix/
npm run publish        # vsce publish (maintainers)
```

## Project layout
```
src/
  commands/        # extension commands (extract, sort, dedupe, toggle CSV streaming)
  config/          # settings model (frozen), file type helpers
  extraction/      # format parsers and extraction orchestration (+ tests, fixtures)
  providers/       # code actions
  telemetry/       # local‑only telemetry plumbing
  ui/              # prompts, notifications, status bar, webview
  utils/           # csv/text/filename helpers (+ tests)
```
Keep `src/extension.ts` minimal: activation + command/provider registration only.

## Architecture in 60 seconds
- Activation is thin; commands do the work.
- Core logic is pure/functional and separate from the VS Code API surface.
- Config is read via `vscode.workspace.getConfiguration('string-le')`, validated, then returned frozen (`Object.freeze`) with `readonly` types. See `src/config/config.ts`.
- Extraction pipeline:
  1. Determine file type (auto for `.env*`, else prompt)
  2. Parse and collect strings per format (`src/extraction/formats/*`)
  3. Optional post‑processing: dedupe, sort
  4. Output handling: open editor (optionally side‑by‑side) and/or clipboard
- CSV supports column selection (index/header), multi‑column fan‑out, and optional streaming for large inputs.

Key entry points:
- Activation: `src/extension.ts`
- Command registration: `src/commands/index.ts`
- Extract command: `src/commands/extract.ts`
- Extractors map + routing: `src/extraction/extract.ts`

Additional docs: `SPECIFICATION.md`, `COMMANDS.md`, `CONFIGURATION.md`.

## Commands (IDs)
- `string-le.extractStrings` — main extraction entrypoint
- `string-le.postProcess.dedupe` — deduplicate current document
- `string-le.postProcess.sort` — sort current document
- `string-le.csv.toggleStreaming` — toggle CSV streaming mode
- `string-le.openSettings` — open String‑LE settings
- `string-le.help` — open troubleshooting

## Configuration surface
Declared in `package.json > contributes.configuration` and localized in `package.nls*.json`. Frequently used:
- `string-le.openResultsSideBySide` (boolean)
- `string-le.postProcess.openInNewFile` (boolean)
- `string-le.dedupeEnabled` (boolean)
- `string-le.sortEnabled` (boolean), `string-le.sortMode` (enum)
- `string-le.copyToClipboardEnabled` (boolean, non‑CSV only)
- `string-le.csv.streamingEnabled` (boolean)
- Safety: `string-le.safety.enabled`, `*.fileSizeWarnBytes`, `*.largeOutputLinesThreshold`, `*.manyDocumentsThreshold`
- UX: `string-le.notificationsLevel`, `string-le.statusBar.enabled`
- Telemetry (local‑only): `string-le.telemetryEnabled`

Frozen config and validators live in `src/config/config.ts`.

## Playbooks (common changes)
### Add a new format extractor
1. Create `src/extraction/formats/<name>.ts` exporting `extract<Name>()` with signature `Extractor`.
2. Register it in `src/extraction/extract.ts` by extending `EXTRACTORS` and supported extensions.
3. If needed, add the extension to `src/config/fileTypes.ts` (`SupportedFileType`).
4. Add tests in `src/extraction/formats/<name>.test.ts` and fixtures under `src/extraction/__data__/`.
5. Consider settings and UX prompts if the format needs options.

### Add a command
1. Create `src/commands/<command>.ts` with a `register<Command>Command()` factory.
2. Wire it in `src/commands/index.ts` and `src/extension.ts` if needed.
3. Declare the command in `package.json > contributes.commands` (localize title in `package.nls.json`).
4. Add a keybinding/menu entry if appropriate.

### Add configuration
1. Add the property to `package.json > contributes.configuration` (with `enumDescriptions` if enum).
2. Localize description strings in `package.nls.json`.
3. Read/validate in `src/config/config.ts` and expose via the frozen config object.
4. Consume in command logic or UI modules.

### Update prompts/UX
Edit `src/ui/*` (prompts, notifications, status bar, large output flows). Keep notifications minimal; prefer status bar updates.

## Development & Testing

- Follow `DEVELOPMENT.md` to run, debug, and package the extension.
- Troubleshoot common issues with `TROUBLESHOOTING.md`.

## Testing & debugging
- Run tests: `npm test`
- Coverage: `npm run test:coverage` (outputs text + HTML)
- Lint: `npm run lint` (Biome)
- Debug: open folder in VS Code and press F5 ("Launch Extension").
- Test data lives under `src/extraction/__data__/` with `.expected.txt` outputs.

## Code quality & style
- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Functional programming, pure functions, factory functions over classes.
- Immutability via `readonly` types and `Object.freeze()`; freeze exports to signal immutability.
- Keep `src/extension.ts` minimal; register via factories and inject dependencies.
- Centralize types in `src/types.ts`.
- Prefer early returns and small, testable functions.

## Localization
- Manifest strings: `package.nls.json` (+ `package.nls.{locale}.json` files).
- Runtime strings: `vscode-nls` with `MessageFormat.file` per module.
  - Pattern: `const localize = nls.config({ messageFormat: nls.MessageFormat.file })()`.
  - Keys: `runtime.*` for runtime; `manifest.*` for package contributions.

## Security & privacy
- All processing is local; the extension makes no network calls.
- Telemetry is local‑only (Output channel) and opt‑in.
- Validate all user inputs and file operations.
- Support workspace trust and virtual workspaces (see `package.json > capabilities`).

## Release & packaging (maintainers)
- `npm run build` runs on `vscode:prepublish`.
- Package a VSIX: `npm run package` → `vsix/`.
- Publish to Marketplace: `npm run publish`.
- Tag releases and update `CHANGELOG.md`.

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)
**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)
**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
