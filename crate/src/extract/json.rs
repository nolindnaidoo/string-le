//! JSON, read with `jsonc-parser` where the extension reads with
//! `JSON.parse`.
//!
//! The two differ on what they accept — jsonc-parser can be told to
//! tolerate comments and trailing commas — and never on what a valid
//! document means. The options below turn every loosening off, so a file
//! this reads is a file `JSON.parse` reads.
//!
//! **The AST, not the value map.** `parse_to_value` hands back a map
//! whose iteration order is a hash order unless a cargo feature says
//! otherwise, and document order is the whole output contract here.
//! Walking the tree makes that order structural rather than something a
//! dependency's default could quietly take away.

use jsonc_parser::ast::{Object, Value as Node};
use jsonc_parser::{CollectOptions, ParseOptions, parse_to_ast};

/// The values, each with the byte offset of the source text that
/// produced it — the opening quote's content, not the quote.
///
/// The AST carries a range for every literal, so JSON needs no search to
/// place a value and can place the ones a search never finds: a resolved
/// `\n` or `\"` has no literal occurrence in the document, and on this
/// family's own repositories that was every unlocated value in the
/// largest format.
pub(crate) fn extract_spanned(text: &str) -> Vec<(String, usize)> {
    let Ok(result) = parse_to_ast(text, &CollectOptions::default(), &strict()) else {
        return Vec::new();
    };
    let Some(root) = result.value else {
        return Vec::new();
    };
    let mut values = Vec::new();
    visit_spanned(&root, &mut values);
    values
}

fn visit_spanned(node: &Node, values: &mut Vec<(String, usize)>) {
    match node {
        Node::StringLit(literal) => {
            let trimmed = super::text::trim(&literal.value);
            if !trimmed.is_empty() {
                // +1 steps past the opening quote so the column points at
                // the text rather than at the string that holds it.
                values.push((trimmed.to_string(), literal.range.start + 1));
            }
        }
        Node::Array(array) => {
            for element in &array.elements {
                visit_spanned(element, values);
            }
        }
        Node::Object(object) => {
            for property in &object.properties {
                visit_spanned(&property.value, values);
            }
        }
        _ => {}
    }
}

pub(crate) fn extract(text: &str) -> Vec<String> {
    let Ok(result) = parse_to_ast(text, &CollectOptions::default(), &strict()) else {
        // A parse failure is nothing found, matching the extension: it
        // reports the error through `onParseError` and returns an empty
        // array. The CLI surfaces that as a diagnostic on the report, so
        // an empty result is never mistaken for an empty file.
        return Vec::new();
    };
    let Some(root) = result.value else {
        return Vec::new();
    };
    let mut values = Vec::new();
    visit(&root, &mut values);
    values
}

fn strict() -> ParseOptions {
    ParseOptions {
        allow_comments: false,
        allow_loose_object_property_names: false,
        allow_trailing_commas: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
    }
}

fn visit(node: &Node, values: &mut Vec<String>) {
    match node {
        Node::StringLit(literal) => {
            // The parser has already resolved escapes, so this is the
            // text a program would see rather than the source spelling.
            let trimmed = super::text::trim(&literal.value);
            if !trimmed.is_empty() {
                values.push(trimmed.to_string());
            }
        }
        Node::Array(array) => {
            for element in &array.elements {
                visit(element, values);
            }
        }
        Node::Object(object) => visit_object(object, values),
        // Numbers, booleans and null are typed values, not text.
        _ => {}
    }
}

/// Properties in source order, values only. Dropping the name here is
/// what makes "keys are never extracted" true for every format at once.
fn visit_object(object: &Object, values: &mut Vec<String>) {
    for property in &object.properties {
        visit(&property.value, values);
    }
}

