import { getProjectionValue } from '../../domain/projection.js'

export function replaceText(text, query, replacement, matchCase = false, entireCell = false) {
  if (entireCell) return replacement
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(escaped, matchCase ? 'g' : 'gi'), () => replacement)
}

export function collectFindMatches(rows, columns, query, matchCase, entireCell, scope = null, limit = Infinity) {
  if (!query.trim()) return []
  const target = matchCase ? query : query.toLocaleLowerCase()
  const matches = []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    if (scope && !scope.rowIds.has(row.id)) continue
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const column = columns[columnIndex]
      if (scope && !scope.columnKeys.has(column.key)) continue
      const raw = getProjectionValue(row, column.key)
      const value = raw === null || raw === undefined ? '' : String(raw)
      const candidate = matchCase ? value : value.toLocaleLowerCase()
      if (entireCell ? candidate === target : candidate.includes(target)) {
        matches.push({ rowId: row.id, rowIndex, columnKey: column.key, columnLabel: column.label, value })
        if (matches.length >= limit) return matches
      }
    }
  }
  return matches
}
