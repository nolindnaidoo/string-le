// JSON extractor with graceful parse error handling
import type { Extractor } from '../../types'
import { collectStrings } from '../collect'

export const extractJson: Extractor = (text, options): readonly string[] => {
	try {
		const parsed = JSON.parse(text)
		const strings = collectStrings(parsed)
		return Object.freeze(strings)
	} catch (err) {
		if (options && typeof options.onParseError === 'function') {
			options.onParseError(`Invalid JSON: ${(err as Error).message}`)
		}
		return Object.freeze([] as string[])
	}
}
