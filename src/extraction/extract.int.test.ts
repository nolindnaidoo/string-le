import * as assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { test } from 'node:test'
import { extractStrings } from './extract'

type CsvMeta = Readonly<{ csvHasHeader?: boolean; csvColumnIndex?: number }>

const dataRoot = path.resolve(__dirname, './__data__')

async function readDirFiles(dir: string): Promise<readonly string[]> {
	const entries = await fs.readdir(dir)
	return entries.filter((name) => !name.endsWith('.expected.txt') && !name.endsWith('.meta.json')).sort()
}

function detectTypeFromName(fileName: string): string {
	const base = path.basename(fileName)
	if (base === '.env' || base.startsWith('.env')) return 'env'
	return path.extname(fileName).slice(1)
}

async function readCsvMetaIfAny(filePath: string): Promise<CsvMeta | undefined> {
	const metaPath = `${filePath}.meta.json`
	try {
		const raw = await fs.readFile(metaPath, 'utf8')
		return JSON.parse(raw) as CsvMeta
	} catch {
		return undefined
	}
}

async function readExpectedLines(filePath: string): Promise<readonly string[] | undefined> {
	try {
		const raw = await fs.readFile(`${filePath}.expected.txt`, 'utf8')
		return raw.split(/\r?\n/).filter(Boolean)
	} catch {
		return undefined
	}
}

async function writeExpectedLines(filePath: string, lines: readonly string[]): Promise<void> {
	const content = `${lines.join('\n')}\n`
	await fs.writeFile(`${filePath}.expected.txt`, content, 'utf8')
}

function diffPretty(expected: readonly string[], actual: readonly string[]): string {
	const maxLen = Math.max(expected.length, actual.length)
	const lines: string[] = []
	for (let i = 0; i < maxLen; i++) {
		const e = expected[i]
		const a = actual[i]
		if (e === a) {
			lines.push(`  ${a ?? ''}`)
		} else {
			if (e !== undefined) lines.push(`- ${e}`)
			if (a !== undefined) lines.push(`+ ${a}`)
		}
	}
	return lines.join('\n')
}

function dedupeAndSort(values: readonly string[]): readonly string[] {
	const unique = Array.from(new Set(values))
	unique.sort((a, b) => a.localeCompare(b))
	return unique
}

async function runCase(filePath: string, update: boolean): Promise<void> {
	const text = await fs.readFile(filePath, 'utf8')
	const type = detectTypeFromName(filePath)
	const parseErrors: string[] = []
	const baseOptions = {
		onParseError: (m: string): void => {
			parseErrors.push(m)
		},
	}
	const csvMeta = type === 'csv' ? await readCsvMetaIfAny(filePath) : undefined
	const options = { ...baseOptions, ...(csvMeta ?? {}) }

	const extracted = extractStrings(text, type, options)
	const normalized = dedupeAndSort(extracted)

	if (update) {
		await writeExpectedLines(filePath, normalized)
		return
	}

	const expected = await readExpectedLines(filePath)
	assert.ok(expected, `Missing expected file for ${path.basename(filePath)} — run npm run test:update`)
	try {
		assert.deepEqual(normalized, expected)
	} catch {
		const pretty = diffPretty(expected ?? [], normalized)
		const message = `\nDiff for ${path.basename(filePath)}:\n${pretty}\n`
		throw new assert.AssertionError({ message })
	}
}

async function main(): Promise<void> {
	const update = process.argv.includes('--update')
	const files = await readDirFiles(dataRoot)
	for (const name of files) {
		const filePath = path.join(dataRoot, name)
		await runCase(filePath, update)
	}
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main().catch(() => {})

test('integration › data‑driven fixtures match expected outputs', async () => {
	await main()
})
