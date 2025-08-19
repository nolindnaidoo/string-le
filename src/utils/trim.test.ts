import * as assert from 'node:assert'
import { test } from 'node:test'
import { applyTrimMode } from './trim'

test('applyTrimMode: both trims start and end only', () => {
  const line = '  hello  world  '
  const result = applyTrimMode(line, 'both')
  assert.strictEqual(result, 'hello  world')
})

test('applyTrimMode: leading trims only leading whitespace (spaces, tabs)', () => {
  const line1 = '   foo  '
  const line2 = '\t\tbar  '
  assert.strictEqual(applyTrimMode(line1, 'leading'), 'foo  ')
  assert.strictEqual(applyTrimMode(line2, 'leading'), 'bar  ')
})

test('applyTrimMode: trailing trims only trailing whitespace (spaces, tabs)', () => {
  const line1 = '  baz   '
  const line2 = '  qux\t\t'
  assert.strictEqual(applyTrimMode(line1, 'trailing'), '  baz')
  assert.strictEqual(applyTrimMode(line2, 'trailing'), '  qux')
})

test('applyTrimMode: empty and whitespace-only lines', () => {
  assert.strictEqual(applyTrimMode('', 'both'), '')
  assert.strictEqual(applyTrimMode('   ', 'both'), '')
  assert.strictEqual(applyTrimMode('\t\t', 'leading'), '')
  assert.strictEqual(applyTrimMode('   ', 'trailing'), '')
})

test('applyTrimMode: preserves internal whitespace and characters', () => {
  const line = '\t  a \t b  c  '
  const both = applyTrimMode(line, 'both')
  const leading = applyTrimMode(line, 'leading')
  const trailing = applyTrimMode(line, 'trailing')
  assert.strictEqual(both, 'a \t b  c')
  assert.strictEqual(leading, 'a \t b  c  ')
  assert.strictEqual(trailing, '\t  a \t b  c')
})

test('applyTrimMode: multi-line when applied per line', () => {
  const text = '\t  a \t b  c  \n' + '  d  e  f  '
  const both = text.split('\n').map((l) => applyTrimMode(l, 'both')).join('\n')
  const leading = text.split('\n').map((l) => applyTrimMode(l, 'leading')).join('\n')
  const trailing = text.split('\n').map((l) => applyTrimMode(l, 'trailing')).join('\n')

  assert.strictEqual(both, 'a \t b  c\nd  e  f')
  assert.strictEqual(leading, 'a \t b  c  \nd  e  f  ')
  assert.strictEqual(trailing, '\t  a \t b  c\n  d  e  f')
})
