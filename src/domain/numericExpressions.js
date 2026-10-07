import { evaluateArithmeticExpression } from './arithmetic.js'
import { parseNumeric } from './normalization.js'

const NUMERIC_INPUT_FIELDS = new Set(['cqbi', 'cr', 'rate', 'override', 'boqQty'])

export function parseNumericEdit(text, key = 'value') {
  const evaluated = evaluateArithmeticExpression(text)
  if (evaluated.error) return { error: `${key}: ${evaluated.error}` }
  const literal = parseNumeric(text)
  const expression = literal.error && String(text ?? '').trim() ? String(text).trim() : null
  if (expression?.length > 256) return { error: `${key}: expressions must be 256 characters or fewer.` }
  return { value: evaluated.value, expression }
}

export function setNumericEditValue(row, key, edit) {
  if (!NUMERIC_INPUT_FIELDS.has(key)) throw new Error(`Unsupported numeric input field: ${key}.`)
  row[key] = edit.value
  if (edit.expression) row.expressions = { ...row.expressions, [key]: edit.expression }
  else if (row.expressions?.[key]) {
    const expressions = { ...row.expressions }
    delete expressions[key]
    if (Object.keys(expressions).length) row.expressions = expressions
    else delete row.expressions
  }
}

export function getNumericEditText(row, key) {
  if (row?.expressions?.[key]) return row.expressions[key]
  return row?.[key] === null || row?.[key] === undefined ? '' : String(row[key])
}
