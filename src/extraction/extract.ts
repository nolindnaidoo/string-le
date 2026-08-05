import type { Extractor, ExtractorOptions } from '../types';
import { extractCsv } from './formats/csv';
import { extractDotenv } from './formats/dotenv';
import { extractFallback } from './formats/fallback';
import { extractIni } from './formats/ini';
import { extractJson } from './formats/json';
import { extractToml } from './formats/toml';
import { extractYaml } from './formats/yaml';

const EXTRACTORS: Readonly<Record<string, Extractor>> = Object.freeze({
	json: extractJson,
	yaml: extractYaml,
	yml: extractYaml,
	csv: extractCsv,
	toml: extractToml,
	ini: extractIni,
	env: extractDotenv,
	fallback: extractFallback,
});

const EMPTY_RESULT: readonly string[] = Object.freeze([]);

/**
 * Extract strings from text based on file type.
 * Returns frozen array to communicate immutability.
 */
export function extractStrings(
	text: string,
	fileType: string,
	options?: ExtractorOptions,
): readonly string[] {
	const trimmedText = text.trim();

	// Guard: Empty input
	if (trimmedText.length === 0) {
		return EMPTY_RESULT;
	}

	const normalizedFileType = canonicaliseFileTypeKey(fileType);
	const extractor = findExtractor(normalizedFileType);

	return extractor(trimmedText, options);
}

/**
 * Canonicalise a file-type string for extractor lookup.
 *
 * Deliberately not `normalizeFileType` from config/fileTypes.ts, which
 * validates against the supported list and returns undefined for anything
 * else. This one accepts any string because an unrecognised type is a valid
 * outcome here — findExtractor falls back to the generic extractor. The two
 * shared a name and a rough shape while promising different things.
 */
function canonicaliseFileTypeKey(fileType: string): string {
	return fileType.trim().toLowerCase();
}

function findExtractor(fileType: string): Extractor {
	const extractor = EXTRACTORS[fileType];

	if (!extractor) {
		return extractFallback;
	}

	return extractor;
}
