import { FILL_CELL_LIMIT, ROW_LIMIT } from '../../domain/constants.js'
import { getRowDerivedValues } from '../../domain/calculations.js'

export function clipboardCellValue(row, key) {
  return row.expressions?.[key] ?? row[key] ?? ''
}

function copiedValue(row, key) {
  return key === 'cost' || key === 'usedCost' || key === 'totalCost'
    ? getRowDerivedValues(row)[key] ?? '' : clipboardCellValue(row, key)
}

export function buildCellClipboardMatrix(rowModel, columns, selectionBounds) {
  if (!selectionBounds) return []
  const matrix = []
  for (let rowIndex = selectionBounds.top; rowIndex <= selectionBounds.bottom; rowIndex++) {
    const row = rowModel[rowIndex]?.original
    if (!row) continue
    matrix.push(columns.slice(selectionBounds.left, selectionBounds.right + 1)
      .map((column) => copiedValue(row, column.key)))
  }
  return matrix
}

export function buildRowClipboardMatrix(rows, columns) {
  return rows.map((row) => columns.map((column) => copiedValue(row, column.key)))
}

export function parseClipboardText(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n')
  if (!source) return [['']]
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { value += '"'; index++ }
      else if (char === '"') quoted = false
      else value += char
    } else if (char === '"' && value === '') quoted = true
    else if (char === '\t') { row.push(value); value = '' }
    else if (char === '\n') { row.push(value); rows.push(row); row = []; value = '' }
    else value += char
  }
  row.push(value)
  rows.push(row)
  if (rows.length > 1 && rows.at(-1).length === 1 && rows.at(-1)[0] === '') rows.pop()
  return rows
}

export function serializeClipboardMatrix(matrix) {
  return matrix.map((row) => row.map((value) => {
    const text = String(value ?? '')
    return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }).join('\t')).join('\r\n')
}

export function clipboardTableTextFromHtml(html) {
  if (typeof DOMParser === 'undefined' || !html) return null
  const document = new DOMParser().parseFromString(String(html), 'text/html')
  const table = document.querySelector('table')
  if (!table) return null
  const rows = [...table.rows].map((row) => [...row.cells].map((cell) => cell.innerText ?? cell.textContent ?? ''))
  return rows.length ? serializeClipboardMatrix(rows) : null
}

export function classifyClipboardPaste(clipboardData) {
  const text = clipboardData?.getData?.('text/plain') ?? ''
  if (text !== '') return { type: 'text', source: 'plain', text }

  const htmlText = clipboardTableTextFromHtml(clipboardData?.getData?.('text/html') ?? '')
  if (htmlText !== null) return { type: 'text', source: 'html', text: htmlText }

  const imageItem = Array.from(clipboardData?.items ?? [])
    .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
  if (imageItem) return { type: 'image', source: 'image', imageItem }
  return { type: 'text', source: 'empty', text }
}

export function getPasteTargets(matrix, bounds, columnCount, selectedRange = false) {
  const normalized = matrix.length === 1 && matrix[0].length === 1 && selectedRange && bounds
    ? Array.from({ length: bounds.bottom - bounds.top + 1 }, () => Array(bounds.right - bounds.left + 1).fill(matrix[0][0]))
    : matrix
  const startRow = bounds?.top ?? 0
  const startColumn = bounds?.left ?? 0
  const cellCount = normalized.reduce((count, row) => count + row.length, 0)
  if (cellCount > FILL_CELL_LIMIT * 2) throw new Error(`A paste cannot exceed ${(FILL_CELL_LIMIT * 2).toLocaleString()} cells.`)
  if (startColumn + normalized.reduce((width, row) => Math.max(width, row.length), 0) > columnCount) throw new Error('The pasted data extends beyond the last worksheet column.')
  if (startRow + normalized.length > ROW_LIMIT) throw new Error(`A worksheet cannot contain more than ${ROW_LIMIT.toLocaleString()} rows.`)
  return normalized.map((row, rowOffset) => row.map((value, columnOffset) => ({
    rowIndex: startRow + rowOffset,
    columnIndex: startColumn + columnOffset,
    value,
  })))
}
