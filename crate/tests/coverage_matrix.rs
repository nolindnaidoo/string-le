//! Does this crate open what it claims to open?
//!
//! One file per name in the alias table, plus a dozen extensions the
//! table has never heard of, all in one tree, all run through the built
//! binary. Every one of them must come back with a report line, the
//! format it was supposed to resolve to, and at least one value.
//!
//! The alias table and the offered-format list are read out of the
//! source rather than restated here, so adding a name without adding a
//! document fails this test instead of quietly widening the claim. It is
//! the test that makes "opens 21 of 88" visible without anybody counting
//! by hand.

use std::path::PathBuf;
use std::process::Command;

const BINARY: &str = env!("CARGO_BIN_EXE_string-le");
const FORMAT_SOURCE: &str = include_str!("../src/extract/format.rs");
const CORPUS: &str = include_str!("../fixtures/extraction.json");

/// Extensions no alias claims. Each must still be read, because the
/// whole audit rests on a file nobody described being read anyway.
const UNCLAIMED: [&str; 12] = [
    "rtf", "adoc", "tex", "proto", "kt", "swift", "java", "cpp", "lua", "sql", "graphql", "vue",
];

/// The array literal a `const NAME: [...] = [ … ];` declares.
fn block(declaration: &str) -> &'static str {
    let start = FORMAT_SOURCE
        .find(declaration)
        .unwrap_or_else(|| panic!("{declaration} is no longer declared in format.rs"));
    let end = FORMAT_SOURCE[start..]
        .find("];")
        .unwrap_or_else(|| panic!("{declaration} has no end"));
    &FORMAT_SOURCE[start..start + end]
}

/// Every `("alias", "key")` pair, read from the source of truth.
fn aliases() -> Vec<(String, String)> {
    let text = block("const ALIASES");
    let mut pairs = Vec::new();
    for line in text.lines() {
        let Some(open) = line.find("(\"") else {
            continue;
        };
        let quoted: Vec<&str> = line[open..].split('"').collect();
        if quoted.len() < 4 {
            continue;
        }
        pairs.push((quoted[1].to_string(), quoted[3].to_string()));
    }
    assert!(!pairs.is_empty(), "the alias table could not be read");
    pairs
}

fn offered() -> Vec<String> {
    block("const SUPPORTED_FORMATS")
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            trimmed
                .strip_prefix('"')
                .and_then(|rest| rest.split('"').next())
                .map(str::to_string)
        })
        .collect()
}

/// A document that yields exactly one value under the named extractor.
fn document(format: &str) -> &'static str {
    match format {
        "json" => "{\"a\":\"value\"}\n",
        // The two loosenings that define the format, so this document
        // is one the strict reader would refuse.
        "jsonc" => "{\n  // a comment\n  \"a\": \"value\",\n}\n",
        "yaml" => "a: \"value\"\n",
        "csv" | "tsv" => "value\n",
        "ini" => "a = value\n",
        "env" => "A=value\n",
        "python" => "x = \"value\"\n",
        "rust" => "let s = \"value\";\n",
        "go" => "s := \"value\"\n",
        "shellscript" => "echo \"value\"\n",
        // PHP and Perl spell an assignment the same way; so do TOML and
        // Ruby. Sharing an arm says they are the same document, which
        // they are.
        "php" | "perl" => "$a = \"value\";\n",
        "toml" | "ruby" => "a = \"value\"\n",
        "csharp" | "javascript" | "typescript" => "const s = \"value\";\n",
        "fallback" => "\"value\"\n",
        other => panic!("no document is written for {other}"),
    }
}

struct Tree {
    root: PathBuf,
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[test]
fn every_name_the_alias_table_carries_is_opened_and_read_as_itself() {
    let root = std::env::temp_dir().join(format!("string-le-matrix-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("a temporary directory");
    let tree = Tree {
        root: std::fs::canonicalize(&root).expect("a canonical directory"),
    };

    let mut expected: Vec<(String, String)> = Vec::new();
    for (alias, key) in aliases() {
        let name = format!("sample.{alias}");
        std::fs::write(tree.root.join(&name), document(&key)).expect("a file");
        expected.push((name, key));
    }
    for extension in UNCLAIMED {
        let name = format!("unclaimed.{extension}");
        std::fs::write(tree.root.join(&name), document("fallback")).expect("a file");
        expected.push((name, "fallback".to_string()));
    }

    let output = Command::new(BINARY)
        .arg(tree.root.to_string_lossy().into_owned())
        .output()
        .expect("the binary runs");
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(0), "{stderr}");

    let reports: Vec<serde_json::Value> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("JSON Lines"))
        .collect();

    let mut missing = Vec::new();
    let mut wrong = Vec::new();
    let mut empty = Vec::new();
    for (name, key) in &expected {
        let Some(report) = reports.iter().find(|report| {
            report["file"]
                .as_str()
                .is_some_and(|file| file.ends_with(name.as_str()))
        }) else {
            missing.push(name.clone());
            continue;
        };
        if report["format"] != key.as_str() {
            wrong.push(format!("{name}: read as {} not {key}", report["format"]));
        }
        if report["summary"]["strings"].as_u64() == Some(0) {
            empty.push(name.clone());
        }
    }

    assert!(
        missing.is_empty(),
        "the walk skipped files the alias table claims: {missing:?}"
    );
    assert!(
        wrong.is_empty(),
        "a name resolved to the wrong extractor: {wrong:?}"
    );
    assert!(
        empty.is_empty(),
        "a claimed format opened its document and found nothing: {empty:?}"
    );
    assert_eq!(
        reports.len(),
        expected.len(),
        "the walk read a different number of files than were written"
    );
}

/// A format that can be named and has no document behind it is a claim
/// nothing checks. The corpus is what makes the parity promise real, so
/// a format missing from it is a hole in the promise.
#[test]
fn every_offered_format_has_a_corpus_document() {
    let corpus: serde_json::Value = serde_json::from_str(CORPUS).expect("the corpus is JSON");
    let resolved: Vec<String> = corpus["documents"]
        .as_array()
        .expect("documents")
        .iter()
        .filter_map(|case| case["fileType"].as_str())
        .map(|file_type| {
            aliases()
                .into_iter()
                .find(|(alias, _)| alias == file_type)
                .map_or_else(|| "fallback".to_string(), |(_, key)| key)
        })
        .collect();

    let uncovered: Vec<String> = offered()
        .into_iter()
        .filter(|format| !resolved.contains(format))
        .collect();
    assert!(
        uncovered.is_empty(),
        "these formats can be named and no corpus document exercises them: {uncovered:?}"
    );
}
