//! The agent surface: the same extraction over the Model Context
//! Protocol on stdio, so a model can ask for the URLs rather than be
//! handed the files and pattern-match them itself.
//!
//! Two rules the family's MCP surfaces established:
//!
//! - **An empty answer is not an error.** A document with no URLs comes
//!   back as an ordinary result carrying `ok: true` — the scan ran.
//!   Only a malformed question is a protocol error.
//! - **Refusals speak the caller's vocabulary.** An MCP caller has no
//!   command line, so no message here mentions a flag.
//!
//! Read-only by construction: nothing on this surface writes, so unlike
//! pixelactions there is no consent gate to design.

pub(crate) mod extract;

use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use serde_json::{Value, json};

use crate::extract::{Options, resolve_format};
use crate::scan::{self, ScanOptions};
use crate::walk::{self, WalkOptions};

const PROTOCOL_VERSION: &str = "2025-06-18";

/// JSON-RPC error codes, from the spec.
const INVALID_PARAMS: i64 = -32602;
const METHOD_NOT_FOUND: i64 = -32601;

pub(crate) fn serve() -> ExitCode {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            return ExitCode::from(2);
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(request) = serde_json::from_str::<Value>(&line) else {
            // A frame that is not JSON has no id to answer against;
            // dropping it is the only honest option.
            continue;
        };
        let Some(response) = handle(&request) else {
            continue; // a notification: no reply
        };
        if writeln!(stdout, "{response}").is_err() || stdout.flush().is_err() {
            return ExitCode::from(2);
        }
    }
    ExitCode::SUCCESS
}

fn handle(request: &Value) -> Option<Value> {
    let id = request.get("id").cloned();
    let method = request.get("method")?.as_str()?;
    // Notifications carry no id and get no reply.
    id.as_ref()?;

    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "string-le", "version": env!("CARGO_PKG_VERSION") },
        })),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => call_tool(request.get("params")),
        "ping" => Ok(json!({})),
        other => Err((
            METHOD_NOT_FOUND,
            format!("this server does not implement {other}"),
        )),
    };

    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, message)) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": code, "message": message },
        }),
    })
}

fn tool_definitions() -> Value {
    json!([
        extract::definition(),
        {
            "name": "string_le_scan",
            "description": "Extract every string value from files or directories, with the \
                            file it came from and, where it can be located, its line and \
                            column. Reads the filesystem; never writes to it, and never judges \
                            a string.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "a file or directory to read" },
                    "paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "several files or directories, instead of `path`",
                    },
                    "format": {
                        "type": "string",
                        "description": "Force a format for every file instead of inferring one \
                                        per file name. An unrecognised name falls back to \
                                        quoted strings.",
                    },
                    "dedupe": {
                        "type": "boolean",
                        "default": false,
                        "description": "Collapse repeated values to their first occurrence.",
                    },
                    "hidden": {
                        "type": "boolean",
                        "default": false,
                        "description": "Walk hidden files and directories too.",
                    },
                    "ignored": {
                        "type": "boolean",
                        "default": false,
                        "description": "Walk files excluded by .gitignore too.",
                    },
                },
            },
        },
    ])
}

/// Protocol failures (no tool named, an unknown tool) are JSON-RPC
/// errors; a tool that fails on its arguments returns a result carrying
/// `isError`, so a model reads the reason and reacts rather than
/// concluding the server is broken. Same rule as the npm server.
fn call_tool(params: Option<&Value>) -> Result<Value, (i64, String)> {
    let params = params.ok_or((INVALID_PARAMS, "no tool call was supplied".to_string()))?;
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or((INVALID_PARAMS, "the tool call named no tool".to_string()))?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    match name {
        "extract_strings" => Ok(match extract::run(&arguments) {
            Ok(result) => tool_result(&result),
            Err(message) => tool_failure(&message),
        }),
        "string_le_scan" => Ok(match scan_tool(&arguments) {
            Ok(result) => tool_result(&result),
            Err(message) => tool_failure(&message),
        }),
        other => Err((
            INVALID_PARAMS,
            format!("this server offers no tool named {other}"),
        )),
    }
}

