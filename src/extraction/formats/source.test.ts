import { describe, expect, it } from 'vitest';
import { createSourceExtractor, type SourceLanguage } from './source';

/**
 * The mirror of crate/src/extract/source.rs's unit tests. The corpus in
 * crate/fixtures/ pins the two implementations against each other; these
 * pin the shapes the corpus documents cannot hold at once.
 */
function read(text: string, language: SourceLanguage): readonly string[] {
	return createSourceExtractor(language)(text);
}

describe('python', () => {
	// The regression. The fallback sees only an empty "" pair on either
	// side of a docstring.
	it('reads a docstring as one string', () => {
		const source =
			'def greet():\n    """Greet a user.\n\n    Politely.\n    """\n    return 1\n';
		expect(read(source, 'python')).toEqual(['Greet a user.\n\n    Politely.']);
	});

	it('reads both triple-quote styles', () => {
		expect(read("x = '''a\nb'''", 'python')).toEqual(['a\nb']);
		expect(read('x = """a\nb"""', 'python')).toEqual(['a\nb']);
	});

	it('treats a prefix as syntax, not as part of the value', () => {
		expect(
			read(
				'a = f"Hi {name}"\nb = r"\\d+"\nc = b"bytes"\nd = rb\'both\'',
				'python',
			),
		).toEqual(['Hi {name}', '\\d+', 'bytes', 'both']);
	});

	it('does not read a prefix letter that ends an identifier', () => {
		expect(read('myf"x"', 'python')).toEqual(['x']);
		expect(read("for x in 'items':", 'python')).toEqual(['items']);
	});

	it('reads a comment as prose and a hash inside a string as text', () => {
		expect(
			read("# see \"the docs\"\nx = 'v'  # don't worry\n", 'python'),
		).toEqual(['the docs', 'v']);
		expect(read("x = 'a # b'\ny = 'c'", 'python')).toEqual(['a # b', 'c']);
	});

	it('refuses an unterminated run rather than guessing its end', () => {
		expect(read("x = 'oops\ny = 'kept'", 'python')).toEqual(['kept']);
	});
});

describe('rust', () => {
	// The regression. The fallback splits this into `a raw` and `string`.
	it('reads a raw string as one string with its quotes', () => {
		expect(read('let s = r#"a raw "quoted" string"#;', 'rust')).toEqual([
			'a raw "quoted" string',
		]);
	});

	it('takes any number of hashes and the byte prefixes', () => {
		expect(read('r"plain"', 'rust')).toEqual(['plain']);
		expect(read('r##"has "# inside"##', 'rust')).toEqual(['has "# inside']);
		expect(read('b"bytes" br#"raw bytes"#', 'rust')).toEqual([
			'bytes',
			'raw bytes',
		]);
		expect(read('let r#type = "kept";', 'rust')).toEqual(['kept']);
	});

	it('lets a string span lines and nests block comments', () => {
		expect(read('let s = "first\nsecond";', 'rust')).toEqual(['first\nsecond']);
		expect(read('/* outer /* inner */ still */ "kept"', 'rust')).toEqual([
			'kept',
		]);
	});

	// Without this, the quote inside the character literal opens a run
	// that eats the rest of the file.
	it('reads a character literal as a character and a lifetime as neither', () => {
		expect(read('if c == \'"\' { let s = "kept"; }', 'rust')).toEqual(['kept']);
		expect(read("let c = '\\''; let s = \"kept\";", 'rust')).toEqual(['kept']);
		expect(
			read("fn f<'a>(x: &'a str) -> &'a str { \"kept\" }", 'rust'),
		).toEqual(['kept']);
	});
});

describe('go', () => {
	// The regression. The fallback's pattern cannot span lines.
	it('reads a raw string as one string', () => {
		expect(read('const usage = `line one\nline two`', 'go')).toEqual([
			'line one\nline two',
		]);
	});

	it('stops an interpreted string at the line and skips a rune', () => {
		expect(read('s := "one"\nt := "two"', 'go')).toEqual(['one', 'two']);
		expect(read('s := "oops\nt := "kept"', 'go')).toEqual(['kept']);
		expect(read('if c == \'"\' { s := "kept" }', 'go')).toEqual(['kept']);
	});
});

describe('shell', () => {
	// The regression. The fallback reports nothing at all.
	it('reads a heredoc as one string', () => {
		expect(read('cat <<EOF\nThe body.\nSecond line.\nEOF\n', 'shell')).toEqual([
			'The body.\nSecond line.',
		]);
	});

	it('takes every heredoc introducer', () => {
		expect(read("cat <<'EOF'\nliteral\nEOF\n", 'shell')).toEqual(['literal']);
		expect(read('cat <<"EOF"\nexpanded\nEOF\n', 'shell')).toEqual(['expanded']);
		expect(read('cat <<- EOF\n\tindented\n\tEOF\n', 'shell')).toEqual([
			'indented',
		]);
		expect(read('diff <<A <<B\nfirst\nA\nsecond\nB\n', 'shell')).toEqual([
			'first',
			'second',
		]);
	});

	it('refuses a heredoc that never closes and a left shift', () => {
		expect(read('cat <<EOF\nno terminator\n', 'shell')).toEqual([]);
		expect(read("x=$((1 << 2))\ny='kept'", 'shell')).toEqual(['kept']);
	});

	it('reads a hash inside a word as text, not a comment', () => {
		expect(read("file=report#1\necho 'kept'", 'shell')).toEqual(['kept']);
		expect(read('# a "noted" thing\necho \'kept\'', 'shell')).toEqual([
			'noted',
			'kept',
		]);
	});
});

