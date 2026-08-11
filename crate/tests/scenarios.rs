//! The tier that needs a document far larger than any editor opens.
//!
//! Gated behind `STRING_LE_SCENARIOS` and run by CI. Nothing here
//! substitutes for the unit tests, which run everywhere on every push.
//!
//! **A skipped scenario is never reported as a pass.**

use std::fmt::Write as _;
use std::io::Write as _;

fn enabled(name: &str) -> bool {
    if std::env::var_os("STRING_LE_SCENARIOS").is_some() {
        return true;
    }
    eprintln!("SKIPPED {name}: set STRING_LE_SCENARIOS to run it");
    false
}

fn scan(content: &str, format: &str) -> serde_json::Value {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_string-le"))
        .args(["--stdin", "--format", format])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            child
                .stdin
                .as_mut()
                .expect("stdin")
                .write_all(content.as_bytes())?;
            child.wait_with_output()
        })
        .expect("the binary runs");
    serde_json::from_slice(&output.stdout).expect("stdout carries JSON")
}

/// An audit of a large repository is the whole use case, so the shape
/// that matters is many values rather than one big one. The forward
/// cursor makes locating linear in the document; a scan-from-the-start
/// per value would be quadratic and only show at this size.
#[test]
fn a_document_with_many_values_completes() {
    if !enabled("a_document_with_many_values_completes") {
        return;
    }
    let mut content = String::from("{\n");
    for index in 0..100_000 {
        let _ = writeln!(content, "  \"k{index}\": \"value {index}\",");
    }
    content.push_str("  \"last\": \"end\"\n}\n");

    let report = scan(&content, "json");
    assert_eq!(report["summary"]["strings"], 100_001);
    assert_eq!(
        report["summary"]["unlocated"], 0,
        "every value is spelled in the source"
    );
}

/// A minified bundle is one very long line. Column lookup counts UTF-16
/// units from the line start, which is the operation that turns
/// quadratic when the line never ends.
#[test]
fn a_single_long_line_completes() {
    if !enabled("a_single_long_line_completes") {
        return;
    }
    let mut content = String::new();
    for index in 0..50_000 {
        let _ = write!(content, "const v{index} = 'copy {index}'; ");
    }
    let report = scan(&content, "typescript");
    assert_eq!(report["summary"]["strings"], 50_000);
}

/// The same, with a multi-byte character on the line, so the UTF-16
/// counting path is the one under test rather than the ASCII fast path.
#[test]
fn a_single_long_non_ascii_line_completes() {
    if !enabled("a_single_long_non_ascii_line_completes") {
        return;
    }
    let mut content = String::from("// café\n");
    for index in 0..20_000 {
        let _ = write!(content, "const v{index} = 'copy {index}'; ");
    }
    let report = scan(&content, "typescript");
    assert_eq!(report["summary"]["strings"], 20_000);
}
