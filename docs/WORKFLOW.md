# String‑LE Workflow Guide

Practical workflows that turn common pain points into fast, repeatable actions.

## Why this exists (real‑world pain points)

### Frontend frameworks (React/Next.js, Vue/Nuxt, SvelteKit, Angular) + i18n
- You need to update locale files like `en.json`, `fr.json`, `de.json` across frameworks (`react-intl`, `next-intl`, `vue-i18n`, `@ngx-translate`, `svelte-i18n`).
- Pain: hunting scattered user‑visible strings, normalizing duplicates, and keeping keys consistent.
- Relief: open your locale/source files, extract strings, dedupe/sort, and compare side‑by‑side to quickly reconcile translations.

### API frameworks (Next.js API routes, Express/NestJS, FastAPI/Django, Rails)
- You want a catalog of response messages, validation errors, and system prompts.
- Pain: messages live across handlers, schemas, and middleware; manual grepping is noisy.
- Relief: extract from JSON/YAML (e.g., error catalogs, message maps), `.env`, and config files; produce clean lists for review and consistency checks.

### Config sprawl in YAML/TOML/INI (including OpenAPI/Swagger)
- You’re auditing feature flags, human‑readable messages, or API descriptions in YAML/TOML/INI/OpenAPI specs.
- Pain: nested structures and long specs make it easy to miss text.
- Relief: extract each file in seconds, open side‑by‑side, and scan a clean, deduped list for edits.

### Large CSVs for content ops
- You’re reviewing dozens/hundreds of CSV columns of copy.
- Pain: opening huge files locks the UI; copy/paste across columns is error‑prone.
- Relief: stream CSV extraction into the editor, pick columns, and avoid UI lockups by copying when prompted for large outputs.

---

## Core workflows

### 1) Quick extract & review (any supported file)
1. Open a supported file (`JSON`, `YAML`, `CSV`, `TOML`, `INI`, `.ENV`).
2. Run `String‑LE: Extract` (Cmd/Ctrl+Alt+E or Status Bar).
3. If prompted for large output, choose Open or Copy.
4. Optionally run Dedupe/Sort to tidy results.

Best for: first‑pass audits, content reviews, and quick diffing against expected strings.

### 2) Side‑by‑side comparison
1. Enable `string-le.openResultsSideBySide = true`.
2. Run Extract to open results next to the source file.
3. Review and apply updates to source/config with minimal context switching.

Best for: updating i18n files, reconciling config text, and safe batch edits.

### 3) Clipboard‑first handoff
1. Keep `openResultsSideBySide = false` and `copyToClipboardEnabled = true` (non‑CSV).
2. Run Extract; results go straight to clipboard.
3. Paste into spreadsheets, issue trackers, or handoff docs.

Best for: localization handoff, QA checklists, or copy review documents.

### 4) Dedupe & sort for stability
1. After extraction, run `String‑LE: Sort` and/or `String‑LE: Dedupe`.
2. Choose a sort mode (alpha or length) to stabilize diffs.

Best for: eliminating noise, producing stable lists for reviewers and translators.

### 5) CSV streaming for huge files
1. Toggle `string-le.csv.streamingEnabled = true` (or run the toggle command).
2. Extract from CSV; pick columns or use all columns.
3. Results append in batches to avoid locking the UI.

Best for: very large CSVs where opening all results at once isn’t practical.

### 6) Safety prompts to protect your editor
1. Keep `string-le.safety.enabled = true`.
2. When warned about file size or output size, choose Copy to avoid UI lockups.

Best for: keeping your workflow responsive on large inputs or outputs.

---

## Project recipes

### Next.js/React i18n JSON update
1. Open `en.json` (or target locale file) and run Extract.
2. Dedupe/Sort to stabilize content.
3. Open target translation file side‑by‑side; copy or fill missing keys/values.
4. Repeat for other locale files as needed.

Tips: keep keys consistent; use sort to make diffs predictable for code reviews.

### Vue/Nuxt i18n update
1. Open your `*.json` or `*.yaml` locale file and run Extract.
2. Dedupe/Sort to group and stabilize.
3. Compare against other locales side‑by‑side and fill gaps.

### SvelteKit/Angular i18n update
1. Extract from locale sources (`.json` for `svelte-i18n` or `@ngx-translate`).
2. Dedupe/Sort and copy into the target locale.

### Translation handoff pack
1. Extract from source data files (JSON/YAML/TOML/INI) and Copy results.
2. Paste into a spreadsheet with columns for locale owners.
3. Track status per row; use dedupe to reduce duplicated effort.

### Config/OpenAPI audit across formats
1. Extract from each config file and open side‑by‑side.
2. Scan for outdated flags/messages; update source config accordingly.
3. Commit with stable diff thanks to sorting.

### API response/error catalog (Express/NestJS/FastAPI/Django/Rails)
1. Extract from message maps (JSON/YAML), validation schema messages, and `.env`.
2. Dedupe/Sort for a canonical list.
3. Share with the team to unify phrasing and avoid drift.

### CSV copy review
1. Enable CSV streaming if the file is large.
2. Extract specific columns (headings, descriptions) for focused review.
3. Choose Copy when prompted to avoid opening massive editors.

---

## Tips
- Use the Status Bar entry for a one‑click extract and subtle progress.
- Set `notificationsLevel` to `important` to reduce noise during bulk work.
- Keep safety prompts enabled; prefer Copy for very large outputs.
- Sort by length when scanning for outliers (very short/long strings).

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
