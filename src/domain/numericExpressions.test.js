import test from 'node:test'
import assert from 'node:assert/strict'
import { createBlankRow } from './normalization.js'
import { getNumericEditText, parseNumericEdit, setNumericEditValue } from './numericExpressions.js'
import { validateRow } from './validation.js'

test('numeric arithmetic stores its result and preserves the source expression for editing', () => {
  const row = createBlankRow()
  const edit = parseNumericEdit('.5*50', 'cqbi')

  assert.deepEqual(edit, { value: 25, expression: '.5*50' })
  setNumericEditValue(row, 'cqbi', edit)
  assert.equal(row.cqbi, 25)
  assert.equal(getNumericEditText(row, 'cqbi'), '.5*50')
  assert.deepEqual(validateRow(row), [])
})

test('plain numeric replacement and clearing remove an old expression', () => {
  const row = createBlankRow()
  setNumericEditValue(row, 'rate', parseNumericEdit('12*2', 'rate'))
  setNumericEditValue(row, 'rate', parseNumericEdit('15', 'rate'))
  assert.equal(row.rate, 15)
  assert.equal(row.expressions, undefined)
  assert.equal(getNumericEditText(row, 'rate'), '15')

  setNumericEditValue(row, 'rate', parseNumericEdit('3+3', 'rate'))
  setNumericEditValue(row, 'rate', parseNumericEdit('', 'rate'))
  assert.equal(row.rate, null)
  assert.equal(row.expressions, undefined)
})

test('formula validation rejects expressions that do not match the stored numeric result', () => {
  const row = createBlankRow()
  row.cqbi = 26
  row.expressions = { cqbi: '.5*50' }
  assert.match(validateRow(row).join(' '), /must evaluate to its stored numeric value/)
})

test('invalid and overlong arithmetic input is rejected', () => {
  assert.match(parseNumericEdit('1+(', 'rate').error, /arithmetic expression|parenthesis|number/)
  assert.match(parseNumericEdit('1+'.repeat(130) + '1', 'rate').error, /256 characters/)
})
