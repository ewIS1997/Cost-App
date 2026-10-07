import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateArithmeticExpression } from './arithmetic.js'

test('evaluates arithmetic with precedence, parentheses, unary signs, and decimals', () => {
  assert.deepEqual(evaluateArithmeticExpression('12.5 * 4'), { value: 50, error: null })
  assert.equal(evaluateArithmeticExpression('(12 + 3) * 2').value, 30)
  assert.equal(evaluateArithmeticExpression('2 + 3 * 4').value, 14)
  assert.equal(evaluateArithmeticExpression('-5 * +2').value, -10)
  assert.equal(evaluateArithmeticExpression('=.5 + 1.5').value, 2)
  assert.equal(evaluateArithmeticExpression('1,200 / 3').value, 400)
})

test('accepts ordinary numbers and blank input', () => {
  assert.equal(evaluateArithmeticExpression('250.75').value, 250.75)
  assert.deepEqual(evaluateArithmeticExpression('  '), { value: null, error: null })
})

test('rejects malformed expressions, division by zero, non-finite and out-of-range results', () => {
  const overflowing = `1e12${' * 1e12'.repeat(30)}`
  for (const input of ['1 +', '2 ** 3', '2 + (3', '1 / 0', overflowing, '1e12 * 1e12', '1000000000001', '1,2 + 3']) {
    assert.ok(evaluateArithmeticExpression(input).error, `Expected ${input} to be rejected`)
  }
})
