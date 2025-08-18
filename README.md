<p align="center">
  <img src="src/assets/images/icon.png" alt="String-LE Logo" width="96" height="96"/>
</p>
<h1 align="center">String-LE: Zero Hassle Extraction</h1>
<p align="center">
  <b>Instantly extract every user-visible string in VSCode</b><br/>
  <i>JSON YAML CSV TOML INI ENV</i>
</p>

<p align="center">
  <!-- Marketplace -->
  <a href="https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.string-le">
    <img src="https://img.shields.io/visual-studio-marketplace/v/nolindnaidoo.string-le" alt="VSCode Marketplace Version" />
  </a>
  <!-- Build -->
  <a href="https://github.com/nolindnaidoo/string-le/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/nolindnaidoo/string-le/ci.yml?branch=main" alt="Build Status" />
  </a>
  <!-- License -->
  <a href="https://github.com/nolindnaidoo/string-le/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/nolindnaidoo/string-le" alt="MIT License" />
  </a>
</p>

---

<p>
  <img src="src/assets/images/preview.gif" alt="CSV Streaming (Editor) animation" style="max-width: 100%; height: auto;" />
</p>

<p align="right">
 <a href="https://github.com/nolindnaidoo/string-le/blob/main/docs/SCREENSHOTS.md">Screenshot Guide</a>
</p>

## ✅ Why String‑LE

- **FullStack i18n**: Extract and dedupe locale strings (`en.json`, `fr.json`, etc.).
- **APIs**: Catalog response and validation messages from JSON, YAML, `.env`, and config files.
- **Configs/Specs**: Flatten text in YAML, TOML, INI, and OpenAPI specs for fast, confident edits.
- **CSVs**: Stream huge files, pick columns, and avoid UI lockups.

## 🚀 Quick Start

1. **Install** from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.string-le)
2. **Open** any supported file type `Cmd/Ctrl + P String-LE`
3. **Quick Extract** with `Cmd+Alt+E`/`Ctrl+Alt+E`/`StatusBar`

## ⚡ Performance

String‑LE is built for speed across all supported formats:

| Format   | Throughput      | Best For               |
| -------- | --------------- | ---------------------- |
| **ENV**  | 4M+ lines/sec   | Environment configs    |
| **JSON** | 1.8M+ lines/sec | APIs, large datasets   |
| **INI**  | 1.3M+ lines/sec | Configuration files    |
| **TOML** | 530K+ lines/sec | Modern configs         |
| **CSV**  | 440K+ lines/sec | Tabular data           |
| **YAML** | 190K+ lines/sec | Human-readable configs |

See `PERFORMANCE.md` for detailed benchmarks and optimization guidelines.

## 📊 Test Coverage

- 100% unit coverage on pure extraction and transforms
- Contract tests for configuration side‑effects and parse‑error handling
- Data‑driven fixtures with golden expected outputs per format
- CSV streaming paths covered (batching, header/column selection)
- Stable locale sorting and dedupe normalization in harness

See `TESTING.md`

![Test Coverage Report](src/assets/images/coverage-report-text.png)

<details>
  <summary><strong>👉 Expand Detailed Documentation</strong></summary>

## 🛠 Configuration

- `string-le.openResultsSideBySide` – Open to the side
- `string-le.csv.streamingEnabled` – Toggle CSV streaming
- `string-le.dedupeEnabled` – Auto-dedupe strings
- `string-le.sortEnabled` – Auto-sort output
- **Safety Guards** – File size warnings & thresholds
- **Notification Levels** – Control verbosity and alerts

#### ⚠️ Behaviors & limits

- CSV support assumes standard delimiter/quoting; unusual dialects not supported
- Large outputs can be slow to open — use **Copy** when prompted
- Streaming applies only to CSV; other formats load in memory
- Multi-line strings (e.g., YAML block scalars) are only partially supported
- CSV multi-line and all-column extracts stream to the editor only (no auto-copy)
- Sorting and deduplication apply to final strings, not their original positions
- Fallback mode uses quoted-string heuristics and may include false positives

See `CONFIGURATION.md`

## 🌍 Language Support

#### English + 12 translations

- Chinese (Simplified), Spanish, French, Russian, Portuguese (Brazil)
- Japanese, Korean, German, Italian, Vietnamese, Ukrainian, Indonesian

See `I18N.md`

## 🔒 Privacy & Telemetry

This extension runs entirely locally and never sends data off your machine
Optional, local-only logs can be enabled via `string-le.telemetryEnabled`
To help troubleshoot (Output panel → “String-LE”)

See `PRIVACY.md`

## 🤝 Contributing

We welcome all contributions! Whether it's code, ideas, or feedback

- <strong>Project</strong>: [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases)
- <strong>Dev</strong>: [Spec](https://github.com/nolindnaidoo/string-le/blob/main/docs/SPECIFICATION.md) • [Architecture](https://github.com/nolindnaidoo/string-le/blob/main/docs/ARCHITECTURE.md) • [Development](https://github.com/nolindnaidoo/string-le/blob/main/docs/DEVELOPMENT.md) • [Contributing](https://github.com/nolindnaidoo/string-le/blob/main/CONTRIBUTING.md) • [Troubleshooting](https://github.com/nolindnaidoo/string-le/blob/main/docs/TROUBLESHOOTING.md)
- <strong>Docs</strong>: [Commands](https://github.com/nolindnaidoo/string-le/blob/main/docs/COMMANDS.md) • [Notifications](https://github.com/nolindnaidoo/string-le/blob/main/docs/NOTIFICATIONS.md) • [Status Bar](https://github.com/nolindnaidoo/string-le/blob/main/docs/STATUSBAR.md) • [Config](https://github.com/nolindnaidoo/string-le/blob/main/docs/CONFIGURATION.md) • [Performance](https://github.com/nolindnaidoo/string-le/blob/main/docs/PERFORMANCE.md) • [I18N](https://github.com/nolindnaidoo/string-le/blob/main/docs/I18N.md) • [Privacy](https://github.com/nolindnaidoo/string-le/blob/main/docs/PRIVACY.md) • [Screenshots](https://github.com/nolindnaidoo/string-le/blob/main/docs/SCREENSHOTS.md) • [Workflow](https://github.com/nolindnaidoo/string-le/blob/main/docs/WORKFLOW.md)

See `CONTRIBUTING.md`

</details></br>

Copyright © 2025 [@nolindnaidoo](https://github.com/nolindnaidoo), All rights reserved.
