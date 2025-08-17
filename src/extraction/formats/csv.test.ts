import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractCsv, streamCsvStrings } from './csv'

test('csv: header=false, all columns, trims (no numeric filtering)', () => {
	const text = '  1, a , 2\n3, b, 4\n, c, 5\n'
	const out = extractCsv(text, { csvHasHeader: false })
	assert.deepEqual(out, ['1', 'a', '2', '3', 'b', '4', 'c', '5'])
})

test('csv › selects the requested column and skips header when header=true', () => {
	const text = 'name,age\n alice , 30\n bob , 40\n'
	const out = extractCsv(text, { csvHasHeader: true, csvColumnIndex: 0 })
	assert.deepEqual(out, ['alice', 'bob'])
})

test('csv: quoted commas and escaped quotes', () => {
	const text = 'name,desc\n"a,1","x""y"\n"b,2"," z "\n'
	const out = extractCsv(text, { csvHasHeader: true })
	assert.deepEqual(out, ['a,1', 'x"y', 'b,2', 'z'])
})

test('csv: columnIndex with missing cells filters out undefined; keeps non-empty (including numerics)', () => {
	const text = 'c1,c2,c3\n1,2\n3,  , 5\n'
	const out = extractCsv(text, { csvHasHeader: true, csvColumnIndex: 2 })
	assert.deepEqual(out, ['5'])
})

test('csv: columnIndex without header does not skip first line', () => {
	const text = 'a,b\nc,d\n'
	const out = extractCsv(text, { csvHasHeader: false, csvColumnIndex: 0 })
	assert.deepEqual(out, ['a', 'c'])
})

test('csv: empty text returns empty array', () => {
	const out = extractCsv('')
	assert.deepEqual(out, [])
})

test('csv streaming: basic streaming with all columns', async () => {
	const text = 'a,b\nc,d\n'
	const results: string[] = []
	for await (const value of streamCsvStrings(text)) {
		results.push(value)
	}
	assert.deepEqual(results, ['a', 'b', 'c', 'd'])
})

test('csv streaming: with header and column selection', async () => {
	const text = 'name,age\nalice,30\nbob,40\n'
	const results: string[] = []
	for await (const value of streamCsvStrings(text, { csvHasHeader: true, csvColumnIndex: 0 })) {
		results.push(value)
	}
	assert.deepEqual(results, ['alice', 'bob'])
})

test('csv streaming: empty text yields no values', async () => {
	const results: string[] = []
	for await (const value of streamCsvStrings('')) {
		results.push(value)
	}
	assert.deepEqual(results, [])
})

test('csv streaming: whitespace trimming', async () => {
	const text = '  \n  \n'
	const results: string[] = []
	for await (const value of streamCsvStrings(text)) {
		results.push(value)
	}
	assert.deepEqual(results, [])
})

test('csv streaming: column selection with missing cells', async () => {
	const text = 'a,b,c\n1,2\n3,,5\n'
	const results: string[] = []
	for await (const value of streamCsvStrings(text, { csvHasHeader: true, csvColumnIndex: 2 })) {
		results.push(value)
	}
	assert.deepEqual(results, ['5'])
})