fn scan_tool(arguments: &Value) -> Result<Value, String> {
    let inputs = requested_paths(arguments)?;
    let flag = |name: &str| {
        arguments
            .get(name)
            .and_then(Value::as_bool)
            .unwrap_or(false)
    };
    let walk_options = WalkOptions {
        hidden: flag("hidden"),
        respect_ignore: !flag("ignored"),
    };
    let options = ScanOptions {
        dedupe: flag("dedupe"),
        extract: Options::default(),
        format: arguments
            .get("format")
            .and_then(Value::as_str)
            .map(|name| resolve_format(Some(name), None)),
    };

    let targets = walk::collect(&inputs, &walk_options)?;
    let reports: Vec<Value> = targets
        .iter()
        .filter_map(|target| scan::scan_file(target, options))
        .map(|report| serde_json::to_value(report).expect("a report serializes"))
        .collect();

    let strings: u64 = reports
        .iter()
        .map(|report| report["summary"]["strings"].as_u64().unwrap_or(0))
        .sum();
    let unlocated: u64 = reports
        .iter()
        .map(|report| report["summary"]["unlocated"].as_u64().unwrap_or(0))
        .sum();

    let mut diagnostics: Vec<Value> = reports
        .iter()
        .filter(|report| {
            report["diagnostics"]
                .as_array()
                .is_some_and(|list| list.iter().any(|d| d["severity"] == "error"))
        })
        .map(|report| {
            warning(
                "unreadable",
                &format!(
                    "{} could not be read, so this scan does not cover it",
                    report["file"].as_str().unwrap_or("a file")
                ),
            )
        })
        .collect();
    if unlocated > 0 {
        // A model treating these positions as a complete index needs to
        // know how much of it is not one.
        diagnostics.push(warning(
            "unlocated",
            &format!("{unlocated} values could not be located in their source"),
        ));
    }

    let count = reports.len();
    Ok(envelope(
        "string_le_scan",
        &json!({ "reports": reports, "strings": strings }),
        count,
        &diagnostics,
        false,
    ))
}

fn requested_paths(arguments: &Value) -> Result<Vec<PathBuf>, String> {
    if let Some(path) = arguments.get("path").and_then(Value::as_str) {
        return Ok(vec![PathBuf::from(path)]);
    }
    if let Some(items) = arguments.get("paths").and_then(Value::as_array) {
        let paths: Vec<PathBuf> = items
            .iter()
            .filter_map(|item| item.as_str().map(PathBuf::from))
            .collect();
        if paths.is_empty() {
            return Err("the list of paths was empty".to_string());
        }
        return Ok(paths);
    }
    Err("no file or directory was supplied to read".to_string())
}

/// The one result shape every tool returns, matching the npm server's
/// envelope field for field: `{ ok, data, diagnostics, meta }`.
///
/// **`ok` reports whether the check ran, not whether the answer is
/// yes.** A file full of broken paths is the answer, not a failure to
/// produce one — conflating the two would have a model report a broken
/// tool when what it actually learned is that the paths are wrong.
pub(crate) fn envelope(
    tool: &str,
    data: &Value,
    count: usize,
    diagnostics: &[Value],
    truncated: bool,
) -> Value {
    let ok = !diagnostics
        .iter()
        .any(|diagnostic| diagnostic["severity"].as_str() == Some("error"));
    json!({
        "ok": ok,
        "data": data,
        "diagnostics": diagnostics,
        "meta": { "tool": tool, "count": count, "truncated": truncated },
    })
}

/// An MCP tool result: the envelope as text (what a model reads) and
/// the same envelope structured. Identical to what the npm server
/// emits, so a caller diffing the two servers finds nothing.
fn tool_result(envelope: &Value) -> Value {
    let text = serde_json::to_string_pretty(envelope).expect("an envelope serializes");
    json!({
        "content": [{ "type": "text", "text": text }],
        "structuredContent": envelope,
        "isError": false,
    })
}

