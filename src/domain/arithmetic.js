import { NUMERIC_ABSOLUTE_LIMIT } from './constants.js'
import { parseNumeric } from './normalization.js'

const TOKEN = /\s*((?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?|([()+\-*/]))/y

export function evaluateArithmeticExpression(input) {
  if (input === null || input === undefined || String(input).trim() === '') return { value: null, error: null }
  let source = String(input).trim()
  if (source.startsWith('=')) source = source.slice(1).trim()
  if (!source) return { value: null, error: 'Enter a valid arithmetic expression.' }

  const tokens = []
  let position = 0
  while (position < source.length) {
    TOKEN.lastIndex = position
    const match = TOKEN.exec(source)
    if (!match) return { value: null, error: 'Enter a valid arithmetic expression.' }
    position = TOKEN.lastIndex
    if (!match[2]) {
      const parsed = parseNumeric(match[1])
      if (parsed.error || parsed.value === null) return { value: null, error: parsed.error || 'Enter a valid number.' }
      tokens.push({ type: 'number', value: parsed.value })
    } else tokens.push({ type: match[2], value: match[2] })
  }

  let cursor = 0
  const peek = () => tokens[cursor]?.type
  const checked = (value) => {
    if (!Number.isFinite(value)) throw new Error('Calculation result must be finite.')
    return value
  }
  const primary = () => {
    if (peek() === 'number') return tokens[cursor++].value
    if (peek() === '(') {
      cursor++
      const value = expression()
      if (peek() !== ')') throw new Error('Expected a closing parenthesis.')
      cursor++
      return value
    }
    throw new Error('Expected a number or opening parenthesis.')
  }
  const unary = () => {
    if (peek() === '+') { cursor++; return unary() }
    if (peek() === '-') { cursor++; return checked(-unary()) }
    return primary()
  }
  const product = () => {
    let value = unary()
    while (peek() === '*' || peek() === '/') {
      const operator = tokens[cursor++].type
      const right = unary()
      if (operator === '/' && right === 0) throw new Error('Cannot divide by zero.')
      value = checked(operator === '*' ? value * right : value / right)
    }
    return value
  }
  const expression = () => {
    let value = product()
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[cursor++].type
      const right = product()
      value = checked(operator === '+' ? value + right : value - right)
    }
    return value
  }

  try {
    const value = expression()
    if (cursor !== tokens.length) throw new Error('Unexpected input after the expression.')
    if (Math.abs(value) > NUMERIC_ABSOLUTE_LIMIT) throw new Error(`Calculation result must be within ±${NUMERIC_ABSOLUTE_LIMIT}.`)
    return { value, error: null }
  } catch (error) {
    return { value: null, error: error.message }
  }
}
