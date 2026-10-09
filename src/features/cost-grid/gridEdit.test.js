import assert from 'node:assert/strict'
import test from 'node:test'
import { applyParsedEdit, editCellText, parseEdit, updateEditableCell } from './gridEdit.js'

test('grid numeric edits retain expressions and clear them for plain values and zero', () => {
  const row = { id: 'one', rate: null, resource: 'Concrete' }
  const expression = parseEdit('rate', '2*(3+4)')
  assert.equal(expression.value, 14)
  applyParsedEdit(row, 'rate', expression)
  assert.equal(editCellText(row, 'rate'), '2*(3+4)')
  applyParsedEdit(row, 'rate', parseEdit('rate', '0'))
  assert.equal(row.rate, 0)
  assert.equal(editCellText(row, 'rate'), '0')
  assert.equal(parseEdit('rate', '1/0').error !== undefined, true)
  assert.deepEqual(parseEdit('rate', ''), { value: null, expression: null })
})

test('find replacement validates before mutating and updates only its target row', () => {
  const draft = { rows: [{ id: 'one', rate: 1 }, { id: 'two', rate: 2 }] }
  const match = { rowId: 'one', columnKey: 'rate', columnLabel: 'Rate' }
  assert.throws(() => updateEditableCell(draft, match, '1/0'), /Rate:/)
  assert.equal(draft.rows[0].rate, 1)
  updateEditableCell(draft, match, '0')
  assert.deepEqual(draft.rows.map((row) => row.rate), [0, 2])
})

test('Remark preserves embedded and trailing line breaks within the existing length limit', () => {
  const value = 'First remark line\n  Second line\n'
  const parsed = parseEdit('remark', value)
  assert.equal(parsed.error, undefined)
  assert.equal(parsed.value, value)
  const row = { id: 'remark-row', remark: '' }
  applyParsedEdit(row, 'remark', parsed)
  assert.equal(editCellText(row, 'remark'), value)
  assert.match(parseEdit('remark', 'x'.repeat(1001)).error, /1000/)
})
