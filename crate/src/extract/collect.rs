//! The one rule every parsed format shares.
//!
//! Ported from the extension's `collectStrings`. JSON, YAML, TOML and
//! INI each parse with their own library and then hand the result here,
//! so "what counts as a string" is answered once rather than four times.

/// The extension's depth cap, ported with its value. It exists to stop a
/// deeply nested document from overflowing the stack, and stopping
/// silently is what the extension does — a document 1000 levels deep is
/// not a document anyone is auditing.
const MAX_RECURSION_DEPTH: usize = 1000;

/// A parsed document, in the shape every parser here is normalised into.
///
/// Deliberately not `serde_json::Value`: TOML dates and YAML's typed
/// scalars are neither strings nor JSON primitives, and flattening them
/// into one would decide the very question this module exists to answer.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Value {
    /// Text. The only variant that produces output.
    Str(String),
    /// A number, boolean, null, date, or anything else with a type of
    /// its own. Dropped.
    Other,
    Seq(Vec<Value>),
    Map(Vec<Value>),
}

/// Collect string leaves, in document order.
///
/// - keys are never collected, only values — the caller passes values in
/// - non-string leaves are dropped: in a typed format a bare `42` is a
///   number and a TOML date is a date
/// - values are trimmed, and empty or whitespace-only values dropped
///
/// The untyped line formats are the exception, and they handle it before
/// they get here: INI and `.env` parse every value as text, so a
/// numeric-looking value arrives as `Str` and is collected.
pub(crate) fn collect(value: &Value) -> Vec<String> {
    let mut out = Vec::new();
    walk(value, &mut out, 0);
    out
}

fn walk(value: &Value, out: &mut Vec<String>, depth: usize) {
    if depth > MAX_RECURSION_DEPTH {
        return;
    }
    match value {
        Value::Str(text) => {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                out.push(trimmed.to_string());
            }
        }
        Value::Seq(items) | Value::Map(items) => {
            for item in items {
                walk(item, out, depth + 1);
            }
        }
        Value::Other => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(text: &str) -> Value {
        Value::Str(text.to_string())
    }

    #[test]
    fn a_string_leaf_is_collected() {
        assert_eq!(collect(&s("hello")), ["hello"]);
    }

    #[test]
    fn a_typed_leaf_is_dropped() {
        assert!(collect(&Value::Other).is_empty());
    }

    #[test]
    fn values_are_trimmed_and_empty_ones_dropped() {
        assert_eq!(collect(&s("  padded  ")), ["padded"]);
        assert!(collect(&s("   ")).is_empty());
        assert!(collect(&s("")).is_empty());
    }

    #[test]
    fn nesting_is_walked_in_document_order() {
        let document = Value::Map(vec![
            s("first"),
            Value::Seq(vec![s("second"), Value::Other, s("third")]),
            Value::Map(vec![s("fourth")]),
        ]);
        assert_eq!(collect(&document), ["first", "second", "third", "fourth"]);
    }

    /// Duplicates are values too. Collapsing them here would make
    /// `--dedupe` unable to be opt-in.
    #[test]
    fn repeats_are_kept() {
        let document = Value::Seq(vec![s("same"), s("same")]);
        assert_eq!(collect(&document), ["same", "same"]);
    }

    /// Deeper than the cap stops, and stops quietly — the extension's
    /// behaviour, ported with its value.
    #[test]
    fn recursion_stops_at_the_cap() {
        let mut deep = s("bottom");
        for _ in 0..(MAX_RECURSION_DEPTH + 10) {
            deep = Value::Seq(vec![deep]);
        }
        assert!(collect(&deep).is_empty());
    }

    #[test]
    fn just_inside_the_cap_still_answers() {
        let mut deep = s("bottom");
        for _ in 0..(MAX_RECURSION_DEPTH - 1) {
            deep = Value::Seq(vec![deep]);
        }
        assert_eq!(collect(&deep), ["bottom"]);
    }
}
