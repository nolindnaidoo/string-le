# Instructions for AI coding assistants

Read [AGENTS.md](AGENTS.md) first — it is the engineering-standards
document for this crate and the source of truth for layout, control-flow
style, the settled decisions, testing requirements, and the definition
of done. [SPEC.md](SPEC.md) defines the product behavior. AGENTS.md wins
on any conflict. The extension at the repo root is a separate product
with its own `CLAUDE.md`.

- Before declaring any change complete, run exactly what CI runs:
  `cargo fmt --all --check`,
  `cargo clippy --all-targets -- -D warnings`,
  `cargo test --locked`. All three must pass — and
  `bun ../scripts/check-extraction-parity.ts` when extraction changed.
- Never add inline `#[allow(...)]` — CI fails the build on it. Fix the
  lint, or add a commented relaxation to `[lints.clippy]` in
  `Cargo.toml`.
- New logic goes in `extract/` when it is pure (it must then be
  unit-tested, 75% module coverage floor), and in `walk.rs` / `scan.rs`
  only when it needs the filesystem. A `std::fs` call in `extract/`
  fails a CI job.
- **An unrecognised format is not an error here.** Every sibling crate
  refuses one; this one falls back to quoted strings, because that is
  what the extension does and because a `.ts` file taking that path is
  the whole audit. Do not "fix" it into a refusal.
- **The shared tool returns values, not positions.** `extract_strings`
  says so in its own description on both servers. Positions belong to
  the CLI and to `string_le_scan`, which read the file themselves.
- **Do not give this tool an opinion.** No spell check, no banned-word
  list, no "this looks user-facing" guess — see SPEC.md. Contract tests
  on both surfaces enforce it.
- `fixtures/` is shared with the extension — changing it changes both
  frontends and needs a CHANGELOG entry. **What it holds equal is the
  shared `extract_strings` MCP tool**, which must answer identically from
  either server; a difference there is a bug. The surfaces themselves
  are IDE-first and terminal-first and are meant to differ —
  the walk, `--multiline`, `--strict`, `--dedupe`, the exit codes and JSON Lines have no
  editor equivalent and are not drift. SPEC.md's "Deliberate
  divergences" is the bar for a new one.
- Write regression tests for every bug you fix; keep unit tests free of
  clocks, randomness, and the filesystem outside `walk`/`scan`.
- **Run the binary, not only the tests.** Two parity breaks got through a
  green suite and were caught by the corpus on its first real run: INI
  escape handling turning `C:\Users\test` into `C:Users\test`, and the
  fallback regex matching across newlines where JavaScript's `.` cannot.
