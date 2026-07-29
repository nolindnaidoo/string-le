export function normalizeFileType(
	raw: string | undefined,
): SupportedFileType | undefined {
	if (!raw) return undefined;
	const v = raw.trim().toLowerCase();
	return isSupportedFileType(v) ? v : undefined;
}

export type SupportedFileType =
	| 'json'
	| 'yaml'
	| 'yml'
	| 'csv'
	| 'toml'
	| 'ini'
	| 'env'
	| 'fallback';

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
	);
}
