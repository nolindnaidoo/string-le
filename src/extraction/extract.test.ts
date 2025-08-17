import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractStrings } from './extract'

test('extractStrings: trims text and returns empty for blank', () => {
	assert.deepEqual(extractStrings('   ', 'json'), [])
})

test('extractStrings › routes YAML when extension is .yaml or .yml', () => {
	const yaml = 'a: 1\nb: "x"\nc:\n  - y\n'
	const yml = yaml
	const outYaml = extractStrings(yaml, 'yaml')
	const outYml = extractStrings(yml, 'yml')
	assert.deepEqual(outYaml, outYml)
})

test('extractStrings: unknown type uses fallback', () => {
	const out = extractStrings('foo "bar" baz', 'unknown')
	assert.deepEqual(out, ['bar'])
})

test('extractStrings: trims and normalizes fileType key before routing', () => {
	const out = extractStrings('{"a":"x"}', '  JSON  ')
	assert.deepEqual(out, ['x'])
})
