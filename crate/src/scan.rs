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
    pub(crate) fn is_unreadable(&self) -> bool {
        self.diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "unreadable")
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ScanOptions {
    pub(crate) dedupe: bool,
    pub(crate) extract: Options,
    /// A format the caller forced, instead of one inferred per file.
    pub(crate) format: Option<&'static str>,
}

pub(crate) fn scan_file(path: &PathBuf, options: ScanOptions) -> Option<FileReport> {
    let file = path.to_string_lossy().into_owned();
    let format = options.format.unwrap_or_else(|| format_of(path));

    match std::fs::read(path) {
        // A file that is not UTF-8 holds no text to read. Failing on
        // each would make the tool unusable in a repository with images
        // in it.
        Ok(bytes) => String::from_utf8(bytes)
            .ok()
            .map(|content| scan_content(&content, file, format, options)),
        Err(error) => Some(FileReport {
            file,
            format: format.to_string(),
            strings: Vec::new(),
            diagnostics: vec![Diagnostic {
                severity: "error".to_string(),
                code: "unreadable".to_string(),
                message: format!("could not be read: {error}"),
            }],
            summary: Summary {
                strings: 0,
                unlocated: 0,
            },
        }),
    }
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
    let mut strings = extract::extract_located(content, format, options.extract);

    if options.dedupe {
        let mut seen = std::collections::HashSet::new();
        strings.retain(|found| seen.insert(found.value.clone()));
    }

    // A parse failure yields nothing and says why. Said as a warning
    // rather than an error because the extension treats it the same way:
    // the document is unreadable *as that format*, which is a fact about
    // the file, not a failure of the run.
    let diagnostics = extract::parse_error(content, format)
        .map(|message| Diagnostic {
            severity: "warning".to_string(),
            code: "unparsed".to_string(),
            message,
        })
        .into_iter()
        .collect();

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
pub(crate) fn exit_code(reports: &[FileReport]) -> u8 {
    if reports.iter().any(FileReport::is_unreadable) {
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
        assert_eq!(exit_code(&[report]), 0);
    }

    #[test]
    fn a_document_with_none_exits_one() {
        let report = scan_content("{}", "a.json".into(), "json", plain());
        assert_eq!(report.summary.strings, 0);
        assert_eq!(exit_code(&[report]), 1);
    }

    #[test]
    fn nothing_to_scan_exits_one() {
        assert_eq!(exit_code(&[]), 1);
    }

    /// A broken document is a fact about the file, not a failed run. One
    /// malformed config must not fail an audit of ten thousand files.
    #[test]
    fn a_parse_failure_is_a_warning_not_an_exit_two() {
        let report = scan_content("{not json", "a.json".into(), "json", plain());
        assert_eq!(report.diagnostics.len(), 1);
        assert_eq!(report.diagnostics[0].severity, "warning");
        assert!(!report.is_unreadable());
        assert_eq!(exit_code(&[report]), 1);
    }

    #[test]
    fn an_unreadable_file_ends_the_run_at_two() {
        let tree = TempTree::new("scan-unreadable");
        let report = scan_file(&tree.path().join("gone.json"), plain()).expect("a report");
        assert!(report.is_unreadable());
        assert_eq!(exit_code(&[report]), 2);
    }

    #[test]
    fn a_binary_file_is_skipped_rather_than_failed() {
        let tree = TempTree::new("scan-binary");
        let file = tree.path().join("logo.png");
        std::fs::write(&file, [0x89, 0x50, 0xff, 0xfe]).expect("a file");
        assert!(scan_file(&file, plain()).is_none());
    }

    #[test]
    fn the_format_comes_from_the_file_name() {
        let tree = TempTree::new("scan-format");
        let file = tree.write("config.toml", "a = \"value\"\n");
        let report = scan_file(&file, plain()).expect("a report");
        assert_eq!(report.format, "toml");
        assert_eq!(report.summary.strings, 1);
    }

    /// The audit case: a source file is not a format this parses, and it
    /// still yields its copy.
    #[test]
    fn a_source_file_falls_back_and_still_answers() {
        let tree = TempTree::new("scan-fallback");
        let file = tree.write("messages.ts", "const m = 'Delete this?';\n");
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
    #[test]
    fn values_the_source_does_not_spell_are_counted() {
        let report = scan_content(
            r#"{"a":"plain","b":"first\nsecond"}"#,
            "a.json".into(),
            "json",
            plain(),
        );
        assert_eq!(report.summary.strings, 2);
        assert_eq!(report.summary.unlocated, 1);
        assert!(report.strings[1].position.is_none());
    }

    #[test]
    fn the_human_line_carries_the_position_when_there_is_one() {
        let report = scan_content(r#"{"a":"one"}"#, "a.json".into(), "json", plain());
        assert_eq!(describe(&report, &report.strings[0]), "a.json:1:7  one");
    }

    #[test]
    fn the_human_line_says_so_when_there_is_no_position() {
        let report = scan_content(r#"{"a":"x\ny"}"#, "a.json".into(), "json", plain());
        assert!(describe(&report, &report.strings[0]).starts_with("a.json:-"));
    }
}
