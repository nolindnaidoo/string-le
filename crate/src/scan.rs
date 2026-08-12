//! One file end to end — the only path either surface calls.
//!
//! `cli.rs` and `mcp/` both come through here, so a rule can only be
//! written once. `tests/contracts.rs` asserts the two agree.

use std::path::{Path as StdPath, PathBuf};

use serde::Serialize;

use crate::extract::{self, Found, Options, resolve_format};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Diagnostic {
    pub(crate) severity: String,
    pub(crate) code: String,
    pub(crate) message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub(crate) struct Summary {
    pub(crate) strings: usize,
    /// How many values could not be located in the source.
    ///
    /// Reported rather than inferred, because it is the number that says
    /// whether the positions in this report can be trusted as a complete
    /// index. A silent zero and a silent forty look identical.
    pub(crate) unlocated: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct FileReport {
    pub(crate) file: String,
    pub(crate) format: String,
    pub(crate) strings: Vec<Found>,
    pub(crate) diagnostics: Vec<Diagnostic>,
    pub(crate) summary: Summary,
}

impl FileReport {
    /// Whether this file was not examined at all. A parse failure is
    /// **not** one of these: the extension treats a broken document as
    /// yielding nothing and says so, and reporting it as a hard failure
    /// would make one malformed config fail an audit of ten thousand
    /// files.
    /// Whether this file was not read at all — not text, or not
    /// openable.
    ///
    /// Reported rather than swallowed, because a report that quietly
    /// skipped a file would be claiming coverage it does not have. It
    /// does **not** fail the run on its own: every repository has a PNG
    /// and a zip in it, and exiting 2 on those makes the tool unusable
    /// in CI, which is the one place it is most worth running.
    /// `--strict` is there for a pipeline that wants zero tolerance.
    pub(crate) fn was_skipped(&self) -> bool {
        self.diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "skipped")
    }

    /// Whether the scan of this file gave up part way. Unlike a skip
    /// this **does** fail the run: reporting no findings when a
    /// detector stopped early would overstate coverage, which is the
    /// one thing an audit tool must never do.
    pub(crate) fn is_incomplete(&self) -> bool {
        self.diagnostics
            .iter()
            .any(|diagnostic| diagnostic.severity == "error")
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ScanOptions {
    pub(crate) dedupe: bool,
    pub(crate) extract: Options,
    /// A format the caller forced, instead of one inferred per file.
    pub(crate) format: Option<&'static str>,
}

/// How many leading bytes decide whether a file is text.
///
/// ripgrep's number, and borrowed rather than invented for the same
/// reason its walker is: "what this tool reads" already means "what
/// ripgrep reads", and that is the answer a person auditing a repository
/// already has in their head.
const BINARY_SNIFF_BYTES: usize = 8 * 1024;

/// One file, or `None` when it was never a text candidate.
///
/// **A PNG is not a text file that failed to be read.** Before the walk
/// widened it was never opened; reporting it as a skip made `--strict`
/// exit 2 on any repository with an image in it, which is every
/// repository. It is left out of the reports entirely and counted in the
/// summary instead — silence about it would be worse than the noise it
/// replaced.
///
/// A file that *is* text and still could not be read keeps its named
/// `skipped` diagnostic and keeps failing `--strict`. That distinction is
/// the whole point.
pub(crate) fn scan_file(path: &PathBuf, options: ScanOptions) -> Option<FileReport> {
    let file = report_path(path);
    let format = options.format.unwrap_or_else(|| format_of(path));

    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return Some(skipped(file, format, &error.to_string())),
    };
    if is_binary(&bytes) {
        return None;
    }
    match String::from_utf8(bytes) {
        Ok(content) => Some(scan_content(without_bom(&content), file, format, options)),
        // Named rather than dropped. A file that vanishes from the
        // report is a file the reader believes was covered.
        Err(_) => Some(skipped(file, format, "not UTF-8 text")),
    }
}

/// The path as the report spells it: **always with `/`**, on every
/// platform.
///
/// stdout is protocol. A report written on Windows and read on a Linux
/// runner is the ordinary case for this tool — a QA lead diffing last
/// release against this one, a pipeline grepping for a file — and
/// `src\ui\messages.ts` there matches nothing that `src/ui/messages.ts`
/// matches. A sibling crate shipped a release doing exactly that.
///
/// Only the separator is rewritten, and only where the separator *is*
/// `\`: on unix a backslash is an ordinary character in a file name, and
/// replacing it would rename the file the report names.
#[cfg(windows)]
fn report_path(path: &StdPath) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(not(windows))]
fn report_path(path: &StdPath) -> String {
    path.to_string_lossy().into_owned()
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes
        .iter()
        .take(BINARY_SNIFF_BYTES)
        .any(|byte| *byte == b'\0')
}

fn format_of(path: &StdPath) -> &'static str {
    resolve_format(None, path.file_name().and_then(|name| name.to_str()))
}

