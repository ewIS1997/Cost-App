import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPasteTargets, parseClipboardText, serializeClipboardMatrix } from './clipboard.js'

test('parses tabs, Windows line endings, quoted tabs, and quoted newlines', () => {
  assert.deepEqual(parseClipboardText('A\t"B\tC"\r\n"line 1\nline 2"\tD\r\n'), [['A', 'B\tC'], ['line 1\nline 2', 'D']])
})

test('serializes a rectangular matrix as Excel-compatible quoted TSV', () => {
  assert.equal(serializeClipboardMatrix([['a', 'b\tc'], ['say "hi"', 'line\nnext']]), 'a\t"b\tc"\r\n"say ""hi"""\t"line\nnext"')
})

test('one copied cell fills a selected range', () => {
  const targets = getPasteTargets([['x']], { top: 1, bottom: 2, left: 2, right: 3 }, 5, true)
  assert.equal(targets.flat().length, 4)
  assert.ok(targets.flat().every((cell) => cell.value === 'x'))
})

test('rejects paste extending beyond the final worksheet column', () => {
  assert.throws(() => getPasteTargets([['a', 'b']], { top: 0, bottom: 0, left: 1, right: 1 }, 2), /last worksheet column/)
})
