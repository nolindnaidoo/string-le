//! `extract_strings` — the tool **both** servers offer.
//!
//! The npm server (`src/mcp/tools.ts`) and this one are meant to be the
//! same tool, not two similar ones: same schema, same envelope,
//! byte-identical output. `fixtures/mcp-extract-strings.json` runs against
//! both, so changing one without the other fails a build.
//!
//! It touches no filesystem. An agent already has file-read tools;
//! duplicating them here would add a path-traversal surface for no
//! capability. The tool that needs a filesystem is `string_le_scan`.

use serde_json::{Value, json};

use crate::extract::{self, Options, SUPPORTED_FORMATS, resolve_format};

const DEFAULT_MAX_RESULTS: usize = 500;
const MAX_MAX_RESULTS: usize = 5000;

pub(crate) fn definition() -> Value {
    json!({
        "name": "extract_strings",
        "description": "Extract every string value from a document. Parses JSON, YAML, CSV, \
                        TOML, INI and dotenv; for any other format it falls back to quoted \
                        strings — single, double or backtick — so a format is optional but \
                        unquoted prose yields nothing. Returns the values themselves, in \
                        document order, not their positions.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": { "type": "string", "description": "The document text to scan." },
                "format": {
                    "type": "string",
                    "enum": SUPPORTED_FORMATS,
                    "description": "Document format. Optional — an unrecognised or absent \
                                    format falls back to extracting quoted strings.",
                },
                "filename": {
                    "type": "string",
                    "description": "Filename used to infer the format when `format` is absent, \
                                    e.g. \"config.toml\".",
                },
                "dedupe": {
                    "type": "boolean",
                    "default": false,
                    "description": "Collapse repeated values to their first occurrence.",
                },
                "maxResults": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_MAX_RESULTS,
                    "default": DEFAULT_MAX_RESULTS,
                    "description": format!(
                        "Cap on returned values (default {DEFAULT_MAX_RESULTS}). meta.truncated \
                         reports whether any were dropped."
                    ),
                },
            },
            "required": ["content"],
            "additionalProperties": false,
        },
    })
}

pub(crate) fn run(arguments: &Value) -> Result<Value, String> {
    let content = arguments
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| "content is required and must be a string".to_string())?;
    let max_results = read_max_results(arguments)?;

    // Never a refusal. An agent that knows nothing about a document
    // still gets its quoted strings, which is the whole reason a format
    // is optional here where it is required in the sibling tools.
    let format = resolve_format(
        arguments.get("format").and_then(Value::as_str),
        arguments.get("filename").and_then(Value::as_str),
    );

    let mut values: Vec<Value> = extract::extract(content, format, Options::default())
        .into_iter()
        .map(Value::String)
        .collect();

    if arguments.get("dedupe").and_then(Value::as_bool) == Some(true) {
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        values.retain(|value| seen.insert(value.as_str().unwrap_or_default().to_string()));
    }

    // The `truncated` flag matters more than the cap: a silently
    // incomplete answer is wrong in the most expensive way, and this is
    // a tool whose whole job is completeness.
    let truncated = values.len() > max_results;
    values.truncate(max_results);

    let count = values.len();
    Ok(super::envelope(
        "extract_strings",
        &json!({ "strings": values, "fileType": format }),
        count,
        &parse_diagnostics(content, format),
        truncated,
    ))
}

/// Why the document yielded nothing, when the reason is a parse failure.
///
/// The npm server reports this through its diagnostic sink, so leaving
/// it out here made one tool answer two ways: an agent reaching this
/// server got `ok: true` and an empty list for a broken document — a
/// clean result that never ran — where the other server said the
/// document could not be read and why.
///
/// The severity and the code are the contract. The message tail is the
/// parser's: jsonc-parser and `JSON.parse` are different programs and
/// word the same failure differently, so both sides promise the
/// `Invalid JSON: ` prefix and neither promises what follows it. See
/// SPEC.md, "Where this deliberately differs".
fn parse_diagnostics(content: &str, format: &str) -> Vec<Value> {
    extract::parse_error(content, format)
        .map(|message| json!({ "severity": "error", "code": "parsing", "message": message }))
        .into_iter()
        .collect()
}

