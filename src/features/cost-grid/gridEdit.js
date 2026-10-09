import { BOQ_CODE_LIMIT, REMARK_LIMIT, RESOURCE_LIMIT, UNIT_LIMIT } from '../../domain/constants.js'
import { normalizeBoqCode, normalizeResourceText, normalizeText, parseNumeric } from '../../domain/normalization.js'
import { getNumericEditText, parseNumericEdit, setNumericEditValue } from '../../domain/numericExpressions.js'
import { updateWorksheetRowRate } from '../../domain/worksheetRates.js'

export const textFields = new Set(['boqCode', 'resource', 'unit', 'remark'])

export function editText(row, key) {
  return row?.[key] === null || row?.[key] === undefined ? '' : String(row[key])
}

export function editCellText(row, key) {
  if (['cqbi', 'cr', 'rate', 'override', 'boqQty'].includes(key)) return getNumericEditText(row, key)
  return editText(row, key)
}

export function parseEdit(key, text, { allowExpression = true } = {}) {
  if (textFields.has(key)) {
    const value = key === 'boqCode' ? normalizeBoqCode(text) : key === 'resource' || key === 'remark' ? normalizeResourceText(text) : normalizeText(text)
    const max = { boqCode: BOQ_CODE_LIMIT, resource: RESOURCE_LIMIT, unit: UNIT_LIMIT, remark: REMARK_LIMIT }[key]
    return value.length > max ? { error: `${key} must be ${max} characters or fewer.` } : { value, expression: null }
  }
  return allowExpression ? parseNumericEdit(text, key) : parseNumeric(text)
}

export function applyParsedEdit(row, key, parsed) {
  if (['cqbi', 'cr', 'rate', 'override', 'boqQty'].includes(key)) setNumericEditValue(row, key, parsed)
  else row[key] = parsed.value
}

export function updateEditableCell(draft, match, value) {
  const parsed = parseEdit(match.columnKey, value)
  if (parsed.error) throw new Error(`${match.columnLabel}: ${parsed.error}`)
  const row = draft.rows.find((item) => item.id === match.rowId)
  if (!row) throw new Error('A matching row is no longer available.')
  if (match.columnKey === 'rate') updateWorksheetRowRate(draft, match.rowId, parsed.value)
  applyParsedEdit(row, match.columnKey, parsed)
}
