import * as nls from 'vscode-nls'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export function normalizeFileType(raw: string | undefined): SupportedFileType | undefined {
	if (!raw) return undefined
	const v = raw.trim().toLowerCase()
	return isSupportedFileType(v) ? v : undefined
}

export type SupportedFileType = 'json' | 'yaml' | 'yml' | 'csv' | 'toml' | 'ini' | 'env' | 'fallback'

export function isSupportedFileType(value: string): value is SupportedFileType {
	return (
		value === 'json' ||
		value === 'yaml' ||
		value === 'yml' ||
		value === 'csv' ||
		value === 'toml' ||
		value === 'ini' ||
		value === 'env' ||
		value === 'fallback'
	)
}

// Import nls for consistent per-file initialization even if `localize` is unused
void localize
