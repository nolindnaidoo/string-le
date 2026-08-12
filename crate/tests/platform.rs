//! What differs by operating system, asserted rather than hoped.
//!
//! Every case here is something that was true on the machine the code
//! was written on and false somewhere else. A sibling crate shipped a
//! release writing `\` into its reports because nothing said otherwise,
//! and a stdin test in this family went red on a race between a write
//! and the refusal it was asserting.
//!
//! Runs on macOS, Windows and Linux. Where a platform cannot express a
//! case it is **skipped by name**, never passed in silence.

use std::fmt::Write as _;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

const BINARY: &str = env!("CARGO_BIN_EXE_string-le");
static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn skipped(case: &str, why: &str) {
    eprintln!("SKIPPED {case}: {why}");
}

struct Tree {
    root: PathBuf,
}

impl Tree {
    fn new(name: &str) -> Self {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "string-le-platform-{name}-{}-{unique}",
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

    fn arg(&self) -> String {
        self.root.to_string_lossy().into_owned()
    }

    fn write(&self, relative: &str, contents: &str) {
        let target = self.root.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).expect("a parent directory");
        }
        std::fs::write(&target, contents).expect("a file");
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
    let output = Command::new(BINARY).args(args).output().expect("it runs");
    Run {
        code: output.status.code().expect("an exit code, not a signal"),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

fn reported_files(run: &Run) -> Vec<String> {
    run.stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str::<serde_json::Value>(line).expect("JSON Lines"))
        .filter_map(|report| report["file"].as_str().map(str::to_string))
        .collect()
}

/// stdout is protocol, and a report written on Windows is read on a
/// Linux runner — a pipeline grepping for `src/ui/messages.ts` matches
/// nothing that `src\ui\messages.ts` matches. envsync-le shipped a
/// release doing exactly that.
#[test]
fn every_path_in_the_report_uses_a_forward_slash() {
    let tree = Tree::new("separators");
    tree.write("src/ui/messages.ts", "const m = 'Delete this?';\n");
    tree.write("config/app/settings.json", "{\"a\":\"value\"}\n");

    let run = run(&[&tree.arg()]);
    assert_eq!(run.code, 0, "{}", run.stderr);
    let files = reported_files(&run);
    assert_eq!(files.len(), 2, "{}", run.stdout);
    for file in &files {
        assert!(
            !file.contains('\\'),
            "the report spells a path with a backslash: {file}"
        );
        assert!(
            file.contains("src/ui/") || file.contains("config/app/"),
            "the nesting is not reported as nesting: {file}"
        );
    }
    // stderr is a projection of the same reports, so it carries the same
    // separator or the two halves of one run disagree.
    assert!(
        !run.stderr.contains(".ts\\") && !run.stderr.contains('\\'),
        "the human half spells a path differently: {}",
        run.stderr
    );
}

/// Windows ignores `TZ`, so a suite that depends on it passes on two
/// platforms and fails on the third. Nothing here reads a clock, and
/// this is what says so.
#[test]
fn the_answer_does_not_depend_on_the_timezone() {
    let tree = Tree::new("timezone");
    tree.write("messages.ts", "const m = 'Delete this?';\n");

    let utc = Command::new(BINARY)
        .arg(tree.arg())
        .env("TZ", "UTC")
        .output()
        .expect("it runs");
    let far = Command::new(BINARY)
        .arg(tree.arg())
        .env("TZ", "Pacific/Kiritimati")
        .output()
        .expect("it runs");
    let none = Command::new(BINARY)
        .arg(tree.arg())
        .env_remove("TZ")
        .output()
        .expect("it runs");

    assert_eq!(utc.stdout, none.stdout, "TZ=UTC and no TZ differ");
    assert_eq!(utc.stdout, far.stdout, "two timezones differ");
    assert_eq!(utc.stderr, none.stderr, "TZ=UTC and no TZ differ on stderr");
    assert_eq!(utc.status.code(), none.status.code());
}

/// `README.md` and `readme.md` are one file on macOS and Windows and two
/// on Linux. Either is fine; reporting one of them twice is not.
#[test]
fn a_case_insensitive_filesystem_does_not_produce_the_same_file_twice() {
    let tree = Tree::new("case");
    tree.write("README.md", "'upper'\n");
    tree.write("readme.md", "'lower'\n");

    let on_disk = std::fs::read_dir(tree.path())
        .expect("the tree is readable")
        .count();
    assert!(
        (1..=2).contains(&on_disk),
        "the filesystem did something unexpected: {on_disk} entries"
    );
    if on_disk == 1 {
        eprintln!("NOTE: this filesystem folds case — one file, not two");
    }

    let run = run(&[&tree.arg()]);
    let mut files = reported_files(&run);
    assert_eq!(files.len(), on_disk, "{}", run.stdout);
    files.sort();
    let mut unique = files.clone();
    unique.dedup();
    assert_eq!(files, unique, "a file is reported twice: {files:?}");
}

/// `CON`, `PRN`, `AUX`, `NUL` and `COM1` are device names on Windows and
/// ordinary names everywhere else. The walk has to survive the failure
/// to create them rather than the test asserting they exist.
#[test]
fn reserved_windows_names_do_not_stop_the_walk() {
    let tree = Tree::new("reserved");
    tree.write("kept.json", "{\"a\":\"value\"}\n");

    let mut created = Vec::new();
    for name in ["CON", "PRN", "AUX", "NUL", "COM1"] {
        match std::fs::write(tree.path().join(name), "'reserved'\n") {
            Ok(()) => created.push(name),
            Err(_) => skipped(
                &format!("a file named {name}"),
                "this platform reserves the name",
            ),
        }
    }

    let run = run(&[&tree.arg()]);
    assert!(run.code == 0 || run.code == 1, "{}", run.stderr);
    let files = reported_files(&run);
    assert!(
        files.iter().any(|file| file.ends_with("kept.json")),
        "the ordinary file was lost with the reserved ones: {files:?}"
    );
    for name in created {
        assert!(
            files.iter().any(|file| file.ends_with(name)),
            "{name} was created and then not walked: {files:?}"
        );
    }
}

/// A child that refuses before reading anything closes stdin under the
/// writer's feet. **Assert the exit code, never the write** — the write
/// is a race, and this family lost a CI run to it once.
#[test]
fn writing_to_a_child_that_refuses_immediately_is_not_a_failure() {
    let mut child = Command::new(BINARY)
        // `--stdin` with a file argument is refused during parsing, so
        // the process is gone before the first byte arrives.
        .args(["--stdin", "a-file.json"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");

    if let Some(stdin) = child.stdin.as_mut() {
        // Deliberately ignored: a broken pipe here is the refusal
        // working, not the test failing.
        let _ = stdin.write_all(&vec![b'x'; 1024 * 1024]);
        let _ = stdin.flush();
    }
    drop(child.stdin.take());

    let output = child.wait_with_output().expect("it finishes");
    assert_eq!(
        output.status.code(),
        Some(2),
        "the refusal is the assertion: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stdout.is_empty(), "a refusal writes no report");
}

/// The same shape the other way round: a document arrives whole and the
/// child reads all of it before exiting.
#[test]
fn a_document_written_to_stdin_arrives_whole() {
    let mut child = Command::new(BINARY)
        .args(["--stdin", "--format", "json"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("the binary runs");

    let mut document = String::from("{\n");
    for index in 0..5_000 {
        let _ = writeln!(document, "  \"k{index}\": \"value {index}\",");
    }
    document.push_str("  \"last\": \"end\"\n}\n");

    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(document.as_bytes());
    }
    drop(child.stdin.take());

    let output = child.wait_with_output().expect("it finishes");
    assert_eq!(output.status.code(), Some(0));
    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout carries JSON");
    assert_eq!(report["summary"]["strings"], 5_001);
}
