export type ExtractorOptions = Readonly<{
	onParseError?: (message: string) => void;
	csvHasHeader?: boolean;
	csvColumnIndex?: number;
	csvColumnIndexes?: readonly number[];
	selectAllColumns?: boolean;
	/** Let a fallback quoted run span lines. */
	multiline?: boolean;
}>;

export type Extractor = (
	text: string,
	options?: ExtractorOptions,
) => readonly string[];