/// Clamp quietly, reject loudly — the npm server's asymmetry.
fn read_max_results(arguments: &Value) -> Result<usize, String> {
    let Some(raw) = arguments.get("maxResults") else {
        return Ok(DEFAULT_MAX_RESULTS);
    };
    let invalid = "maxResults must be a positive integer".to_string();
    let value = raw.as_u64().ok_or(invalid.clone())?;
    if value < 1 {
        return Err(invalid);
    }
    Ok(usize::try_from(value)
        .unwrap_or(MAX_MAX_RESULTS)
        .min(MAX_MAX_RESULTS))
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;
    use crate::extract::FALLBACK_FORMAT;
    use crate::extract::corpus::document;

    const CASES: &str = include_str!("../../fixtures/mcp-extract-strings.json");

    #[derive(Debug, Deserialize)]
    struct Case {
        name: String,
        file: Option<String>,
        content: Option<String>,
        arguments: Value,
        expected: Option<Value>,
        #[serde(rename = "expectedError")]
        expected_error: Option<String>,
    }

    #[test]
    fn every_shared_case_answers_identically() {
        let cases: Vec<Case> = serde_json::from_str(CASES).expect("the corpus is valid JSON");
        assert!(!cases.is_empty(), "the corpus is empty");

        for case in cases {
            let mut arguments = case.arguments.clone();
            let content = case
                .file
                .as_deref()
                .map(document)
                .map(str::to_string)
                .or(case.content);
            if let Some(content) = content {
                arguments["content"] = json!(content);
            }

            match (case.expected, case.expected_error) {
                (_, Some(expected)) => {
                    assert_eq!(
                        run(&arguments).expect_err(&case.name),
                        expected,
                        "{}",
                        case.name
                    );
                }
                (Some(expected), None) => {
                    assert_eq!(
                        run(&arguments).expect(&case.name),
                        expected,
                        "{}",
                        case.name
                    );
                }
                (None, None) => panic!("{} pins neither a result nor an error", case.name),
            }
        }
    }

    #[test]
    fn the_tool_name_is_pinned() {
        assert_eq!(definition()["name"], "extract_strings");
    }

    #[test]
    fn the_advertised_enum_matches_the_formats_that_resolve() {
        let definition = definition();
        let advertised: Vec<String> = definition["inputSchema"]["properties"]["format"]["enum"]
            .as_array()
            .expect("an enum")
            .iter()
            .filter_map(|value| value.as_str().map(str::to_string))
            .collect();
        assert_eq!(advertised, SUPPORTED_FORMATS);
    }

    /// The contract two servers hold: values, not positions. A field
    /// here would be a silent break of the tool's own description.
    #[test]
    fn the_shared_tool_returns_bare_values() {
        let result =
            run(&json!({ "content": "{\"a\":\"one\"}", "format": "json" })).expect("a result");
        assert_eq!(result["data"]["strings"][0], "one");
        assert!(result["data"]["strings"][0].is_string());
    }

    /// An unresolved format is a fallback, never a refusal — the one
    /// place this family is deliberately lenient.
    #[test]
    fn an_unknown_format_falls_back_rather_than_failing() {
        let result =
            run(&json!({ "content": "const a = 'x';", "format": "nonsense" })).expect("a result");
        assert_eq!(result["data"]["fileType"], FALLBACK_FORMAT);
        assert_eq!(result["data"]["strings"][0], "x");
    }

    /// One tool, two servers. A broken document has to answer the same
    /// way on both: the check did not run, and here is why. Reporting
    /// `ok: true` with an empty list is a clean result that never ran.
    #[test]
    fn a_broken_document_is_reported_rather_than_answered_empty() {
        let result = run(&json!({ "content": "{not json", "format": "json" })).expect("a result");
        assert_eq!(result["ok"], false);
        assert_eq!(
            result["data"]["strings"]
                .as_array()
                .expect("an array")
                .len(),
            0
        );
        assert_eq!(result["diagnostics"][0]["severity"], "error");
        assert_eq!(result["diagnostics"][0]["code"], "parsing");
        assert!(
            result["diagnostics"][0]["message"]
                .as_str()
                .expect("a message")
                .starts_with("Invalid JSON: "),
            "the prefix is the shared half of the message: {}",
            result["diagnostics"][0]["message"]
        );
    }

    /// A source language has no shape it can reject, so it never carries
    /// a parse diagnostic — and an unterminated literal is a document
    /// that yielded nothing, not a document that failed.
    #[test]
    fn a_source_language_never_reports_a_parse_failure() {
        let result =
            run(&json!({ "content": "let s = r#\"never closed", "format": "rust" })).expect("ok");
        assert_eq!(result["ok"], true);
        assert_eq!(result["diagnostics"].as_array().expect("an array").len(), 0);
        assert_eq!(
            result["data"]["strings"]
                .as_array()
                .expect("an array")
                .len(),
            0
        );
    }

    #[test]
    fn a_fractional_cap_is_refused() {
        let error = run(&json!({ "content": "x", "maxResults": 1.5 })).expect_err("a refusal");
        assert_eq!(error, "maxResults must be a positive integer");
    }
}
