import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractYaml } from './yaml'

test('yaml: extracts nested strings', () => {
	const yaml = 'a: x\nb:\n  - c: y\n'
	const out = extractYaml(yaml)
	assert.deepEqual(out, ['x', 'y'])
})

test('yaml: onParseError invoked on invalid YAML', () => {
	let called = ''
	const out = extractYaml('a: [', {
		onParseError: (m) => {
			called = m
		},
	})
	assert.deepEqual(out, [])
	assert.ok(called.startsWith('Invalid YAML:'))
})