/// Why the document yielded nothing, when the reason is a parse failure.
pub(crate) fn parse_error(text: &str) -> Option<String> {
    parse_to_ast(text, &CollectOptions::default(), &strict())
        .err()
        .map(|error| format!("Invalid JSON: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn string_values_are_extracted_and_keys_are_not() {
        assert_eq!(extract(r#"{"key":"value"}"#), ["value"]);
    }

    #[test]
    fn non_string_primitives_are_dropped() {
        assert_eq!(
            extract(r#"{"a":42,"b":true,"c":null,"d":"kept"}"#),
            ["kept"]
        );
    }

    #[test]
    fn nesting_is_followed_in_document_order() {
        let document = r#"{"a":"one","b":{"c":"two","d":["three","four"]}}"#;
        assert_eq!(extract(document), ["one", "two", "three", "four"]);
    }

    /// The reason this walks the AST. A hash-ordered map would answer
    /// these in an order that changes between runs, and document order
    /// is what the report promises.
    #[test]
    fn many_keys_still_come_back_in_document_order() {
        let document = format!(
            "{{{}}}",
            (0..64)
                .map(|n| format!(r#""k{n}":"v{n}""#))
                .collect::<Vec<_>>()
                .join(",")
        );
        let expected: Vec<String> = (0..64).map(|n| format!("v{n}")).collect();
        assert_eq!(extract(&document), expected);
    }

    #[test]
    fn values_are_trimmed_and_empty_ones_dropped() {
        assert_eq!(
            extract(r#"{"a":"  padded  ","b":"","c":"   "}"#),
            ["padded"]
        );
    }

    /// Escapes are resolved by the parser, so the value is the text the
    /// program would see — not the source spelling. This is also why
    /// such a value cannot be located in the document.
    #[test]
    fn escapes_are_resolved() {
        assert_eq!(extract(r#"{"a":"first\nsecond"}"#), ["first\nsecond"]);
        assert_eq!(extract(r#"{"a":"she said \"hi\""}"#), [r#"she said "hi""#]);
    }

    /// The values and their order are the same either way; only the
    /// positions differ, and positions are outside parity scope.
    #[test]
    fn the_spanned_walk_yields_the_same_values_in_the_same_order() {
        let document = r#"{"a":"one","b":{"c":"two","d":["three","four"]}}"#;
        let spanned: Vec<String> = extract_spanned(document)
            .into_iter()
            .map(|(value, _)| value)
            .collect();
        assert_eq!(spanned, extract(document));
    }

    /// The offset points at the text, not at the quote around it.
    #[test]
    fn a_span_starts_inside_the_quotes() {
        let document = r#"{"a":"one"}"#;
        let (value, offset) = extract_spanned(document)[0].clone();
        assert_eq!(value, "one");
        assert_eq!(&document[offset..offset + value.len()], "one");
    }

    /// The whole reason JSON gets spans: a resolved escape has no
    /// literal occurrence to search for, and the span knows anyway.
    #[test]
    fn a_resolved_escape_still_has_a_span() {
        let spanned = extract_spanned(r#"{"a":"first\nsecond"}"#);
        assert_eq!(spanned[0].0, "first\nsecond");
        assert_eq!(spanned[0].1, 6);
    }

    #[test]
    fn a_broken_document_yields_nothing_and_says_why() {
        assert!(extract("{not json").is_empty());
        assert!(
            parse_error("{not json")
                .expect("a message")
                .contains("Invalid JSON")
        );
        assert!(parse_error(r#"{"a":"b"}"#).is_none());
    }

    /// The loosenings are off, so this reads what `JSON.parse` reads and
    /// nothing more.
    #[test]
    fn comments_and_trailing_commas_are_not_accepted() {
        assert!(parse_error(r#"{"a":"b"} // trailing comment"#).is_some());
        assert!(parse_error(r#"{"a":"b",}"#).is_some());
        assert!(parse_error(r"{'a':'b'}").is_some());
    }

    /// An empty document is a valid parse of nothing, not a failure.
    #[test]
    fn an_empty_object_is_not_an_error() {
        assert!(extract("{}").is_empty());
        assert!(parse_error("{}").is_none());
    }
}