pub(crate) fn scan_content(
    content: &str,
    file: String,
    format: &str,
    options: ScanOptions,
) -> FileReport {
    let examined = extract::examine(content, format, options.extract);
    let mut strings = examined.found;

    if options.dedupe {
        let mut seen = std::collections::HashSet::new();
        strings.retain(|found| seen.insert(found.value.clone()));
    }

    let mut diagnostics = Vec::new();
    // A parse failure yields nothing and says why. Said as a warning
    // rather than an error because the extension treats it the same way:
    // the document is unreadable *as that format*, which is a fact about
    // the file, not a failure of the run.
    if let Some(message) = examined.parse_error {
        diagnostics.push(Diagnostic {
            severity: "warning".to_string(),
            code: "unparsed".to_string(),
            message,
        });
    }

    let unlocated = strings
        .iter()
        .filter(|found| found.position.is_none())
        .count();

    FileReport {
        file,
        format: format.to_string(),
        summary: Summary {
            strings: strings.len(),
            unlocated,
        },
        strings,
        diagnostics,
    }
}

/// grep's convention: 0 found, 1 none found, 2 could not answer.
///
/// Finding nothing is an answer here, not an error — a file with no
/// user-facing copy in it is a real result and `if string-le src/; then`
/// has to work.
pub(crate) fn exit_code(reports: &[FileReport], strict: bool) -> u8 {
    // A scan that gave up part way always fails: it would otherwise
    // report "nothing found" for a file it never finished reading.
    if reports.iter().any(FileReport::is_incomplete) {
        return 2;
    }
    if strict && reports.iter().any(FileReport::was_skipped) {
        return 2;
    }
    u8::from(!reports.iter().any(|report| report.summary.strings > 0))
}

