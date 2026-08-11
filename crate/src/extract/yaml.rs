//! YAML, read with `saphyr` where the extension reads with `js-yaml`.
//!
//! Both are YAML 1.2 with the core schema, which is what keeps them
//! agreeing on the question that matters here: **which scalars are
//! strings**. YAML 1.1 resolved `yes`, `no`, `on` and `off` as booleans;
//! neither of these does, so those stay strings in both. `js-yaml`'s
//! `loadAll` is what handles a multi-document file, and `load_from_str`
//! returns the same list.

use saphyr::{LoadableYamlNode, Yaml};

use super::collect::{Value, collect};

pub(crate) fn extract(text: &str) -> Vec<String> {
    let Ok(documents) = Yaml::load_from_str(text) else {
        return Vec::new();
    };
    collect(&Value::Seq(documents.iter().map(convert).collect()))
}

fn convert(value: &Yaml<'_>) -> Value {
    match value {
        Yaml::Value(scalar) => scalar
            .as_str()
            .map_or(Value::Other, |text| Value::Str(text.to_string())),
        Yaml::Sequence(items) => Value::Seq(items.iter().map(convert).collect()),
        // Keys are dropped here, which is what makes "keys are never
        // extracted" true for every format at once.
        Yaml::Mapping(entries) => Value::Map(entries.values().map(convert).collect()),
        _ => Value::Other,
    }
}

pub(crate) fn parse_error(text: &str) -> Option<String> {
    Yaml::load_from_str(text)
        .err()
        .map(|error| format!("Invalid YAML: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_quoted_and_single_quoted_scalars_are_all_values() {
        let document = "a: Unquoted plain\nb: \"Double quoted\"\nc: 'Single quoted'";
        assert_eq!(
            extract(document),
            ["Unquoted plain", "Double quoted", "Single quoted"]
        );
    }

    #[test]
    fn keys_are_never_extracted() {
        assert_eq!(extract("title: value"), ["value"]);
    }

    #[test]
    fn typed_scalars_are_dropped() {
        assert_eq!(extract("n: 42\nb: true\nz: null\ns: kept"), ["kept"]);
    }

    #[test]
    fn sequences_and_inline_maps_are_followed() {
        let document = "list:\n  - plain\n  - \"quoted\"\ninline: { k: \"in\", p: bare }";
        assert_eq!(extract(document), ["plain", "quoted", "in", "bare"]);
    }

    /// A block scalar is one value with real newlines, which is also why
    /// it cannot be located in the source.
    #[test]
    fn a_block_scalar_is_one_value() {
        assert_eq!(extract("b: |\n  first\n  second\n"), ["first\nsecond"]);
    }

    #[test]
    fn a_folded_scalar_is_joined() {
        assert_eq!(extract("f: >\n  folded text\n"), ["folded text"]);
    }

    /// `loadAll` reads every document in the file, and so does this.
    #[test]
    fn every_document_in_the_file_is_read() {
        assert_eq!(extract("a: first\n---\nb: second\n"), ["first", "second"]);
    }

    /// YAML 1.1 made these booleans; 1.2 core does not, and neither
    /// frontend does. A scalar that changed type here would silently
    /// change what a reviewer sees.
    #[test]
    fn yes_and_no_are_strings_not_booleans() {
        assert_eq!(
            extract("a: yes\nb: no\nc: on\nd: off"),
            ["yes", "no", "on", "off"]
        );
    }

    #[test]
    fn a_broken_document_yields_nothing_and_says_why() {
        assert!(extract("a: [unterminated").is_empty());
        assert!(parse_error("a: [unterminated").is_some());
        assert!(parse_error("a: b").is_none());
    }
}
