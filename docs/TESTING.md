# String‑LE Testing

Concise guide to the testing approach, commands, fixtures, and coverage. Mirrors the style of the other docs (Architecture, Commands, Configuration).

## Goals

- Validate extractors as pure, deterministic functions
- Prove resilience on real‑world fixtures (env/ini/toml/yaml/json/csv)
- Keep activation thin; isolate VS Code API usage from core logic
- Maintain high coverage with fast feedback in CI and locally

## Test types

- Unit tests (pure functions)
  - `utils/*` (e.g., `csv.ts`, `text.ts`, `filename.ts`)
  - `extraction/collect.ts` traversal and trimming
  - Format extractors’ error handling branches
- Integration (data‑driven fixtures)
  - `src/extraction/extract.int.test.ts` runs fixtures from `__data__`
  - Normalization in harness: dedupe + `localeCompare` sort
  - Expected outputs stored as `.expected.txt`
- CSV streaming
  - Generator behavior, batching, trimming, header/column options
- Providers/commands smoke
  - Route and registration behavior kept minimal; core logic remains pure

## How to run

### Full test suite

```bash
npm test
```

### Coverage (text + HTML)

```bash
npm run test:coverage
# HTML report: coverage/index.html
```

### Lint (and auto‑fix)

```bash
npm run lint
npm run lint:fix
```

## Fixture layout (integration)

```
src/extraction/__data__/
  .env                     # input
  .env.expected.txt        # expected normalized strings
  sample.ini               # input
  sample.ini.expected.txt  # expected
  sample.toml              # input
  sample.toml.expected.txt # expected
  sample.yaml              # input
  sample.yaml.expected.txt # expected
  sample.json              # input
  sample.json.expected.txt # expected
  sample.csv               # input
  sample.csv.expected.txt  # expected
  sample.csv.meta.json     # optional CSV options (header/column)
```

Conventions:
- One comprehensive sample per format + one `.expected.txt`
- Optional `*.meta.json` for CSV to specify `{ "csvHasHeader": boolean, "csvColumnIndex": number }`
- Expected outputs are the extractor results after normalization:
  - Trim
  - Filter empties
  - Dedupe
  - Locale sort (`a.localeCompare(b)`)

## What extractors include (and ignore)

- Strings: quoted scalars, URLs, IDs/secrets (if string), unicode, JSON‑like text
- Ignored: numbers, booleans, nulls, datetimes (parsed types), unless quoted as strings
- Errors: extractors never throw; they report via `onParseError` and return an empty frozen array

## Test pipeline (integration)

```mermaid
flowchart LR
  A[Fixture file in __data__] --> B[detectTypeFromName]
  B --> C[extractStrings(text, type, options)]
  C --> D[Normalize: trim → filter → dedupe → locale sort]
  D --> E{Expected file exists?}
  E -- Yes --> F[Compare line‑by‑line]
  E -- No  --> G[Prompt to create/update expected]
```

## Updating expected outputs

After editing fixtures, regenerate the expected files using the same normalization as the harness. Two options:

- Run the integration test directly with update mode (when supported locally):

```bash
node --import tsx --test src/extraction/extract.int.test.ts -- --update
```

- Or run a small Node script that imports `extractStrings` and writes normalized outputs. Example snippet:

```js
const { extractStrings } = require('../../src/extraction/extract.ts')
function normalize(values){ const u=[...new Set(values)]; u.sort((a,b)=>a.localeCompare(b)); return u }
```

Keep expected files minimal, stable, and easy to diff.

## Practical tips

- Prefer complex, representative samples over many small ones
- Keep multiline YAML constructs only if they stabilize across parsers; otherwise prefer single‑line variants
- For CSV, pin `csvHasHeader` and `csvColumnIndex` via `*.meta.json` to avoid ambiguity
- When tests fail with ordering diffs, verify locale sorting and trimming match the harness

## CI

GitHub Actions runs lint, tests, and packaging on PRs and pushes. Ensure local runs (`npm ci && npm test`) are green before raising a PR.

## Troubleshooting

- Parse error notifications: enable `string-le.showParseErrors`
- Very large outputs: adjust `string-le.safety.largeOutputLinesThreshold`
- Update expected after fixture edits
- YAML/TOML literal vs folded blocks: prefer quoted single‑line strings if diffs fluctuate

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