pub(crate) fn describe(report: &FileReport, found: &Found) -> String {
    match found.position {
        Some(position) => format!(
            "{}:{}:{}  {}",
            report.file, position.line, position.column, found.value
        ),
        None => format!("{}:-  {}", report.file, found.value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempTree;

    fn plain() -> ScanOptions {
        ScanOptions::default()
    }

    #[test]
    fn a_document_with_strings_exits_zero() {
        let report = scan_content(r#"{"a":"one"}"#, "a.json".into(), "json", plain());
        assert_eq!(report.summary.strings, 1);
        assert_eq!(exit_code(&[report], false), 0);
    }

    #[test]
    fn a_document_with_none_exits_one() {
        let report = scan_content("{}", "a.json".into(), "json", plain());
        assert_eq!(report.summary.strings, 0);
        assert_eq!(exit_code(&[report], false), 1);
    }

    #[test]
    fn nothing_to_scan_exits_one() {
        assert_eq!(exit_code(&[], false), 1);
    }

    /// A broken document is a fact about the file, not a failed run. One
    /// malformed config must not fail an audit of ten thousand files.
    /// Each parser guards its own nesting before this crate's cap is
    /// reached — jsonc-parser at 512, saphyr at 256 — so a document too
    /// deep to read comes back as a reported parse failure rather than
    /// as a half-read document. The extension's parsers accept deeper
    /// and its walk stops at 1000 in silence, so between those depths it
    /// returns values and this returns a warning. Said out loud beats
    /// half an answer.
    #[test]
    fn a_document_too_deep_to_parse_is_reported_not_half_read() {
        let document = format!("{}x{}", "[".repeat(600), "]".repeat(600));
        let report = scan_content(&document, "a.yaml".into(), "yaml", plain());
        assert_eq!(report.summary.strings, 0);
        assert_eq!(report.diagnostics[0].code, "unparsed");
        assert!(!report.was_skipped(), "a deep document is not unreadable");
    }

    #[test]
    fn a_parse_failure_is_a_warning_not_an_exit_two() {
        let report = scan_content("{not json", "a.json".into(), "json", plain());
        assert_eq!(report.diagnostics.len(), 1);
        assert_eq!(report.diagnostics[0].severity, "warning");
        assert!(!report.was_skipped());
        assert_eq!(exit_code(&[report], false), 1);
    }

    /// Changed deliberately: a file that could not be read is reported
    /// and does not fail the run, because every repository has one and
    /// exiting 2 on it meant the tool never got run in CI at all.
    #[test]
    fn an_unreadable_file_is_reported_and_does_not_end_the_run() {
        let tree = TempTree::new("scan-unreadable");
        let report = scan_file(&tree.path().join("gone.json"), plain()).expect("a report");
        assert!(report.was_skipped());
        assert_eq!(report.diagnostics[0].severity, "warning");
        assert_eq!(exit_code(std::slice::from_ref(&report), false), 1);
        assert_eq!(exit_code(&[report], true), 2, "--strict is opt-in");
    }

    /// Changed deliberately: a PNG is not a text file that failed to be
    /// read, it was never a text candidate. Reported as a skip it made
    /// `--strict` exit 2 on every repository holding an image, which made
    /// the flag useless.
    #[test]
    fn a_binary_file_is_not_a_report_at_all() {
        let tree = TempTree::new("scan-binary");
        let file = tree.path().join("logo.png");
        std::fs::write(&file, [0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]).expect("a file");
        assert!(scan_file(&file, plain()).is_none());
    }

    /// The distinction the flag rests on: invalid UTF-8 with no NUL byte
    /// is text that could not be read, and still fails `--strict`.
    #[test]
    fn text_that_cannot_be_decoded_is_still_a_named_skip() {
        let tree = TempTree::new("scan-invalid-utf8");
        let file = tree.path().join("notes.txt");
        std::fs::write(&file, [b'h', b'i', 0xff, 0xfe]).expect("a file");
        let report = scan_file(&file, plain()).expect("a report");
        assert!(report.was_skipped());
        assert_eq!(report.diagnostics[0].message, "not UTF-8 text");
        assert_eq!(exit_code(std::slice::from_ref(&report), false), 1);
        assert_eq!(exit_code(&[report], true), 2);
    }

    /// A NUL byte past the sniff window is content, not a signature.
    #[test]
    fn a_nul_byte_beyond_the_window_does_not_make_a_file_binary() {
        let tree = TempTree::new("scan-late-nul");
        let file = tree.path().join("big.txt");
        let mut bytes = vec![b'a'; BINARY_SNIFF_BYTES];
        bytes.extend_from_slice(&[0, b'"', b'x', b'"']);
        std::fs::write(&file, bytes).expect("a file");
        let report = scan_file(&file, plain()).expect("a report");
        assert!(!report.was_skipped());
        assert_eq!(report.summary.strings, 1);
    }

    /// The report separator is rewritten only where `\` *is* the
    /// separator. On unix it is an ordinary character in a file name,
    /// and rewriting it would name a file that does not exist.
    #[cfg(unix)]
    #[test]
    fn a_backslash_in_a_unix_file_name_is_not_a_separator() {
        let tree = TempTree::new("scan-backslash");
        let file = tree.write("od\\d.json", "{\"a\":\"value\"}");
        let report = scan_file(&file, plain()).expect("a report");
        assert!(report.file.ends_with("od\\d.json"), "{}", report.file);
    }

    #[test]
    fn the_format_comes_from_the_file_name() {
        let tree = TempTree::new("scan-format");
        let file = tree.write("config.toml", "a = \"value\"\n");
        let report = scan_file(&file, plain()).expect("a report");
        assert_eq!(report.format, "toml");
        assert_eq!(report.summary.strings, 1);
    }

    /// The audit case: a source file yields its copy, and the report
    /// says which language it was read as.
    #[test]
    fn a_source_file_is_read_as_its_language() {
        let tree = TempTree::new("scan-source");
        let file = tree.write("messages.ts", "const m = 'Delete this?';\n");
        let report = scan_file(&file, plain()).expect("a report");
        assert_eq!(report.format, "typescript");
        assert_eq!(report.strings[0].value, "Delete this?");
    }

    /// A name no extractor claims is still read, which is what lets this
    /// be pointed at a whole tree.
    #[test]
    fn an_unclaimed_extension_falls_back_and_still_answers() {
        let tree = TempTree::new("scan-fallback");
        let file = tree.write("notes.rtf", "note = 'Delete this?'\n");
        let report = scan_file(&file, plain()).expect("a report");
        assert_eq!(report.format, "fallback");
        assert_eq!(report.strings[0].value, "Delete this?");
    }

    #[test]
    fn a_forced_format_overrides_the_file_name() {
        let tree = TempTree::new("scan-forced");
        let file = tree.write("data.json", "a = \"value\"\n");
        let report = scan_file(
            &file,
            ScanOptions {
                format: Some("toml"),
                ..plain()
            },
        )
        .expect("a report");
        assert_eq!(report.format, "toml");
        assert_eq!(report.summary.strings, 1);
    }

    #[test]
    fn dedupe_collapses_repeats_to_the_first() {
        let content = r#"{"a":"same","b":"other","c":"same"}"#;
        let kept = scan_content(content, "a.json".into(), "json", plain());
        assert_eq!(kept.summary.strings, 3);

        let deduped = scan_content(
            content,
            "a.json".into(),
            "json",
            ScanOptions {
                dedupe: true,
                ..plain()
            },
        );
        assert_eq!(deduped.summary.strings, 2);
        assert_eq!(deduped.strings[0].value, "same");
        assert_eq!(
            deduped.strings[0].position.expect("a position").line,
            1,
            "the first occurrence keeps its own position"
        );
    }

    /// The count that says whether the positions are a complete index.
    /// A YAML block scalar is the case: the value has real newlines and
    /// the source has indented lines, so it is nowhere to be found.
    #[test]
    fn values_the_source_does_not_spell_are_counted() {
        let report = scan_content(
            "a: plain\nb: |\n  first\n  second\n",
            "a.yaml".into(),
            "yaml",
            plain(),
        );
        assert_eq!(report.summary.strings, 2);
        assert_eq!(report.summary.unlocated, 1);
        assert!(report.strings[1].position.is_none());
    }

    /// JSON is placed by its parser rather than by a search, so the
    /// escapes that defeat the cursor are located anyway.
    #[test]
    fn json_locates_a_value_the_source_does_not_spell() {
        let report = scan_content(r#"{"a":"first\nsecond"}"#, "a.json".into(), "json", plain());
        assert_eq!(report.summary.unlocated, 0);
        assert_eq!(report.strings[0].position.expect("a position").column, 7);
    }

    #[test]
    fn the_human_line_carries_the_position_when_there_is_one() {
        let report = scan_content(r#"{"a":"one"}"#, "a.json".into(), "json", plain());
        assert_eq!(describe(&report, &report.strings[0]), "a.json:1:7  one");
    }

    #[test]
    fn the_human_line_says_so_when_there_is_no_position() {
        let report = scan_content("b: |\n  x\n  y\n", "a.yaml".into(), "yaml", plain());
        assert!(describe(&report, &report.strings[0]).starts_with("a.yaml:-"));
    }
}

/// The report for a file that was not read: named, warned about, and
/// not a failure by itself.
fn skipped(file: String, format: &'static str, reason: &str) -> FileReport {
    FileReport {
        file,
        format: format.to_string(),
        strings: Vec::new(),
        diagnostics: vec![Diagnostic {
            severity: "warning".to_string(),
            code: "skipped".to_string(),
            message: reason.to_string(),
        }],
        summary: Summary {
            strings: 0,
            unlocated: 0,
        },
    }
}

/// Drop a leading byte-order mark.
///
/// No editor shows it and VS Code strips it before the extension ever
/// sees a document, so without this the two frontends read the same file
/// differently the moment anything on Windows saves it — Notepad, Excel,
/// a PowerShell redirect. Three invisible bytes shift every column on
/// the first line, and in a structured format they can lose the
/// document entirely.
pub(crate) fn without_bom(content: &str) -> &str {
    content.strip_prefix('\u{feff}').unwrap_or(content)
}

#[cfg(test)]
mod hazards {
    use super::*;

    /// Three invisible bytes that Notepad, Excel and a PowerShell
    /// redirect all add, and that VS Code strips before the extension
    /// ever sees a document — so without this the two frontends read
    /// the same file differently.
    #[test]
    fn a_byte_order_mark_is_not_part_of_the_document() {
        assert_eq!(without_bom("\u{feff}abc"), "abc");
        assert_eq!(without_bom("abc"), "abc");
        // Only a leading one: elsewhere it is a zero-width no-break
        // space and belongs to the text.
        assert_eq!(without_bom("a\u{feff}b"), "a\u{feff}b");
    }
}
