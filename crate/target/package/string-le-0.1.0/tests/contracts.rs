//! The exit codes and the stdout contract, driven against the built
//! binary.
//!
//! These are the API: a shell branches on the exit code and parses
//! stdout, so both are pinned here rather than inferred from unit tests
//! of the functions behind them. Nothing here needs a network or a
//! privileged filesystem operation, so it runs everywhere on every push.
//!
//! A new refusal adds its case here.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

const BINARY: &str = env!("CARGO_BIN_EXE_string-le");
static COUNTER: AtomicUsize = AtomicUsize::new(0);

struct Tree {
    root: PathBuf,
}

impl Tree {
    fn new(name: &str) -> Self {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "string-le-contract-{name}-{}-{unique}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("a temporary directory");
        Self {
            root: std::fs::canonicalize(&root).expect("a canonical directory"),
        }
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write(&self, relative: &str, contents: &str) -> PathBuf {
        let target = self.root.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).expect("a parent directory");
        }
        std::fs::write(&target, contents).expect("a file");
        target
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

struct Run {
    code: i32,
    stdout: String,
    stderr: String,
}

fn run(args: &[&str]) -> Run {
    let output = Command::new(BINARY)
        .args(args)
        .output()
        .expect("the binary runs");
    Run {
        code: output.status.code().expect("an exit code"),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

/// Every line of stdout, parsed. Doubles as the assertion that stdout
/// is JSON Lines and nothing else — a stray human message there would
/// fail to parse.
fn reports(run: &Run) -> Vec<serde_json::Value> {
    run.stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("stdout carries only JSON"))
        .collect()
}

/// A JSON config, a source file whose copy only the fallback finds, and
/// a binary that must be skipped rather than failed.
fn audit_tree(name: &str) -> Tree {
    let tree = Tree::new(name);
    tree.write("config.json", "{\"title\":\"Settings\",\"count\":42}\n");
    tree.write(
        "src/messages.ts",
        "const m = {\n  confirm: 'Delete this permanently?',\n  cancel: \"Never mind\",\n};\n",
    );
    tree.write("notes.md", "no quoted strings in this prose at all\n");
    tree
}

#[test]
fn a_tree_with_strings_exits_zero() {
    let tree = audit_tree("found");
    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(run.code, 0, "{}", run.stderr);
    let total: u64 = reports(&run)
        .iter()
        .filter_map(|report| report["summary"]["strings"].as_u64())
        .sum();
    assert_eq!(
        total, 3,
        "the JSON title, and both messages the fallback finds in the .ts"
    );
}

/// grep's convention, and the reason it is worth having: finding nothing
/// is an answer, not an error.
#[test]
fn a_tree_with_none_exits_one() {
    let tree = Tree::new("none");
    tree.write("docs/a.md", "nothing quoted here\n");
    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(run.code, 1);
    assert!(run.stderr.contains("0 strings"), "{}", run.stderr);
}

/// The audit case, end to end: a source file is not a format this
/// parses, and its copy comes out anyway.
#[test]
fn a_source_file_yields_its_copy_through_the_fallback() {
    let tree = audit_tree("fallback");
    let run = run(&[&tree.path().to_string_lossy()]);
    let source = reports(&run)
        .into_iter()
        .find(|report| {
            report["file"]
                .as_str()
                .is_some_and(|file| file.ends_with("messages.ts"))
        })
        .expect("the .ts file was read");
    assert_eq!(source["format"], "fallback");
    let values: Vec<&str> = source["strings"]
        .as_array()
        .expect("strings")
        .iter()
        .filter_map(|found| found["value"].as_str())
        .collect();
    assert_eq!(values, ["Delete this permanently?", "Never mind"]);
}

/// The flag that exists for the person this was built for: values alone,
/// ready to pipe.
#[test]
fn values_only_prints_values_and_no_json() {
    let tree = audit_tree("values");
    let run = run(&["--values", &tree.path().to_string_lossy()]);
    assert_eq!(run.code, 0);
    assert!(!run.stdout.contains('{'), "{}", run.stdout);
    let lines: Vec<&str> = run.stdout.lines().collect();
    assert_eq!(lines.len(), 3, "{}", run.stdout);
    assert!(lines.contains(&"Settings"), "{}", run.stdout);
}

#[test]
fn an_unreadable_input_exits_two() {
    assert_eq!(run(&["/no/such/place-xyz"]).code, 2);
}

/// A broken document is a fact about that file, not a failed run. One
/// malformed config must not fail an audit of ten thousand files.
#[test]
fn a_broken_document_warns_without_failing_the_run() {
    let tree = Tree::new("broken");
    tree.write("bad.json", "{not json\n");
    tree.write("good.json", "{\"a\":\"kept\"}\n");
    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(run.stderr.contains("Invalid JSON"), "{}", run.stderr);
}

#[test]
fn an_unknown_flag_exits_two_and_names_itself() {
    let tree = audit_tree("badflag");
    let run = run(&["--dedup", &tree.path().to_string_lossy()]);
    assert_eq!(run.code, 2);
    assert!(run.stderr.contains("--dedup"), "{}", run.stderr);
    assert!(run.stdout.is_empty(), "a refusal writes no report");
}

/// The deliberate leniency: an unknown format is the fallback, not a
/// refusal. This is the one flag value in the family that does not fail.
#[test]
fn an_unknown_format_falls_back_rather_than_exiting_two() {
    let tree = audit_tree("badformat");
    let run = run(&["--format", "klingon", &tree.path().to_string_lossy()]);
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(
        reports(&run)
            .iter()
            .all(|report| report["format"] == "fallback")
    );
}

/// The tool has no opinions about which strings matter, so there is no
/// flag that would produce one.
#[test]
fn no_flag_asks_for_a_judgment() {
    let tree = audit_tree("nojudgment");
    for attempt in [
        "--user-facing",
        "--spellcheck",
        "--min-length",
        "--lang",
        "--fix",
    ] {
        assert_eq!(
            run(&[attempt, &tree.path().to_string_lossy()]).code,
            2,
            "{attempt} was accepted"
        );
    }
}

#[test]
fn dedupe_collapses_repeats() {
    let tree = Tree::new("dedupe");
    tree.write("a.json", "{\"a\":\"same\",\"b\":\"same\"}\n");
    let kept: u64 = reports(&run(&[&tree.path().to_string_lossy()]))[0]["summary"]["strings"]
        .as_u64()
        .expect("a count");
    let deduped: u64 =
        reports(&run(&["--dedupe", &tree.path().to_string_lossy()]))[0]["summary"]["strings"]
            .as_u64()
            .expect("a count");
    assert_eq!((kept, deduped), (2, 1));
}

/// The count that says whether the positions are a complete index.
#[test]
fn values_the_source_does_not_spell_are_reported_as_unlocated() {
    let tree = Tree::new("unlocated");
    tree.write("a.json", "{\"a\":\"first\\nsecond\"}\n");
    let run = run(&[&tree.path().to_string_lossy()]);
    assert_eq!(reports(&run)[0]["summary"]["unlocated"], 1);
    assert!(
        run.stderr.contains("could not be located"),
        "{}",
        run.stderr
    );
}

#[test]
fn version_and_help_exit_clear() {
    let version = run(&["--version"]);
    assert_eq!(version.code, 0);
    assert!(version.stdout.contains("string-le"));
    let help = run(&["--help"]);
    assert_eq!(help.code, 0);
    assert!(help.stdout.contains("usage: string-le"));
    assert!(
        help.stdout.contains("grep"),
        "the exit convention is stated"
    );
}

#[test]
fn stdout_carries_only_reports_and_stderr_only_the_summary() {
    let tree = audit_tree("streams");
    let run = run(&[&tree.path().to_string_lossy()]);
    assert!(!reports(&run).is_empty());
    assert!(!run.stderr.contains('{'), "{}", run.stderr);
    assert!(run.stderr.contains("strings in"), "{}", run.stderr);
}

#[test]
fn a_document_on_stdin_is_scanned() {
    let mut child = Command::new(BINARY)
        .args(["--stdin", "--format", "json"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(br#"{"a":"from stdin"}"#)
        .expect("written");
    let output = child.wait_with_output().expect("finishes");
    assert_eq!(output.status.code(), Some(0));
    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout carries JSON");
    assert_eq!(report["file"], "<stdin>");
    assert_eq!(report["strings"][0]["value"], "from stdin");
}

/// stdin with no format is the fallback, not a refusal — there is no
/// name to infer from and that is an ordinary situation here.
#[test]
fn stdin_without_a_format_falls_back() {
    let mut child = Command::new(BINARY)
        .args(["--stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(b"const a = 'copy';")
        .expect("written");
    let output = child.wait_with_output().expect("finishes");
    assert_eq!(output.status.code(), Some(0));
    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout carries JSON");
    assert_eq!(report["format"], "fallback");
    assert_eq!(report["strings"][0]["value"], "copy");
}

/// **The cross-surface contract.** Both surfaces call one entry point,
/// so they must answer identically for the same tree.
#[test]
fn the_cli_and_the_mcp_server_report_the_same_thing() {
    let tree = audit_tree("agreement");
    let cli = run(&[&tree.path().to_string_lossy()]);
    let from_cli = reports(&cli);

    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "string_le_scan",
            "arguments": { "path": tree.path().to_string_lossy() },
        },
    });
    let mut child = Command::new(BINARY)
        .arg("mcp")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the server starts");
    writeln!(child.stdin.as_mut().expect("stdin"), "{request}").expect("written");
    let output = child.wait_with_output().expect("finishes");
    let response: serde_json::Value = serde_json::from_slice(
        output
            .stdout
            .split(|byte| *byte == b'\n')
            .next()
            .expect("a line"),
    )
    .expect("the reply is JSON");

    let from_mcp = response["result"]["structuredContent"]["data"]["reports"]
        .as_array()
        .expect("reports")
        .clone();
    assert_eq!(from_mcp, from_cli, "the two surfaces disagree");
}
