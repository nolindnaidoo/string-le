import { load } from 'js-yaml'
import type { Extractor } from '../../types'
import { collectStrings } from '../collect'

// YAML extractor with parse error reporting via callback
export const extractYaml: Extractor = (text, options): readonly string[] => {
	try {
		const doc = load(text)
		const strings = collectStrings(doc)
		return Object.freeze(strings)
	} catch (err) {
		if (options && typeof options.onParseError === 'function') {
			options.onParseError(`Invalid YAML: ${(err as Error).message}`)
		}
		return Object.freeze([] as string[])
	}
}