describe('php, ruby and perl', () => {
	it('reads a php heredoc and nowdoc as one string each', () => {
		expect(read('$a = <<<EOT\nhello\nEOT;\n', 'php')).toEqual(['hello']);
		expect(read("$a = <<<'NOW'\nraw\nNOW;\n", 'php')).toEqual(['raw']);
	});

	it('reads all three php comment styles', () => {
		expect(
			read('# one "a"\n// two "b"\n/* three "c" */\n$x = \'kept\';', 'php'),
		).toEqual(['a', 'b', 'c', 'kept']);
	});

	it('reads a ruby heredoc but not a left shift', () => {
		expect(read('t = <<~EOS\n  hi\nEOS\n', 'ruby')).toEqual(['hi']);
		expect(read("list << item\nx = 'kept'", 'ruby')).toEqual(['kept']);
		expect(read("=begin\nprose 'here'\n=end\nx = 'kept'", 'ruby')).toEqual([
			'here',
			'kept',
		]);
	});

	it('reads a perl heredoc, and a last index is not a comment', () => {
		expect(read("my $t = <<'END';\nbody\nEND\n", 'perl')).toEqual(['body']);
		expect(read("my $n = $#list;\nmy $s = 'kept';", 'perl')).toEqual(['kept']);
		expect(read("=pod\nprose 'here'\n=cut\nmy $s = 'kept';", 'perl')).toEqual([
			'here',
			'kept',
		]);
	});
});

describe('csharp', () => {
	// The fallback reports `He said`, `hi` and `loudly`.
	it('keeps the doubled quotes of a verbatim string', () => {
		expect(read('var s = @"He said ""hi"" loudly";', 'csharp')).toEqual([
			'He said ""hi"" loudly',
		]);
	});

	it('lets a verbatim string span lines and keep its backslashes', () => {
		expect(read('var p = @"C:\\Users\\test";', 'csharp')).toEqual([
			'C:\\Users\\test',
		]);
		expect(read('var q = @"one\ntwo";', 'csharp')).toEqual(['one\ntwo']);
	});

	it('reads interpolation in either order', () => {
		expect(read('var a = $"Hi {n}";', 'csharp')).toEqual(['Hi {n}']);
		expect(read('var b = $@"a ""b"";";', 'csharp')).toEqual(['a ""b"";']);
		expect(read('var c = @$"x";', 'csharp')).toEqual(['x']);
	});
});

describe('javascript', () => {
	it('reads a template literal as one string across lines', () => {
		expect(
			read('const body = `Dear reader,\n\nWelcome.`;', 'javascript'),
		).toEqual(['Dear reader,\n\nWelcome.']);
	});

	// Written as escaped template literals so the placeholders here are
	// the data under test rather than something this file interpolates.
	it('keeps a nested template inside the string around it', () => {
		expect(
			read(`const s = \`a \${x ? \`b\` : \`c\`} d\`;`, 'javascript'),
		).toEqual([`a \${x ? \`b\` : \`c\`} d`]);
		expect(read(`const s = \`a \${ {k: \`v\`}.k } b\`;`, 'javascript')).toEqual(
			[`a \${ {k: \`v\`}.k } b`],
		);
		expect(read(`const s = \`a \${f("}")} b\`;`, 'javascript')).toEqual([
			`a \${f("}")} b`,
		]);
	});

	it('leaves escapes unresolved and reads a comment as prose', () => {
		expect(read("const s = 'It\\'s fine';", 'javascript')).toEqual([
			"It\\'s fine",
		]);
		expect(
			read(
				'// A comment mentioning "quoted text".\nconst a = \'v\';',
				'javascript',
			),
		).toEqual(['quoted text', 'v']);
	});

	it('stops rather than running away on pathological nesting', () => {
		expect(read(`\`${'${`'.repeat(200)}`, 'javascript')).toEqual([]);
	});
});

describe('the shared rule', () => {
	// collectStrings answers this, not the languages: every extractor
	// hands it raw literals and it decides what survives.
	it('drops empty and whitespace-only literals everywhere', () => {
		expect(read("a = ''\nb = '  '\nc = 'kept'", 'python')).toEqual(['kept']);
		expect(read('a := ""; b := "kept"', 'go')).toEqual(['kept']);
	});

	it('trims values and keeps repeats', () => {
		expect(read("a = '  padded  '", 'python')).toEqual(['padded']);
		expect(read("a = 'same'\nb = 'same'", 'python')).toEqual(['same', 'same']);
	});

	it('yields nothing for a document with no literals', () => {
		expect(read('', 'python')).toEqual([]);
		expect(read('no literals at all', 'rust')).toEqual([]);
	});
});
