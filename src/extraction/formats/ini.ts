import { parse } from 'ini'
import type { Extractor } from '../../types'
import { collectStrings } from '../collect'

// INI extractor using `ini` parser and string collector
export const extractIni: Extractor = (text, options): readonly string[] => {
	try {
		const doc = parse(text)
		const strings = collectStrings(doc)
		return Object.freeze(strings)
	} catch (err) {
		if (options && typeof options.onParseError === 'function') {
			options.onParseError(`Invalid INI: ${(err as Error).message}`)
		}
		return Object.freeze([] as string[])
	}
}
