/**
 * The command line, parsed as the Rust CLI parses it: strictly, in order, and
 * refusing rather than defaulting. A typo'd `--dedup` that quietly did nothing
 * would produce a report the caller believed was deduplicated.
 */
import { resolveFormat } from '../mcp/fileType';
import { DEFAULT_SCAN, type ScanOptions } from './scan';
import { FLAGS } from './usage';
import { DEFAULT_WALK, type WalkOptions } from './walk';

export interface Cli {
	readonly strict: boolean;
	readonly inputs: readonly string[];
	readonly stdin: boolean;
	readonly valuesOnly: boolean;
	readonly scan: ScanOptions;
	readonly walk: WalkOptions;
}

type Draft = { -readonly [K in keyof Cli]: Cli[K] };

const TAKES_VALUE: readonly string[] = Object.freeze([
	'--format',
	'--csv-column',
]);

export function parse(args: readonly string[]): Cli {
	const draft: Draft = {
		strict: false,
		inputs: [],
		stdin: false,
		valuesOnly: false,
		scan: DEFAULT_SCAN,
		walk: DEFAULT_WALK,
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index] as string;
		if (arg.startsWith('-') && !FLAGS.includes(arg)) {
			throw new Error(`${arg} is not an option. Try --help.`);
		}
		const value = TAKES_VALUE.includes(arg) ? args[++index] : undefined;
		apply(draft, arg, value);
	}

	if (draft.stdin && draft.inputs.length > 0) {
		throw new Error('reading from stdin takes no file arguments');
	}
	if (!draft.stdin && draft.inputs.length === 0) {
		throw new Error('name a file or a directory to read. Try --help.');
	}
	return Object.freeze(draft);
}

const SWITCHES: Readonly<Record<string, (draft: Draft) => void>> =
	Object.freeze({
		'--dedupe': (draft) => {
			draft.scan = { ...draft.scan, dedupe: true };
		},
		'--values': (draft) => {
			draft.valuesOnly = true;
		},
		'--multiline': (draft) => {
			draft.scan = {
				...draft.scan,
				extract: { ...draft.scan.extract, multiline: true },
			};
		},
		'--csv-header': (draft) => {
			draft.scan = {
				...draft.scan,
				extract: { ...draft.scan.extract, csvHasHeader: true },
			};
		},
		'--stdin': (draft) => {
			draft.stdin = true;
		},
		'--strict': (draft) => {
			draft.strict = true;
		},
		'--hidden': (draft) => {
			draft.walk = { ...draft.walk, hidden: true };
		},
		'--no-ignore': (draft) => {
			draft.walk = { ...draft.walk, respectIgnore: false };
		},
	});

function apply(draft: Draft, arg: string, value: string | undefined): void {
	const toggle = SWITCHES[arg];
	if (toggle) {
		toggle(draft);
		return;
	}
	if (arg === '--format') {
		if (value === undefined) throw new Error('--format needs a format');
		// The one leniency, and it is the extension's: a name nothing here
		// recognises is the quoted-run fallback, which is what lets this be
		// pointed at a source tree nobody has described to it.
		draft.scan = { ...draft.scan, format: resolveFormat(value, undefined) };
		return;
	}
	if (arg === '--csv-column') {
		if (value === undefined)
			throw new Error('--csv-column needs a column number');
		draft.scan = {
			...draft.scan,
			extract: { ...draft.scan.extract, csvColumn: columnNumber(value) },
		};
		return;
	}
	draft.inputs = [...draft.inputs, arg];
}

const USIZE_MAX = 2n ** 64n - 1n;

/** Rust's `usize` parse: an optional `+`, ASCII digits, nothing around them. */
function columnNumber(value: string): number {
	if (!/^\+?[0-9]+$/.test(value) || BigInt(value) > USIZE_MAX) {
		throw new Error(`${value} is not a column number`);
	}
	return Number(value);
}
