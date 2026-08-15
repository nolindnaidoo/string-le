//! The shared corpus, embedded and run as unit tests.
//!
//! `fixtures/` is the contract between this crate and the extension.
//! Embedding it means `cargo test` on the published tarball runs every
//! case, so whoever installed this can check the parity claim in the
//! README instead of trusting it.
//!
//! The extension's side is checked by `../scripts/check-extraction-parity.ts`.

/// One corpus document, by name. Panics on a name the corpus does not
/// carry — a test naming a file that is not there is a broken test, not
/// a runtime condition.
#[cfg(test)]
pub(crate) fn document(name: &str) -> &'static str {
    match name {
        "strings.json" => include_str!("../../fixtures/documents/strings.json"),
        "strings.yaml" => include_str!("../../fixtures/documents/strings.yaml"),
        "strings.csv" => include_str!("../../fixtures/documents/strings.csv"),
        "strings.tsv" => include_str!("../../fixtures/documents/strings.tsv"),
        "strings.jsonc" => include_str!("../../fixtures/documents/strings.jsonc"),
        "strings.toml" => include_str!("../../fixtures/documents/strings.toml"),
        "strings.ini" => include_str!("../../fixtures/documents/strings.ini"),
        "strings.env" => include_str!("../../fixtures/documents/strings.env"),
        "strings.txt" => include_str!("../../fixtures/documents/strings.txt"),
        "messages.ts" => include_str!("../../fixtures/documents/messages.ts"),
        "escapes.json" => include_str!("../../fixtures/documents/escapes.json"),
        "strings.py" => include_str!("../../fixtures/documents/strings.py"),
        "strings.rs" => include_str!("../../fixtures/documents/strings.rs"),
        "strings.go" => include_str!("../../fixtures/documents/strings.go"),
        "strings.sh" => include_str!("../../fixtures/documents/strings.sh"),
        "strings.php" => include_str!("../../fixtures/documents/strings.php"),
        "strings.rb" => include_str!("../../fixtures/documents/strings.rb"),
        "strings.pl" => include_str!("../../fixtures/documents/strings.pl"),
        "strings.cs" => include_str!("../../fixtures/documents/strings.cs"),
        "strings.js" => include_str!("../../fixtures/documents/strings.js"),
        "strings.ts" => include_str!("../../fixtures/documents/strings.ts"),
        "unterminated.txt" => include_str!("../../fixtures/documents/unterminated.txt"),
        "whitespace.env" => include_str!("../../fixtures/documents/whitespace.env"),
        other => panic!("the corpus has no document named {other}"),
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::document;
    use crate::extract::{Options, extract};

    const CORPUS: &str = include_str!("../../fixtures/extraction.json");

    #[derive(Debug, Deserialize)]
    struct Corpus {
        documents: Vec<Case>,
    }

    #[derive(Debug, Deserialize)]
    struct Case {
        name: String,
        file: String,
        #[serde(rename = "fileType")]
        file_type: String,
        options: CaseOptions,
        expected: Vec<String>,
    }

    #[derive(Debug, Default, Deserialize)]
    struct CaseOptions {
        #[serde(rename = "csvHasHeader", default)]
        csv_has_header: bool,
        #[serde(rename = "csvColumnIndex", default)]
        csv_column_index: Option<usize>,
    }

    /// Every value, in the extension's order, for every case.
    #[test]
    fn every_corpus_document_reproduces() {
        let corpus: Corpus = serde_json::from_str(CORPUS).expect("the corpus is valid JSON");
        assert!(!corpus.documents.is_empty(), "the corpus is empty");

        for case in corpus.documents {
            let options = Options {
                csv_has_header: case.options.csv_has_header,
                csv_column: case.options.csv_column_index,
                // The corpus is the parity contract, so it always runs
                // the answer the extension gives.
                multiline: false,
            };
            assert_eq!(
                extract(document(&case.file), &case.file_type, options),
                case.expected,
                "{}",
                case.name
            );
        }
    }

    /// Every format the corpus exercises, so a new extractor cannot land
    /// without a case pinning it against the extension.
    ///
    /// Derived from the offered list rather than written out beside it:
    /// a hand-kept second list is a list that goes stale the first time
    /// a format is added.
    #[test]
    fn the_corpus_covers_every_extractor() {
        let corpus: Corpus = serde_json::from_str(CORPUS).expect("the corpus is valid JSON");
        for format in crate::extract::SUPPORTED_FORMATS {
            assert!(
                corpus
                    .documents
                    .iter()
                    .any(|case| crate::extract::format::canonical(&case.file_type) == format),
                "no corpus case reads {format}"
            );
        }
    }
}
