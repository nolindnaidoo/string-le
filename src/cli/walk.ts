/**
 * Turning what the caller named into the list of files to read, as the Rust
 * CLI's `walk.rs` does with ripgrep's `ignore` crate.
 *
 * A file named explicitly is always read, ignore rules included: you asked for
 * it. Directories are walked without following links, hidden entries are
 * passed over unless asked for, and the result is sorted the way Rust sorts a
 * `PathBuf`, by component, so a report's lines are in the same order from
 * either binary and do not move between two runs over an unchanged tree.
 */
import { type Dirent, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
	type DirectoryRules,
	isIgnored,
	type RepositoryRules,
	repositoryRoot,
	repositoryRules,
	rulesFor,
} from './ignoreRules';
import { rustIoMessage } from './ioError';

export interface WalkOptions {
	readonly hidden: boolean;
	readonly respectIgnore: boolean;
}

export const DEFAULT_WALK: WalkOptions = Object.freeze({
	hidden: false,
	respectIgnore: true,
});

interface Walk {
	readonly root: string;
	readonly options: WalkOptions;
	readonly repository: RepositoryRules | null;
	readonly files: string[];
}

/** Every file to read, in a stable order. Throws a message naming the input. */
export function collect(
	inputs: readonly string[],
	options: WalkOptions,
): readonly string[] {
	const files: string[] = [];
	for (const input of inputs) {
		files.push(...filesUnder(input, options));
	}
	return Object.freeze(sortAndDedupe(files));
}

function filesUnder(input: string, options: WalkOptions): readonly string[] {
	let isFile: boolean;
	try {
		isFile = statSync(input).isFile();
	} catch (error) {
		throw new Error(`${input}: ${rustIoMessage(error)}`);
	}
	if (isFile) return [input];
	return walkDirectory(input, options);
}

function walkDirectory(root: string, options: WalkOptions): readonly string[] {
	const absolute = resolve(root);
	const repoRoot = options.respectIgnore ? repositoryRoot(absolute) : null;
	const walk: Walk = {
		root,
		options,
		repository: repoRoot ? repositoryRules(repoRoot) : null,
		files: [],
	};
	visit(walk, root, absolute, parentRules(absolute, options));
	return walk.files;
}

/** The crate's `parents(true)`: ignore files above the walk root count too. */
function parentRules(
	absolute: string,
	options: WalkOptions,
): readonly DirectoryRules[] {
	if (!options.respectIgnore) return [];
	const chain: DirectoryRules[] = [];
	let dir = dirname(absolute);
	while (dir !== dirname(dir)) {
		chain.unshift(rulesFor(dir, repositoryRoot(dir) !== null));
		dir = dirname(dir);
	}
	chain.unshift(rulesFor(dir, repositoryRoot(dir) !== null));
	return chain;
}

function visit(
	walk: Walk,
	shown: string,
	absolute: string,
	inherited: readonly DirectoryRules[],
): void {
	const chain = walk.options.respectIgnore
		? [...inherited, rulesFor(absolute, repositoryRoot(absolute) !== null)]
		: inherited;
	for (const entry of entriesOf(walk, shown, absolute)) {
		visitEntry(
			walk,
			entry,
			joinShown(shown, entry.name),
			`${absolute}${sep}${entry.name}`,
			chain,
		);
	}
}

function visitEntry(
	walk: Walk,
	entry: Dirent,
	shown: string,
	absolute: string,
	chain: readonly DirectoryRules[],
): void {
	if (!walk.options.hidden && entry.name.startsWith('.')) return;
	// A link is neither: never followed, so a link out of the tree cannot
	// have this reading files the caller did not point it at.
	const isDir = entry.isDirectory();
	if (!isDir && !entry.isFile()) return;
	if (
		walk.options.respectIgnore &&
		isIgnored(absolute, isDir, chain, walk.repository)
	)
		return;
	if (isDir) {
		visit(walk, shown, absolute, chain);
		return;
	}
	walk.files.push(shown);
}

function entriesOf(
	walk: Walk,
	shown: string,
	absolute: string,
): readonly Dirent[] {
	try {
		return readdirSync(absolute, { withFileTypes: true });
	} catch (error) {
		// The crate ends the walk on an unreadable directory rather than
		// reporting less than the tree holds as though it were all of it.
		// walkdir's wording, inside the `ignore` crate's, inside the CLI's.
		throw new Error(
			`${walk.root}: ${shown}: IO error for operation on ${shown}: ${rustIoMessage(error)}`,
		);
	}
}

/** `PathBuf::join`: no separator is added after one that is already there. */
function joinShown(parent: string, name: string): string {
	if (parent.endsWith('/') || parent.endsWith(sep)) return `${parent}${name}`;
	return `${parent}${sep}${name}`;
}

type Component = readonly [rank: number, bytes: Buffer];

/**
 * A path as Rust compares it: by component, where `/` and `.` sort before a
 * name and a name compares by its bytes. Comparing the strings instead would
 * put `a.css` before `a/b.css`, because `.` is below `/` in ASCII.
 */
function components(path: string): readonly Component[] {
	const separators = sep === '\\' ? /[\\/]/ : /\//;
	const parts = path.split(separators);
	const found: Component[] = [];
	if (parts[0] === '' && parts.length > 1) found.push([1, Buffer.alloc(0)]);
	parts.forEach((part, index) => {
		if (!part) return;
		if (part === '.') {
			if (index === 0) found.push([2, Buffer.alloc(0)]);
			return;
		}
		found.push([part === '..' ? 3 : 4, Buffer.from(part)]);
	});
	return found;
}

function compareComponents(
	left: readonly Component[],
	right: readonly Component[],
): number {
	const shared = Math.min(left.length, right.length);
	for (let index = 0; index < shared; index++) {
		const order = compareComponent(
			left[index] as Component,
			right[index] as Component,
		);
		if (order !== 0) return order;
	}
	return left.length - right.length;
}

function compareComponent(left: Component, right: Component): number {
	if (left[0] !== right[0]) return left[0] - right[0];
	return Buffer.compare(left[1], right[1]);
}

function sortAndDedupe(files: readonly string[]): string[] {
	const keyed = files.map((file) => ({ file, key: components(file) }));
	keyed.sort((left, right) => compareComponents(left.key, right.key));
	return keyed
		.filter((item, index) => {
			const previous = keyed[index - 1];
			return !previous || compareComponents(previous.key, item.key) !== 0;
		})
		.map((item) => item.file);
}
