<h1 align="center">string-le</h1>

<p align="center">
  <b>Get every string in a codebase out where a person can read them</b><br/>
  <i>for the reviewer who does not have the editor open</i>
</p>

<p align="center">
  <a href="https://crates.io/crates/string-le">
    <img src="https://img.shields.io/crates/v/string-le.svg" alt="string-le on crates.io" />
  </a>
  <a href="https://crates.io/crates/string-le">
    <img src="https://img.shields.io/crates/d/string-le.svg" alt="crates.io downloads" />
  </a>
  <a href="https://github.com/nolindnaidoo/string-le/actions/workflows/ci-crate.yml">
    <img src="https://github.com/nolindnaidoo/string-le/actions/workflows/ci-crate.yml/badge.svg" alt="Build Status" />
  </a>
  <img src="https://img.shields.io/badge/rustc-1.88+-93450a.svg" alt="MSRV: Rust 1.88+" />
  <a href="https://github.com/nolindnaidoo/string-le/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
  </a>
  <a href="https://letools.dev/tools/string-le">
    <img src="https://img.shields.io/badge/web-letools.dev-00A0FF.svg" alt="letools.dev" />
  </a>
</p>

> **Useful?** A star is how other developers find it —
> [★ GitHub](https://github.com/nolindnaidoo/string-le) ·
> [letools.dev/tools/string-le](https://letools.dev/tools/string-le)

Someone has to read every user-visible string before a release. A QA lead
checking the messages. A compliance reviewer looking for a claim the
product is not allowed to make. A localisation owner finding what never
reached a catalog. None of them has the editor open, and several of them
cannot be handed a checkout at all.

`string-le .` puts every string in the repository into one file they can
read.

```bash
string-le --values --dedupe src/ > strings.txt
```

## Sixty seconds

```bash
string-le .                      # every string in the tree, as JSON
string-le --values src/          # just the values, one per line
string-le --dedupe --values .    # each distinct string once
cat config.toml | string-le --stdin --format toml

# the point of the whole thing:
string-le --values --dedupe src/ | sort > after.txt
diff before.txt after.txt        # what changed in the copy this release
```

```
./config.json:2:14  Settings
./src/messages.ts:2:12  Delete this permanently?
./src/messages.ts:3:11  Never mind
3 strings in 3 files
```

**Exit codes follow grep** — `0` strings found, `1` none found, `2` the
question was malformed. Finding none is an answer, not an error.

## Install

| Route | Command | Worth knowing |
|---|---|---|
| **cargo** | `cargo install string-le` | Any platform, needs **Rust 1.88+**. |
| **From source** | `git clone https://github.com/nolindnaidoo/string-le`<br>`cd string-le/crate && cargo build --release` | The same build CI runs. |

No runtime, no network, nothing written.

## Source files are the main event

Six formats are parsed — **JSON, YAML, CSV, TOML, INI and dotenv**. Ten
source languages are read by their own literal syntax — **Python, Rust,
Go, shell, PHP, Ruby, Perl, C#, JavaScript, TypeScript**. Anything else
falls back to quoted runs: single, double or backtick.

That matters because a quoted-run pattern reads every source file
through a JavaScript-shaped lens, and on real code the lens is wrong:

| input | quoted runs | its own language |
|---|---|---|
| a Python docstring | missed entirely | one value |
| Rust `r#"a raw "quoted" string"#` | `a raw`, `string` | one value, quotes intact |
| a Go backtick string | missed entirely | one value |
| a shell heredoc | missed entirely | one value |
| a C# verbatim string | three fragments | one value |

The fallback is still not a consolation prize: **an unrecognised format
is a normal, useful answer**, which is why it is not an error, and
`--format fallback` asks for it deliberately.

The trade is honest: unquoted prose yields nothing. Point this at a
README and you get nothing back, correctly.

## What it reads, and what it drops

One rule, applied to every parsed format:

- **keys are never extracted**, only values
- non-string primitives are dropped — in a typed format a bare `42` is a
  number and a TOML date is a date
- **the untyped formats are the exception**: INI and `.env` have no types,
  so `PORT=8080` yields the string `8080`
- values are trimmed; empty ones are dropped
- duplicates are kept, in document order. `--dedupe` is opt-in, because a
  string that appears forty times is a different finding from one that
  appears once, and which of those matters is your call

A directory is walked the way ripgrep walks one: `.gitignore` honoured,
hidden files skipped, `--no-ignore` and `--hidden` to reach the rest. A
file named explicitly is always read.

## Positions, and where they stop

Each value is reported with its file and, where it can be found in the
source, a 1-based line and column in **UTF-16 units** — the number your
editor shows.

**JSON is placed by its parser; everything else by a forward search over
the source.** Where a parser hands back real ranges they win, so a JSON
value is always located even when its escapes mean it appears nowhere
literally.

**The rest can miss, and the report says how many.** A parser resolves
escapes and folds scalars, so a YAML block scalar and a CSV cell with an
escaped quote are correct values that never appear literally in the file.
Those get no position and `summary.unlocated` counts them. Reporting a
nearby guess would be worse than reporting nothing; a count you can see
is the difference between a limitation and a lie.

## Where it goes further than the extension

**`--multiline`.** JavaScript's `.` does not match a newline, so the
quoted-run pattern cannot span lines. The flag belongs to the *fallback*:
a Python docstring, a Go raw string, a heredoc and a template literal
span lines because their languages say so and need no flag at all. What
is left is a multi-line run in a format nothing here parses — an email
body, a help paragraph, a consent notice — the copy an audit least wants
to miss.

It is off by default, so the default answer is the extension's answer,
and the shared corpus keeps the two honest.

**Binary files are skipped, and counted.** A NUL byte in the first 8KB
means binary — ripgrep's heuristic. Those files get no report line and
cannot fail `--strict`; the summary says how many, so the walk reaching
more files than the reader got is stated rather than left to be noticed.
A file that *is* text and still could not be read keeps its named
`skipped` diagnostic and still fails `--strict`.

## It has no opinions

No spell check. No banned-word list. No reading-level score. No guess at
which strings are "user-facing".

Which strings matter is the reviewer's call, and a tool that pre-filtered
would decide the audit before the auditor saw it. What you do with the
list — grep it, diff it against last release, feed it to a translation
memory, hand it to legal — is the part this deliberately stays out of. A
contract test asserts no flag asks for a judgment.

## Options

```
--dedupe             collapse repeated values to their first occurrence
--format <format>    force a format instead of inferring from the name;
                     an unknown name falls back rather than failing
--values             print only the values, one per line, for piping
--multiline          let a *fallback* quoted run span lines; a language
                     whose own syntax spans lines needs no flag
--csv-header         skip the first CSV row
--csv-column <n>     take only this 0-based CSV column
--stdin              read one document from stdin
--hidden             walk hidden files and directories too
--no-ignore          walk files that .gitignore excludes
```

## As an MCP server

```bash
string-le mcp
```

Two tools, both returning `{ ok, data, diagnostics, meta }`:

- **`extract_strings`** — content in, values out, **no positions**.
  Touches no filesystem. The npm server ships the same tool with
  byte-identical output; one corpus runs against both.
- **`string_le_scan`** — files or directories in, the same reports the
  CLI writes, positions included.

`ok` means the scan ran, never that it found something. A file with no
strings is a result, not an error.

## The other four ways to run it

| Where | What you get | Install |
|---|---|---|
| **VS Code** | The same extraction, in your editor, on a keystroke | [Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.string-le) |
| **Cursor, VSCodium, Windsurf** | The same extension | [Open VSX](https://open-vsx.org/extension/OffensiveEdge/string-le) |
| **Any MCP agent, via Node** | `extract_strings` over stdio | `npx string-le-mcp` · [npm](https://www.npmjs.com/package/string-le-mcp) |
| **Zed** | The MCP server as a context server | [add it by hand](https://zed.dev/docs/ai/mcp) *(no listing yet)* |

All sixteen LE tools are on **[letools.dev](https://letools.dev)**.

## More from the LE family

Sixteen single-purpose tools for the work in front of every model. Each ships
a Rust CLI and an MCP server. One page: **[letools.dev](https://letools.dev)**

**Get it out**

- **[String-LE](https://letools.dev/tools/string-le)** — Extract every string in a codebase, with its position, so a person can read them
- **[Numbers-LE](https://letools.dev/tools/numbers-le)** — Extract every hardcoded number in a codebase, so a person can check them
- **[Units-LE](https://letools.dev/tools/units-le)** — Extract every quantity with its unit, normalized, and refuse the ambiguous ones by name
- **[Dates-LE](https://letools.dev/tools/dates-le)** — Extract every date and timestamp, and the exact instant each one resolves to
- **[IDs-LE](https://letools.dev/tools/ids-le)** — Extract every UUID, ULID, NanoID, ObjectId and Snowflake, and decode the time inside
- **[IPs-LE](https://letools.dev/tools/ips-le)** — Extract every IP address, CIDR block and MAC, normalized and classified by scope
- **[URLs-LE](https://letools.dev/tools/urls-le)** — Extract every URL in a codebase, with its protocol and exact position
- **[Paths-LE](https://letools.dev/tools/paths-le)** — Extract every file path in a codebase, and say whether it still points at anything
- **[Colors-LE](https://letools.dev/tools/colors-le)** — Extract every color in a codebase, and say which ones are not in your palette

**Check it**

- **[Regex-LE](https://letools.dev/tools/regex-le)** — Find every regex in a codebase, and report which can be driven into catastrophic backtracking
- **[Versions-LE](https://letools.dev/tools/versions-le)** — Find where one dependency is constrained differently across a repository's manifests
- **[i18n-LE](https://letools.dev/tools/i18n-le)** — Identify the i18n library a project uses, then audit its catalogs by that library's rules
- **[Scrape-LE](https://letools.dev/tools/scrape-le)** — Check whether a page is scrapeable before the scraper is written, and say when it cannot tell

**Guard it**

- **[Secrets-LE](https://letools.dev/tools/secrets-le)** — Find hardcoded credentials in a codebase, and never print one into the report
- **[EnvSync-LE](https://letools.dev/tools/envsync-le)** — Compare the dotenv files in a tree, and say which keys are missing from which
- **[Unicode-LE](https://letools.dev/tools/unicode-le)** — Find the Unicode that hides meaning — bidi controls, invisibles, homoglyphs, mixed scripts

Each stands on its own: no shared crate, no published core. Where two of them
agree, it is because the same answer was right twice.

**Contact** — [nolindnaidoo.com](https://nolindnaidoo.com) · [GitHub](https://github.com/nolindnaidoo) · [LinkedIn](https://www.linkedin.com/in/nolindnaidoo/)

## Also by nolindnaidoo

**Rust** — pixelcoords and pixelactions are one loop: pixelcoords answers
*where*, pixelactions *acts* there. Their own tools, their own voice — not
part of the LE family.

- **[pixelcoords](https://github.com/nolindnaidoo/pixelcoords)** — Freeze your screen, mark regions, get pixel-exact coordinates and crops
  [pixelcoords.dev](https://pixelcoords.dev) · [crates.io](https://crates.io/crates/pixelcoords) · [docs.rs](https://docs.rs/pixelcoords)
- **[pixelactions](https://github.com/nolindnaidoo/pixelactions)** — Consume human-verified coordinates, perform the interaction, confirm it landed
  [pixelactions.dev](https://pixelactions.dev) · [crates.io](https://crates.io/crates/pixelactions) · [docs.rs](https://docs.rs/pixelactions)

## License

MIT — see [LICENSE](https://github.com/nolindnaidoo/string-le/blob/main/LICENSE).
