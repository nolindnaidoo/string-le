//! A wall clock on a fixed tree.
//!
//! secrets-le was fifty times slower than its siblings for a release and
//! nobody noticed, because nothing measured it. This measures it.
//!
//! **The tree is generated from a fixed seed rather than checked in.**
//! Five hundred files of source and config would be a third of this
//! repository by file count, and a generator says what the tree is in
//! twenty lines where a directory would need a README. The seed is
//! constant, so the tree is the same tree on every run and every
//! platform.
//!
//! Gated behind `STRING_LE_BUDGET`, the way `scenarios.rs` is gated: a
//! wall-clock assertion on a laptop compiling in the background is a
//! flake, and a flake is a check people learn to rerun. CI sets it, on
//! ubuntu only, against a **release** binary.
//!
//! **A skipped budget is never reported as a pass.**

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const BINARY: &str = env!("CARGO_BIN_EXE_string-le");

/// How many files the tree holds. Enough that process start-up is noise
/// rather than the measurement.
const FILES: usize = 500;

/// How many times each file repeats its shape.
///
/// Without it the tree is sixty kilobytes and the measurement is mostly
/// process start-up, which makes a ten-times ceiling a statement about
/// `fork` rather than about the scanner. Twenty copies puts each file at
/// a few kilobytes — the size of a real messages file — and the tree at
/// a couple of megabytes.
const REPEATS: usize = 20;

/// The ceiling, at ten times the local measurement.
///
/// **Measured at 0.038 s** for the whole tree — 500 files, about two
/// megabytes — on an Apple-silicon laptop, release build, fastest of
/// three runs. Ten times that is 0.4 s: generous enough that a shared
/// runner on slower silicon and a colder disk clears it comfortably,
/// tight enough to catch an order of magnitude, which is the only thing
/// a number like this can honestly catch.
///
/// Raise it when the tree grows, never to make a red build green.
const CEILING: Duration = Duration::from_millis(400);

/// Four copies of the same tree may cost six times one copy, no more.
///
/// Four would be the linear answer; six leaves room for a runner that
/// wobbles. Anything quadratic clears it immediately — the position
/// lookup that went quadratic on one long line in this family showed up
/// as sixteen.
const LINEARITY_FACTOR: u32 = 6;

fn enabled(name: &str) -> bool {
    if std::env::var_os("STRING_LE_BUDGET").is_some() {
        return true;
    }
    eprintln!("SKIPPED {name}: set STRING_LE_BUDGET to run it");
    false
}

/// The same arithmetic on every platform, so the tree is the same tree.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }

    fn below(&mut self, limit: usize) -> usize {
        usize::try_from(self.next() % limit as u64).unwrap_or(0)
    }
}

/// One file per shape a real checkout carries: config, source in each
/// language this crate reads by its own syntax, and prose.
const SHAPES: [(&str, &str); 10] = [
    (
        "json",
        "{{\n  \"title\": \"Settings {n}\",\n  \"count\": {n},\n  \"body\": \"Delete this permanently?\"\n}}\n",
    ),
    (
        "yaml",
        "title: Settings {n}\nbody: \"Are you sure?\"\nitems:\n  - first\n  - second\n",
    ),
    ("toml", "title = \"Settings {n}\"\nbody = \"Never mind\"\n"),
    (
        "ini",
        "[section{n}]\ntitle = Settings {n}\nbody = Never mind\n",
    ),
    ("env", "TITLE=Settings {n}\nBODY=\"Delete this?\"\n"),
    (
        "ts",
        "const messages = {{\n  confirm: 'Delete this permanently? ({n})',\n  cancel: \"Never mind\",\n  body: `Dear reader,\n\nWelcome aboard.`,\n}};\n",
    ),
    (
        "py",
        "def greet():\n    \"\"\"Greet a user ({n}).\n\n    Politely.\n    \"\"\"\n    return 'Hello there'\n",
    ),
    (
        "rs",
        "pub fn message() -> &'static str {{\n    let raw = r#\"a raw \"quoted\" string {n}\"#;\n    \"Delete this permanently?\"\n}}\n",
    ),
    (
        "sh",
        "cat <<EOF\nThe body, number {n}.\nSecond line.\nEOF\necho 'Never mind'\n",
    ),
    (
        "md",
        "# Notes {n}\n\nProse with a `code span` and \"a quoted phrase\".\n",
    ),
];

struct Tree {
    root: PathBuf,
}

impl Tree {
    /// One tree of `FILES` files, spread over directories so the walk
    /// does some walking, generated from a fixed seed.
    fn generate(name: &str, copies: usize) -> Self {
        let root =
            std::env::temp_dir().join(format!("string-le-budget-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("a temporary directory");

        for copy in 0..copies {
            let mut rng = Rng(0x5eed_b0d9);
            let base = root.join(format!("copy{copy}"));
            for index in 0..FILES {
                let (extension, template) = SHAPES[rng.below(SHAPES.len())];
                let directory = base.join(format!("area{}", index % 25));
                std::fs::create_dir_all(&directory).expect("a directory");
                let body = template.replace("{n}", &index.to_string());
                // The braces the templates double are Rust's, not the
                // document's: they are written out here so the file on
                // disk is what a real one looks like.
                let body = body.replace("{{", "{").replace("}}", "}");
                std::fs::write(
                    directory.join(format!("file{index}.{extension}")),
                    body.repeat(REPEATS),
                )
                .expect("a file");
            }
        }
        Self { root }
    }

    fn path(&self) -> &Path {
        &self.root
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

/// The fastest of three runs. A shared runner is noisy in one direction
/// only: nothing makes a scan faster than it is.
fn scan(tree: &Tree) -> Duration {
    let mut best = Duration::MAX;
    for _ in 0..3 {
        let started = Instant::now();
        let output = Command::new(BINARY)
            .arg(tree.path().to_string_lossy().into_owned())
            .output()
            .expect("the binary runs");
        let elapsed = started.elapsed();
        assert_eq!(
            output.status.code(),
            Some(0),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        best = best.min(elapsed);
    }
    best
}

#[test]
fn a_five_hundred_file_tree_scans_inside_its_budget() {
    if !enabled("a_five_hundred_file_tree_scans_inside_its_budget") {
        return;
    }
    let tree = Tree::generate("single", 1);
    let elapsed = scan(&tree);
    eprintln!("budget: {FILES} files in {elapsed:?} (ceiling {CEILING:?})");
    assert!(
        elapsed < CEILING,
        "{FILES} files took {elapsed:?}, over the {CEILING:?} ceiling — \
         that is an order of magnitude, not a slow runner"
    );
}

/// Four times the tree, at most six times the time. This is the check
/// that catches the quadratic class directly: a scan that is linear in
/// the tree stays linear when the tree is copied.
#[test]
fn four_times_the_tree_is_not_more_than_six_times_the_time() {
    if !enabled("four_times_the_tree_is_not_more_than_six_times_the_time") {
        return;
    }
    let one = Tree::generate("linear-one", 1);
    let four = Tree::generate("linear-four", 4);

    let single = scan(&one);
    let quadrupled = scan(&four);
    eprintln!("budget: 1x {single:?}, 4x {quadrupled:?}");

    assert!(
        quadrupled <= single * LINEARITY_FACTOR,
        "four copies took {quadrupled:?} against {single:?} for one — \
         more than {LINEARITY_FACTOR}x, which is superlinear rather than slow"
    );
}
