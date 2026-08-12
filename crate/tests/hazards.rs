//! Files and trees that break tools, driven against the built binary.
//!
//! Every case here exists because something in this family shipped
//! broken: a byte-order mark read as content emptied three crates, one
//! PNG made `--strict` exit 2 on every repository that has an image in
//! it, and a file that was not valid UTF-8 vanished from a report
//! entirely — which reads to whoever ran it as a file that was clean.
//!
//! **The tree is built at runtime, not checked in.** Windows cannot
//! carry a FIFO, a permission-denied file or a symlink loop in a git
//! checkout, so each of those is constructed here and **skipped by name**
//! where the platform cannot express it. A silent pass would be the
//! same lie the tests exist to catch.
//!
//! What every case asserts, whatever else it asserts: the process does
//! not panic, does not hang, and exits 0, 1 or 2 — never on a signal.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

const BINARY: &str = env!("CARGO_BIN_EXE_string-le");
static COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Generous enough for a shared runner reading a 100k-line file, tight
/// enough that a scanner which stopped making progress is a failure
/// rather than a slow build.
const PER_CASE_LIMIT: Duration = Duration::from_secs(60);

/// A hazard the platform cannot express. Printed, never silent: a
/// skipped case reported as a pass is how a gap becomes a claim.
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
            "string-le-hazard-{name}-{}-{unique}",
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

    fn write(&self, relative: &str, contents: &[u8]) -> PathBuf {
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
        // A permission-denied file cannot be removed until it can be
        // read again; failing to clean up must not fail the test.
        #[cfg(unix)]
        restore_permissions(&self.root);
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[cfg(unix)]
fn restore_permissions(root: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let _ = std::fs::set_permissions(entry.path(), std::fs::Permissions::from_mode(0o644));
    }
}

struct Run {
    code: i32,
    stdout: String,
    stderr: String,
}

