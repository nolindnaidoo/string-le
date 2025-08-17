// TOML extractor using `@iarna/toml` parser and string collector
import { parse } from '@iarna/toml'
import type { Extractor } from '../../types'
import { collectStrings } from '../collect'

export const extractToml: Extractor = (text, options): readonly string[] => {
	try {
		const doc = parse(text)
		const strings = collectStrings(doc)
		return Object.freeze(strings)
	} catch (err) {
		if (options && typeof options.onParseError === 'function') {
			options.onParseError(`Invalid TOML: ${(err as Error).message}`)
		}
		return Object.freeze([] as string[])
	}
}
