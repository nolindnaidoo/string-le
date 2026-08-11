//! Getting the string values out of a document.
//!
//! **Nothing in here touches the filesystem.** A `std::fs` call below
//! this line is a bug and a CI job greps for one: every extractor takes
//! document text and returns values, which is what lets the whole layer
//! be tested from the corpus with no temp directories and no flake.
//!
//! The extension is the reference implementation. These extractors
//! reproduce its values, in its order, for every document in
//! `fixtures/`; a difference is a regression until SPEC.md says
//! otherwise.

pub(crate) mod collect;
pub(crate) mod corpus;
pub(crate) mod csv;
pub(crate) mod dotenv;
pub(crate) mod fallback;
pub(crate) mod format;
pub(crate) mod ini;
pub(crate) mod json;
pub(crate) mod locate;
pub(crate) mod position;
pub(crate) mod toml;
pub(crate) mod yaml;

use serde::Serialize;

pub(crate) use format::{FALLBACK_FORMAT, SUPPORTED_FORMATS, resolve_format};
pub(crate) use position::Position;

/// What a caller can change about how a document is read.
///
/// Only CSV has any. The extension's other extractors take no options,
/// and inventing some here would be this crate growing behaviour the
/// extension then has to be held to.
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct Options {
    pub(crate) csv_has_header: bool,
    pub(crate) csv_column: Option<usize>,
    /// Let a quoted run span lines in the fallback extractor.
    ///
    /// The one place this crate will answer differently from the
    /// extension, and only when asked. See `fallback::QUOTED_MULTILINE`.
    pub(crate) multiline: bool,
}

/// One extracted value, and where it was found.
///
/// `position` is `None` when the value cannot be located in the source.
/// It is a real outcome, not an error: a parser resolves escapes and
/// folds scalars, so a value can be entirely correct and still not
/// appear literally anywhere in the document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Found {
    pub(crate) value: String,
    #[serde(flatten)]
    pub(crate) position: Option<Position>,
}

/// Extract every string value, in document order.
///
/// Mirrors the extension's `extractStrings`: the text is trimmed first,
/// an empty document yields nothing, and an unrecognised format falls
/// back to quoted-string extraction rather than failing — the case that
/// matters most here, because a source file full of user-facing copy
/// takes exactly that path.
pub(crate) fn extract(text: &str, format: &str, options: Options) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    match format::canonical(format) {
        "json" => json::extract(trimmed),
        "yaml" => yaml::extract(trimmed),
        "csv" => csv::extract(trimmed, options),
        "toml" => toml::extract(trimmed),
        "ini" => ini::extract(trimmed),
        "env" => dotenv::extract(trimmed),
        _ => fallback::extract_with(trimmed, options.multiline),
    }
}

/// Everything one pass over a document produces.
///
/// One call rather than three. Values, positions, why a document yielded
/// nothing and whether the depth cap bound are all facts about the same
/// parse, and asking for them separately meant parsing the file twice.
#[derive(Debug, Clone, Default)]
pub(crate) struct Extraction {
    pub(crate) found: Vec<Found>,
    pub(crate) parse_error: Option<String>,
}

/// One pass: values, positions, and why a document yielded nothing.
pub(crate) fn examine(text: &str, format: &str, options: Options) -> Extraction {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Extraction::default();
    }
    let shift = text.len() - text.trim_start().len();
    let index = position::PositionIndex::new(text);

    // JSON is placed by its parser, the rest by a forward cursor. The
    // jsonc AST carries a range for every literal, which places the
    // values a search cannot find — a resolved `\n` or `\"` has no
    // literal occurrence in the document. Positions are outside parity
    // scope, so a format may be placed however it can be placed
    // honestly; the other six have no spans to offer.
    if format::canonical(format) == "json" {
        return Extraction {
            found: json::extract_spanned(trimmed)
                .into_iter()
                .map(|(value, offset)| Found {
                    value,
                    position: Some(index.at(offset + shift)),
                })
                .collect(),
            parse_error: json::parse_error(trimmed),
        };
    }

    Extraction {
        found: locate::locate(text, extract(text, format, options)),
        parse_error: parse_error(text, format),
    }
}

/// Why a document yielded nothing, when the reason is a parse failure.
///
/// The extension reports this through `onParseError` and returns an
/// empty array; the CLI turns it into a diagnostic on the report, so an
/// empty result is never mistaken for a file with nothing in it.
pub(crate) fn parse_error(text: &str, format: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    match format::canonical(format) {
        "json" => json::parse_error(trimmed),
        "yaml" => yaml::parse_error(trimmed),
        "csv" => csv::parse_error(trimmed),
        "toml" => toml::parse_error(trimmed),
        "ini" => ini::parse_error(trimmed),
        // dotenv and the fallback cannot fail to parse: one reads lines
        // and the other matches quoted runs. Neither has a shape it can
        // reject.
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_document_yields_nothing() {
        assert!(extract("", "json", Options::default()).is_empty());
        assert!(extract("   \n\t ", "json", Options::default()).is_empty());
        assert!(parse_error("   ", "json").is_none());
    }

    /// The case the audit story rests on: a source file is not a format
    /// this parses, and falling back is the useful answer rather than a
    /// refusal.
    #[test]
    fn an_unknown_format_falls_back_rather_than_failing() {
        assert_eq!(
            extract("const a = 'hello';", "typescript", Options::default()),
            ["hello"]
        );
        assert!(parse_error("const a = 'hello';", "typescript").is_none());
    }

    #[test]
    fn locating_does_not_change_what_was_extracted() {
        let text = "{\"a\":\"one\",\"b\":\"two\"}";
        let values = extract(text, "json", Options::default());
        let examined = examine(text, "json", Options::default());
        assert_eq!(
            values,
            examined
                .found
                .iter()
                .map(|f| f.value.clone())
                .collect::<Vec<_>>()
        );
    }
}
