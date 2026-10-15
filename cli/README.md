# string-le

Get every string value in a codebase out into one place a person can read:
the QA lead checking messages, the reviewer looking for a claim the product
may not make, the localisation owner finding what never reached a catalog.

```bash
npx string-le src/
npx string-le --values --dedupe src/ > strings.txt
cat config.toml | npx string-le --stdin --format toml
```

This is the same command line as the Rust crate
[`string-le`](https://crates.io/crates/string-le), and it behaves identically:
same flags, same walk, same output, same exit codes. Install whichever
toolchain you already have. The one difference is the words a parser uses to
refuse a broken document: both report it as unparsed under the same
`Invalid JSON: ` prefix, and the rest is each parser's own description.

## What it reads

Every file. JSON, JSONC, YAML, CSV, TSV, TOML, INI and dotenv are parsed;
Python, Rust, Go, shell, PHP, Ruby, Perl, C#, JavaScript and TypeScript are
read by their own string syntax; anything else falls back to quoted runs and
is reported as format `fallback`. Keys are never values. Directories are
walked the way ripgrep walks them: `.gitignore`, `.ignore` and hidden files
are respected unless you pass `--no-ignore` or `--hidden`. A binary file is
passed over and counted in the summary.

It reports what is there and nothing else. Which strings matter is yours to
decide.

## Output

stdout carries one JSON report per file whenever it is piped or redirected,
and nothing when it is a terminal. stderr carries the human summary.
`--values` prints just the values, one per line, wherever stdout goes.

```json
{"file":"src/messages.ts","format":"typescript","strings":[{"value":"Delete this file?","line":1,"column":25},{"value":"Saved ${count} items","line":2,"column":22}],"diagnostics":[],"summary":{"strings":2,"unlocated":0}}
```

Columns count UTF-16 code units, as an editor does. A value the source never
spells literally, such as a resolved escape or a folded YAML block, carries
no `line` or `column`, and `summary.unlocated` counts them.

## Exit codes

grep's convention:

- **0**: strings found.
- **1**: none found. That is an answer, not an error.
- **2**: the question was malformed, or `--strict` and a text file could not
  be read.

## For agents

`string-le mcp` serves the Model Context Protocol on stdio with two tools:
`extract_strings` for a document's text and `string_le_scan` for files and
directories. Hosts that want the server alone can install
[`string-le-mcp`](https://www.npmjs.com/package/string-le-mcp).

`string-le --help` lists every option.

MIT licensed. Part of [letools](https://letools.dev/tools/string-le).
