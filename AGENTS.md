# AGENTS.md — Strings-LE

Technical source of truth for this repo. README.md is the user-facing doc; this file is for anyone (human or agent) changing the code.

## What this is

A VS Code extension that extracts string values from the active document (JSON, YAML, CSV, TOML, INI, dotenv — anything else falls back to a quoted-string scan) into a results editor, with dedupe/sort post-processing and a streaming mode for large CSVs. No network access, no filesystem writes.

## Architecture

```
extension.ts            activate(): create telemetry/notifier/statusBar -> registerAllCommands()
commands/               one file per command; deps injected as a frozen bag
                        (extract, dedupe, sort, toggleCsvStreaming, help;
                        postProcessHelper shares new-file-vs-in-place output)
extraction/extract.ts   dispatcher: fileType -> extractor (unknown -> fallback)
extraction/collect.ts   THE shared value-collection heuristics for parsed formats
extraction/formats/*.ts one extractor per format:
                        json (JSON.parse), yaml (js-yaml loadAll),
                        toml (@iarna/toml), ini (ini), csv (csv-parse,
                        + streamCsvStrings + readCsvHeader), dotenv
                        (line-based), fallback (quoted-string regex)
ui/                     notifier (window messages, gated by notificationsLevel:
                        all -> everything, important -> warn+error, silent -> error only;
                        error/warn text sanitized), statusBar, prompts
                        (file-type picker, CSV column selection), largeOutput dialogs
providers/codeActions   "Extract strings" quick fix for supported languages
config/config.ts        readConfig() snapshot; CONFIG_DEFAULTS table
utils/                  errors (sanitizeErrorMessage), filename (.env detection), text (dedupe/sort)
types.ts                shared types only — no logic
```

Conventions: factory functions + `Object.freeze` (no classes), early returns, dependency bags typed inline at the consumer. Runtime strings are plain English; the 13 `package.nls*.json` catalogues localize **manifest** strings only (VS Code `%key%` substitution — do not add a runtime i18n layer without wiring real bundles).

## Invariants (things that were once broken — keep them true)

- **The bundle must be self-contained.** The VSIX ships `dist/extension.js` only; `scripts/check-bundle.js` (run in `vscode:prepublish` and CI) does a static require scan AND loads the bundle with `vscode` stubbed. esbuild uses `--main-fields=module,main` to defeat UMD wrappers that smuggle `require` through factory parameters.
- **`CONFIG_DEFAULTS` must equal package.json defaults.** `config.test.ts` asserts parity over every declared setting; add new settings to both plus the KEY_MAP in the test.
- **Every declared setting must have a consumer.** v1 shipped 12 no-op settings (`performance.*`, `keyboard.*`, `presets.*`); don't add a setting without wiring it.
- **Extractor behavior is pinned by golden snapshots** (`extraction/characterization.test.ts` + `__fixtures__/`). Any output change must update goldens in the same commit and be listed in the CHANGELOG.
- **Claimed formats get real parsers.** v1 claimed YAML/TOML/INI but routed them to the quoted-string fallback, silently missing unquoted values. If a format is in the README table, it must have a real extractor in `extraction/formats/`.
- **CSV is parsed by csv-parse everywhere.** Column pickers and fan-out counting go through `readCsvHeader()` (same parser and options as extraction); never re-implement CSV line splitting.
- **Errors are never suppressed.** `notificationsLevel` gates info/warnings only; `notifier.error` always shows (and sanitizes).
- **nls catalogues stay in key-parity:** all 12 locale files carry exactly the keys of `package.nls.json`.

## Toolchain

- **Build:** esbuild bundle (`bun run build`, `build:prod` minified). `tsc` is typecheck-only (`noEmit`) and covers test files.
- **Unit tests:** vitest; `vscode` aliased to `src/__mocks__/vscode.ts` (stateful mock with `_reset/_set` helpers). Coverage thresholds enforced: 80 lines / 80 funcs / 75 branches / 80 stmts.
- **Integration tests:** `bun run test:integration` — `@vscode/test-cli` launches a real VS Code (config in `.vscode-test.mjs`, tests compiled via `tsconfig.it.json` to `out-test/`).
- **Lint/format:** Biome (tabs, single quotes). `__fixtures__`/`__snapshots__` are exempt — formatting fixtures would corrupt goldens.
- **Packaging:** `bun run package` → `release/*.vsix`. `.vscodeignore` is an allow-list; the VSIX is ~21 files.

## Release

1. Bump `version` in package.json, add a CHANGELOG entry.
2. CI green on all 3 OSes (includes packaging + integration tests).
3. `Release` workflow (manual dispatch) publishes to the VS Code Marketplace (`VSCE_PAT`) and Open VSX (`OVSX_PAT`) — Open VSX is what Cursor/VSCodium users install from. Locally: `bun run package` then `vsce publish` / `ovsx publish`.

## Known limitations (documented, not bugs)

- The fallback scan (unknown file types) only finds single-line quoted strings; unquoted and multi-line strings are invisible to it.
- INI and .env are untyped formats: numeric-looking values are extracted as strings. Typed formats (JSON/YAML/TOML) drop numbers, booleans, and dates.
- Streaming CSV mode disables deduplication (results never accumulate in memory) and never auto-copies to the clipboard.
- Extraction order is parser traversal order (document order for all current formats); dedupe/sort operate on the flat result lines, not source positions.