fn warning(code: &str, message: &str) -> Value {
    json!({ "severity": "warning", "code": code, "message": message })
}

/// The tool could not run on the arguments given. `isError` so a model
/// reads the message and corrects itself.
fn tool_failure(message: &str) -> Value {
    json!({
        "content": [{ "type": "text", "text": message }],
        "isError": true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempTree;

    fn request(method: &str, params: &Value) -> Value {
        json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
    }

    fn call(name: &str, arguments: &Value) -> Value {
        handle(&request(
            "tools/call",
            &json!({ "name": name, "arguments": arguments }),
        ))
        .expect("a reply")
    }

    #[test]
    fn initialize_answers_with_the_protocol_version() {
        let response = handle(&request("initialize", &json!({}))).expect("a reply");
        assert_eq!(response["result"]["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(response["result"]["serverInfo"]["name"], "string-le");
    }

    #[test]
    fn tools_list_offers_both_tools() {
        let response = handle(&request("tools/list", &json!({}))).expect("a reply");
        let tools = response["result"]["tools"].as_array().expect("tools");
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        assert_eq!(names, ["extract_strings", "string_le_scan"]);
    }

    #[test]
    fn a_notification_gets_no_reply() {
        let notification = json!({ "jsonrpc": "2.0", "method": "initialized" });
        assert!(handle(&notification).is_none());
    }

    #[test]
    fn an_unknown_method_is_a_protocol_error() {
        let response = handle(&request("does/not/exist", &json!({}))).expect("a reply");
        assert_eq!(response["error"]["code"], METHOD_NOT_FOUND);
    }

    #[test]
    fn an_unknown_tool_is_a_protocol_error() {
        let response = call("string_le_translate", &json!({}));
        assert_eq!(response["error"]["code"], INVALID_PARAMS);
    }

    /// A bad argument is the tool failing on what it was given, not the
    /// server breaking — so it comes back as a result carrying isError.
    #[test]
    fn a_missing_argument_is_a_tool_failure_not_a_protocol_error() {
        let response = call("string_le_scan", &json!({}));
        assert!(response.get("error").is_none(), "{response}");
        assert_eq!(response["result"]["isError"], true);
        assert!(
            response["result"]["content"][0]["text"]
                .as_str()
                .expect("a message")
                .contains("no file or directory")
        );
    }

    #[test]
    fn the_shared_tool_is_offered_and_answers() {
        let response = call(
            "extract_strings",
            &json!({ "content": "{\"a\":\"one\"}", "format": "json" }),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(envelope["meta"]["tool"], "extract_strings");
        assert_eq!(envelope["data"]["strings"][0], "one");
        assert_eq!(envelope["ok"], true);
        assert_eq!(response["result"]["isError"], false);
    }

    /// The contract two servers hold: bare values, in document order,
    /// and no positions. A position here would break the tool's own
    /// description on the npm side.
    #[test]
    fn the_shared_tool_returns_values_without_positions() {
        let response = call(
            "extract_strings",
            &json!({ "content": "{\"a\":\"one\"}", "format": "json" }),
        );
        let value = &response["result"]["structuredContent"]["data"]["strings"][0];
        assert!(value.is_string(), "{value}");
        assert!(value.get("line").is_none(), "a position appeared");
    }

    /// The shared tool reaches no filesystem — that is the property that
    /// lets an agent call it anywhere, and it must not regress.
    #[test]
    fn the_shared_tool_needs_no_filesystem() {
        let response = call(
            "extract_strings",
            &json!({ "content": "const p = '/definitely/not/here';" }),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(envelope["data"]["strings"][0], "/definitely/not/here");
        assert!(
            envelope["data"].get("exists").is_none(),
            "a field like this means it looked"
        );
    }

    /// The leniency that makes this tool pointable at anything: an
    /// unresolved format is the quoted-string extractor, not a refusal.
    #[test]
    fn an_unknown_format_falls_back_rather_than_failing() {
        let response = call(
            "extract_strings",
            &json!({ "content": "const a = 'copy';", "format": "typescript" }),
        );
        assert_eq!(response["result"]["isError"], false);
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(envelope["data"]["fileType"], "fallback");
        assert_eq!(envelope["data"]["strings"][0], "copy");
    }

    /// An empty answer is the scan running and finding nothing, not the
    /// tool breaking.
    #[test]
    fn a_document_with_no_strings_is_an_ordinary_result() {
        let response = call(
            "extract_strings",
            &json!({ "content": "nothing quoted here" }),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(envelope["ok"], true);
        assert_eq!(envelope["meta"]["count"], 0);
    }

    #[test]
    fn the_scan_tool_reports_what_it_found() {
        let tree = TempTree::new("mcp-scan");
        tree.write("src/a.ts", "const m = 'Delete this?';\n");
        let response = call(
            "string_le_scan",
            &json!({ "path": tree.path().to_string_lossy() }),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(envelope["ok"], true);
        assert_eq!(envelope["data"]["strings"], 1);
    }

    /// The scan tool does carry positions — it read the files, so it
    /// knows where they were.
    #[test]
    fn the_scan_tool_carries_positions() {
        let tree = TempTree::new("mcp-positions");
        tree.write("a.json", "{\"a\":\"one\"}\n");
        let response = call(
            "string_le_scan",
            &json!({ "path": tree.path().to_string_lossy() }),
        );
        let found = &response["result"]["structuredContent"]["data"]["reports"][0]["strings"][0];
        assert_eq!(found["value"], "one");
        assert_eq!(found["line"], 1);
    }

    #[test]
    fn the_scan_tool_dedupes_on_request() {
        let tree = TempTree::new("mcp-dedupe");
        tree.write("a.json", "{\"a\":\"same\",\"b\":\"same\"}\n");
        let path = tree.path().to_string_lossy().to_string();
        let kept = call("string_le_scan", &json!({ "path": path }));
        assert_eq!(kept["result"]["structuredContent"]["data"]["strings"], 2);
        let deduped = call("string_le_scan", &json!({ "path": path, "dedupe": true }));
        assert_eq!(deduped["result"]["structuredContent"]["data"]["strings"], 1);
    }

    /// Refusals speak the caller's vocabulary: an MCP caller has no
    /// command line, so no message may name a flag.
    #[test]
    fn no_message_mentions_a_command_line_flag() {
        let definitions = serde_json::to_string(&tool_definitions()).expect("serializes");
        assert!(!definitions.contains("--"), "{definitions}");

        let tree = TempTree::new("mcp-vocabulary");
        tree.write("a.json", "{\"a\":\"one\"}\n");
        for arguments in [
            json!({}),
            json!({ "paths": [] }),
            json!({ "path": "/no/such/place-xyz" }),
            json!({ "path": tree.path().to_string_lossy(), "spellcheck": true }),
        ] {
            let rendered =
                serde_json::to_string(&call("string_le_scan", &arguments)).expect("serializes");
            assert!(!rendered.contains("--"), "{rendered}");
        }
    }

    /// Every tool returns the same envelope, so a caller writes one
    /// reader for all of them and for both servers.
    #[test]
    fn every_tool_returns_the_same_envelope_shape() {
        let tree = TempTree::new("mcp-envelope");
        tree.write("a.md", "x");
        let results = [
            call(
                "extract_strings",
                &json!({ "content": "x", "format": "markdown" }),
            ),
            call(
                "string_le_scan",
                &json!({ "path": tree.path().to_string_lossy() }),
            ),
        ];
        for result in results {
            let envelope = &result["result"]["structuredContent"];
            assert!(envelope["ok"].is_boolean(), "{envelope}");
            assert!(!envelope["data"].is_null(), "{envelope}");
            assert!(envelope["diagnostics"].is_array(), "{envelope}");
            assert!(envelope["meta"]["tool"].is_string(), "{envelope}");
            assert!(envelope["meta"]["count"].is_number(), "{envelope}");
            assert!(envelope["meta"]["truncated"].is_boolean(), "{envelope}");
        }
    }
}
