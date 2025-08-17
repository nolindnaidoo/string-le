# String‑LE Development Guide

This guide helps you set up a local dev environment, run and debug the extension, and contribute with confidence. It complements `CONTRIBUTING.md` and the deeper `SPECIFICATION.md`.

## Prerequisites

- Node.js 18+
- VS Code 1.70+
- Git

## Setup

```bash
git clone https://github.com/nolindnaidoo/string-le.git
cd string-le
npm ci
```

## Everyday commands

```bash
npm test               # run tests (Node test runner via tsx)
npm run test:coverage  # coverage (text + HTML)
npm run lint           # Biome check
npm run lint:fix       # Biome auto-fix
npm run build          # type-check + compile to dist/
npm run watch          # tsc --watch
```

## Run & debug

1. Open the folder in VS Code
2. Press F5 (Run and Debug → “Launch Extension”)
3. A new Extension Development Host opens with String‑LE installed

Tips:
- Set breakpoints across `src/**` and use the Debug Console
- Use the Status Bar entry and Command inside the dev host

## Project structure (overview)

```
src/
  extension.ts     # activation: register commands/providers only
  commands/        # extract, dedupe, sort, toggle CSV streaming
  extraction/      # format parsers and extraction orchestration
  config/          # frozen settings model and file type helpers
  ui/              # prompts, notifications, status bar, webview
  providers/       # VS Code providers (code actions)
  telemetry/       # local-only logging
  utils/           # pure helpers (csv/text/filename)
```

See `SPECIFICATION.md` for architecture details.

## Code style and patterns

- Functional programming; prefer factory functions over classes
- Strict TypeScript with `readonly` types and `Object.freeze()`
- Keep `src/extension.ts` minimal; inject dependencies via factories
- Centralize types in `src/types.ts`

Refer to `CONTRIBUTING.md` for style rules and playbooks.

## Testing

- Unit tests live next to source (e.g., `src/utils/*.test.ts`)
- Integration tests under `src/extraction` and fixtures in `src/extraction/__data__/`
- Aim for high coverage (see README badge); add edge cases for malformed input and large files

Running specific tests:

```bash
node --import tsx --test src/utils/text.test.ts
```

## Localization workflow

- Manifest strings: `package.nls.json` (+ `src/i18n/package.nls.{locale}.json`)
- Runtime strings: `vscode-nls` with `MessageFormat.file`
- Pattern per module:

```ts
const localize = nls.config({ messageFormat: nls.MessageFormat.file })()
```

## Performance tips (dev)

- For huge CSVs, enable `string-le.csv.streamingEnabled`
- Keep `string-le.sortEnabled` off during large runs for speed
- Safety thresholds live under `string-le.safety.*`; keep them enabled

## Packaging (maintainers)

```bash
npm run package   # creates .vsix in dist/
npm run publish   # publishes to Marketplace
```

Ensure `CHANGELOG.md` is updated and `vscode:prepublish` passes.

## Troubleshooting (quick)

- Commands missing? Ensure file type is supported and the workspace is trusted
- Parse errors? Toggle `string-le.showParseErrors` and check input format
- Output too large prompt? Choose Copy or adjust `string-le.safety.*`

See `TROUBLESHOOTING.md` for detailed guidance.


---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
