import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCellClipboardMatrix, buildRowClipboardMatrix, classifyClipboardPaste, clipboardCellValue, getPasteTargets, parseClipboardText, serializeClipboardMatrix } from './clipboard.js'

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

test('cell and row copying preserve expressions and calculate derived columns including zero', () => {
  const row = { id: 'one', resource: 'Work', rate: 0, expressions: { rate: '2-2' }, cqbi: 2, cr: 3, boqQty: 5, override: null }
  const incomplete = { id: 'two', resource: 'Later', rate: null, cqbi: null, cr: 3, boqQty: null, override: null }
  const columns = ['resource', 'rate', 'cost', 'usedCost', 'totalCost'].map((key) => ({ key }))
  const rowModel = [{ original: row }, null, { original: incomplete }]
  assert.equal(clipboardCellValue(row, 'rate'), '2-2')
  assert.deepEqual(buildCellClipboardMatrix(rowModel, columns, { top: 0, bottom: 2, left: 1, right: 4 }), [
    ['2-2', 0, 0, 0], ['', '', '', ''],
  ])
  assert.deepEqual(buildRowClipboardMatrix([incomplete, row], columns), [
    ['Later', '', '', '', ''], ['Work', '2-2', 0, 0, 0],
  ])
  assert.deepEqual(buildCellClipboardMatrix(rowModel, columns, null), [])
})

test('spreadsheet text takes precedence over image clipboard representations', () => {
  const imageItem = { kind: 'file', type: 'image/png' }
  const clipboardData = {
    items: [imageItem],
    getData: (type) => type === 'text/plain' ? 'A.01\tConcrete\r\nA.02\tSteel' : '',
  }
  assert.deepEqual(classifyClipboardPaste(clipboardData), { type: 'text', source: 'plain', text: 'A.01\tConcrete\r\nA.02\tSteel' })
})

test('image-only clipboard content remains available for attachment', () => {
  const imageItem = { kind: 'file', type: 'image/png' }
  const clipboardData = { items: [imageItem], getData: () => '' }
  assert.deepEqual(classifyClipboardPaste(clipboardData), { type: 'image', source: 'image', imageItem })
})
