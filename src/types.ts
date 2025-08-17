export type ExtractorOptions = Readonly<{
	onParseError?: (message: string) => void
	csvHasHeader?: boolean
	csvColumnIndex?: number
	csvColumnIndexes?: readonly number[]
	selectAllColumns?: boolean
}>

export type Extractor = (text: string, options?: ExtractorOptions) => readonly string[]
