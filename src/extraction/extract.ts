import type { Extractor, ExtractorOptions } from '../types'
import { extractCsv } from './formats/csv'
import { extractDotenv } from './formats/dotenv'
import { extractFallback } from './formats/fallback'
import { extractIni } from './formats/ini'
import { extractJson } from './formats/json'
import { extractToml } from './formats/toml'
import { extractYaml } from './formats/yaml'

const EXTRACTORS: Readonly<Record<string, Extractor>> = Object.freeze({
	json: extractJson,
	yaml: extractYaml,
	yml: extractYaml,
	csv: extractCsv,
	toml: extractToml,
	ini: extractIni,
	env: extractDotenv,
})

export function extractStrings(text: string, fileType: string, options?: ExtractorOptions): readonly string[] {
	const trimmed = text.trim()
	// Empty input produces empty, frozen result to prevent mutation.
	if (trimmed.length === 0) return Object.freeze([] as string[])
	const normalizedFileType = fileType.trim().toLowerCase()
	const extractor = EXTRACTORS[normalizedFileType]
	if (!extractor) return extractFallback(trimmed)
	return extractor(trimmed, options)
}