/// Run the binary and assert the only three things every case shares.
///
/// A process that died on a signal has no exit code at all, which is how
/// the SIGABRT from slicing a multi-byte character showed up in the first
/// place: green tests, and a binary that aborted on a real repository.
fn survives(case: &str, args: &[&str]) -> Run {
    let started = Instant::now();
    let output = Command::new(BINARY)
        .args(args)
        .output()
        .unwrap_or_else(|error| panic!("{case}: the binary did not run: {error}"));
    let elapsed = started.elapsed();

    let code = output.status.code().unwrap_or_else(|| {
        panic!(
            "{case}: the process died on a signal rather than exiting: {:?}",
            output.status
        )
    });
    assert!(
        (0..=2).contains(&code),
        "{case}: exit {code} is outside the documented 0, 1, 2"
    );
    assert!(
        elapsed < PER_CASE_LIMIT,
        "{case}: took {elapsed:?}, which is a hang rather than a scan"
    );

    Run {
        code,
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

fn reports(run: &Run) -> Vec<serde_json::Value> {
    run.stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("stdout carries only JSON"))
        .collect()
}

fn report_for(run: &Run, suffix: &str) -> Option<serde_json::Value> {
    reports(run).into_iter().find(|report| {
        report["file"]
            .as_str()
            .is_some_and(|file| file.ends_with(suffix))
    })
}

// ---- content -----------------------------------------------------------

/// Twelve shapes of file, each holding a value the crate should find,
/// each run in its own tree so one cannot mask another.
#[test]
fn every_content_hazard_is_scanned_without_a_crash() {
    let cases: Vec<(&str, Vec<u8>)> = vec![
        ("a utf-8 bom", b"\xef\xbb\xbf{\"a\":\"value\"}\n".to_vec()),
        (
            "crlf line endings",
            b"{\r\n\"a\":\"value\"\r\n}\r\n".to_vec(),
        ),
        ("a lone carriage return", b"{\r\"a\":\"value\"\r}".to_vec()),
        ("no trailing newline", b"{\"a\":\"value\"}".to_vec()),
        ("an empty file", Vec::new()),
        ("whitespace only", b"   \n\t  \n".to_vec()),
        // A NUL in the first 8KB is ripgrep's binary heuristic: no
        // report line at all, which is the case being pinned.
        ("a nul byte mid-file", b"{\"a\":\"val\x00ue\"}".to_vec()),
        ("invalid utf-8", b"{\"a\":\"val\xff\xfeue\"}".to_vec()),
        (
            "utf-16le with a bom",
            b"\xff\xfe{\x00\"\x00a\x00\"\x00:\x00\"\x00v\x00\"\x00}\x00".to_vec(),
        ),
        (
            "a four-byte emoji before the value",
            "{\"\u{1f3af}\":\"value\"}\n".as_bytes().to_vec(),
        ),
        ("a one megabyte line", {
            let mut bytes = b"{\"a\":\"".to_vec();
            bytes.extend(std::iter::repeat_n(b'x', 1_000_000));
            bytes.extend_from_slice(b"\"}");
            bytes
        }),
        ("one hundred thousand lines", {
            let mut bytes = b"{\n".to_vec();
            for index in 0..100_000 {
                bytes.extend_from_slice(format!("  \"k{index}\": \"v{index}\",\n").as_bytes());
            }
            bytes.extend_from_slice(b"  \"last\": \"end\"\n}\n");
            bytes
        }),
    ];

    for (case, contents) in cases {
        let tree = Tree::new("content");
        tree.write("document.json", &contents);
        survives(case, &[&tree.arg()]);
        survives(case, &["--strict", &tree.arg()]);
        survives(case, &["--values", &tree.arg()]);
    }
}

/// Three invisible bytes that Notepad, Excel and a PowerShell redirect
/// all add. Read as content they shift every column on the first line,
/// and in a structured format they lose the document entirely.
#[test]
fn a_byte_order_mark_does_not_move_the_reported_column() {
    let tree = Tree::new("bom-column");
    tree.write("plain.json", b"{\"a\":\"value\"}\n");
    tree.write("marked.json", b"\xef\xbb\xbf{\"a\":\"value\"}\n");
    let run = survives("a bom does not move a column", &[&tree.arg()]);

    let plain = report_for(&run, "plain.json").expect("the plain file was read");
    let marked = report_for(&run, "marked.json").expect("the marked file was read");
    assert_eq!(plain["strings"][0]["value"], "value");
    assert_eq!(marked["strings"][0], plain["strings"][0]);
}

/// A string can carry the hazard rather than the file. A byte-order mark
/// inside a document is a zero-width no-break space, and JavaScript's
/// `trim` — which the extension uses and this crate reproduces — removes
/// it from the edges of a value and leaves it in the middle.
#[test]
fn a_value_holding_a_byte_order_mark_is_trimmed_the_way_the_extension_trims() {
    let tree = Tree::new("bom-value");
    tree.write(
        "document.json",
        "{\"a\":\"\u{feff}edges\u{feff}\",\"b\":\"in\u{feff}side\"}\n".as_bytes(),
    );
    let run = survives("a value holding a bom", &["--values", &tree.arg()]);
    assert_eq!(
        run.stdout.lines().collect::<Vec<_>>(),
        ["edges", "in\u{feff}side"]
    );
}

/// A carriage return inside a value is ordinary text; one at the edge is
/// whitespace and goes, the same as a space would.
#[test]
fn a_value_holding_a_lone_carriage_return_keeps_it_inside_and_trims_it_off() {
    let tree = Tree::new("cr-value");
    tree.write("document.json", b"{\"a\":\"one\rtwo\",\"b\":\"three\r\"}\n");
    let run = survives("a value holding a lone cr", &[&tree.arg()]);
    let report = report_for(&run, "document.json").expect("the file was read");
    assert_eq!(report["strings"][0]["value"], "one\rtwo");
    assert_eq!(report["strings"][1]["value"], "three");
}

/// A NUL byte in a value makes the whole file binary — ripgrep's
/// heuristic, borrowed for the same reason its walker is. No report
/// line, no diagnostic, and it cannot fail `--strict`.
#[test]
fn a_value_holding_a_nul_byte_makes_the_file_binary_rather_than_skipped() {
    let tree = Tree::new("nul-value");
    tree.write("binary.json", b"{\"a\":\"val\x00ue\"}");
    tree.write("kept.json", b"{\"b\":\"kept\"}");

    let run = survives("a value holding a nul", &[&tree.arg()]);
    let named: Vec<String> = reports(&run)
        .iter()
        .filter_map(|report| report["file"].as_str().map(str::to_string))
        .collect();
    assert_eq!(named.len(), 1, "{}", run.stdout);
    assert!(named[0].ends_with("kept.json"), "{}", run.stdout);
    assert!(
        run.stderr.contains("1 binary file skipped"),
        "the count is the coverage line: {}",
        run.stderr
    );
    assert_eq!(
        survives("a binary file under strict", &["--strict", &tree.arg()]).code,
        0,
        "a binary file was never a text candidate"
    );
}

/// The other half of the distinction: bytes that are not valid UTF-8 and
/// carry no NUL are a text file that could not be read. It is named, it
/// carries a `skipped` diagnostic, and it does fail `--strict`.
#[test]
fn a_value_holding_invalid_utf8_is_a_named_skip_that_fails_strict() {
    let tree = Tree::new("undecodable");
    tree.write("notes.txt", b"const a = 'val\xff\xfeue';");
    tree.write("kept.ts", b"const b = 'kept';");

    let run = survives("a value holding invalid utf-8", &[&tree.arg()]);
    let report = report_for(&run, "notes.txt").expect("the file is in the report");
    assert_eq!(report["diagnostics"][0]["code"], "skipped");
    assert_eq!(report["diagnostics"][0]["message"], "not UTF-8 text");
    assert_eq!(run.code, 0, "a skip alone is not a failure");
    assert_eq!(
        survives(
            "an undecodable file under strict",
            &["--strict", &tree.arg()]
        )
        .code,
        2
    );
}

/// Exit 2 means the *question* was malformed. A file that could not be
/// read is an answer about the tree, and `--strict` is how a caller asks
/// for the stricter reading.
#[test]
fn exit_two_is_for_a_malformed_question_and_not_for_an_unreadable_file() {
    let tree = Tree::new("exit-two");
    tree.write("kept.json", b"{\"a\":\"value\"}");
    tree.write("notes.txt", b"hi\xff\xfe");

    assert_ne!(
        survives("an unreadable file", &[&tree.arg()]).code,
        2,
        "an unreadable file is reported, not a refusal"
    );
    assert_eq!(
        survives("an unknown flag", &["--nonsense", &tree.arg()]).code,
        2
    );
    assert_eq!(
        survives("a path that is not there", &["/no/such/place-xyz"]).code,
        2
    );
}

// ---- the filesystem ----------------------------------------------------

/// A tree that is mostly not files: links, loops, a directory wearing a
/// file's extension, and names an operating system may refuse outright.
#[test]
fn every_filesystem_hazard_is_walked_without_a_crash() {
    let tree = Tree::new("filesystem");
    tree.write("real.json", b"{\"a\":\"value\"}");
    // A directory that looks like a document. The walk selects files;
    // this must not become a read.
    std::fs::create_dir_all(tree.path().join("x.json")).expect("a directory");
    tree.write("with spaces.json", b"{\"a\":\"spaces\"}");
    tree.write("naïve-café.json", b"{\"a\":\"unicode\"}");
    tree.write("🎯.json", b"{\"a\":\"emoji\"}");

    link_to_a_file(&tree);
    a_broken_link(&tree);
    a_link_loop(&tree);
    a_fifo(&tree);
    a_long_path(&tree);

    let run = survives("a tree of filesystem hazards", &[&tree.arg()]);
    assert_eq!(run.code, 0, "{}", run.stderr);
    let named: Vec<String> = reports(&run)
        .iter()
        .filter_map(|report| report["file"].as_str().map(str::to_string))
        .collect();
    assert!(
        named.iter().any(|file| file.ends_with("real.json")),
        "the ordinary file is still read: {named:?}"
    );
    assert!(
        !named.iter().any(|file| file.ends_with("x.json/")),
        "a directory is not a document: {named:?}"
    );
    survives(
        "a tree of filesystem hazards, strictly",
        &["--strict", &tree.arg()],
    );
}

#[cfg(unix)]
fn link_to_a_file(tree: &Tree) {
    let _ =
        std::os::unix::fs::symlink(tree.path().join("real.json"), tree.path().join("link.json"));
}

#[cfg(windows)]
fn link_to_a_file(tree: &Tree) {
    // Creating a symlink on Windows needs Developer Mode or an elevated
    // shell; a runner without either is a skip, by name.
    if std::os::windows::fs::symlink_file(
        tree.path().join("real.json"),
        tree.path().join("link.json"),
    )
    .is_err()
    {
        skipped(
            "a symlink to a file",
            "this Windows session may not create links",
        );
    }
}

#[cfg(unix)]
fn a_broken_link(tree: &Tree) {
    let _ =
        std::os::unix::fs::symlink(tree.path().join("gone.json"), tree.path().join("dead.json"));
}

#[cfg(windows)]
fn a_broken_link(tree: &Tree) {
    if std::os::windows::fs::symlink_file(
        tree.path().join("gone.json"),
        tree.path().join("dead.json"),
    )
    .is_err()
    {
        skipped(
            "a broken symlink",
            "this Windows session may not create links",
        );
    }
}

#[cfg(unix)]
fn a_link_loop(tree: &Tree) {
    let first = tree.path().join("loop-a");
    let second = tree.path().join("loop-b");
    let _ = std::os::unix::fs::symlink(&second, &first);
    let _ = std::os::unix::fs::symlink(&first, &second);
}

#[cfg(windows)]
fn a_link_loop(tree: &Tree) {
    let first = tree.path().join("loop-a");
    let second = tree.path().join("loop-b");
    if std::os::windows::fs::symlink_dir(&second, &first).is_err()
        || std::os::windows::fs::symlink_dir(&first, &second).is_err()
    {
        skipped(
            "a symlink loop",
            "this Windows session may not create links",
        );
    }
}

#[cfg(unix)]
fn a_fifo(tree: &Tree) {
    // No libc dependency for one test: `mkfifo` is in POSIX and on every
    // runner this matrix uses.
    let made = Command::new("mkfifo")
        .arg(tree.path().join("pipe.json"))
        .status();
    if !made.is_ok_and(|status| status.success()) {
        skipped("a FIFO", "mkfifo is not available here");
    }
}

#[cfg(windows)]
fn a_fifo(_tree: &Tree) {
    skipped("a FIFO", "Windows has no FIFO in the filesystem namespace");
}

/// Windows refuses a path over 260 characters unless long paths are
/// enabled, which is exactly where this crate differs by platform.
fn a_long_path(tree: &Tree) {
    let mut deep = tree.path().to_path_buf();
    for _ in 0..12 {
        deep = deep.join("directory-with-a-long-enough-name-to-pass");
    }
    if std::fs::create_dir_all(&deep).is_err() {
        skipped(
            "a path over 260 characters",
            "this filesystem refused to create it",
        );
        return;
    }
    if std::fs::write(deep.join("deep.json"), b"{\"a\":\"deep\"}").is_err() {
        skipped(
            "a path over 260 characters",
            "this filesystem refused to write it",
        );
    }
}

/// A file the process is not allowed to open is a text file that could
/// not be read: named, reported, and a `--strict` failure. Root ignores
/// the mode, so a session that can still read it is a skip by name.
#[cfg(unix)]
#[test]
fn a_file_that_cannot_be_opened_is_reported_rather_than_dropped() {
    use std::os::unix::fs::PermissionsExt;

    let tree = Tree::new("permissions");
    tree.write("kept.json", b"{\"a\":\"value\"}");
    let locked = tree.write("locked.json", b"{\"b\":\"unreadable\"}");
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000))
        .expect("the mode is set");

    if std::fs::read(&locked).is_ok() {
        skipped(
            "a permission-denied file",
            "this session reads regardless of the mode",
        );
        return;
    }

    let run = survives("a permission-denied file", &[&tree.arg()]);
    let report = report_for(&run, "locked.json").expect("the file is named in the report");
    assert_eq!(report["diagnostics"][0]["code"], "skipped");
    assert_eq!(run.code, 0, "an unreadable file is not a refusal");
    assert_eq!(
        survives(
            "a permission-denied file, strictly",
            &["--strict", &tree.arg()]
        )
        .code,
        2
    );
}

#[cfg(not(unix))]
#[test]
fn a_file_that_cannot_be_opened_is_reported_rather_than_dropped() {
    skipped(
        "a permission-denied file",
        "the unix mode has no equivalent this test can set here",
    );
}
