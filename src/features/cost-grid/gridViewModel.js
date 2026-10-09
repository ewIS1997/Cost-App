import { normalizeBoqCode, parseNumeric } from '../../domain/normalization.js'
import { getProjectionValue } from '../../domain/projection.js'

export function selectionSummary(selectedRowIds, selectionBounds, rowModel, columns) {
  if (selectedRowIds.length) return { kind: 'rows', rowCount: selectedRowIds.length }
  if (!selectionBounds) return null
  const cellCount = (selectionBounds.bottom - selectionBounds.top + 1) * (selectionBounds.right - selectionBounds.left + 1)
  if (cellCount <= 1) return null
  let count = 0
  let numericCount = 0
  let sum = 0
  for (let rowIndex = selectionBounds.top; rowIndex <= selectionBounds.bottom; rowIndex++) {
    const row = rowModel[rowIndex]?.original
    if (!row) continue
    for (let columnIndex = selectionBounds.left; columnIndex <= selectionBounds.right; columnIndex++) {
      const value = getProjectionValue(row, columns[columnIndex].key)
      if (value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '')) count++
      const parsed = parseNumeric(value)
      if (!parsed.error && parsed.value !== null) { sum += parsed.value; numericCount++ }
    }
  }
  return { kind: 'cells', count, numericCount, sum, average: numericCount ? sum / numericCount : null }
}

export function lastVisibleIndexByCode(visibleRows) {
  const result = new Map()
  visibleRows.forEach((row, index) => {
    const code = normalizeBoqCode(row.boqCode)
    if (code) result.set(code, index)
  })
  return result
}

export function imageAttachmentsByCode(imageAttachments) {
  const result = new Map()
  for (const attachment of imageAttachments) {
    const group = result.get(attachment.boqCode) ?? []
    group.push(attachment)
    result.set(attachment.boqCode, group)
  }
  return result
}

export function rowLayoutSignatures(visibleRows, showImages, lastVisibleIndexes, attachmentsByCode) {
  const signatures = new Map()
  visibleRows.forEach((row, index) => {
    const code = normalizeBoqCode(row.boqCode)
    const galleryCount = showImages && lastVisibleIndexes.get(code) === index
      ? attachmentsByCode.get(code)?.length ?? 0
      : 0
    signatures.set(row.id, JSON.stringify([row.resource ?? '', row.remark ?? '', galleryCount]))
  })
  return signatures
}

export function visibleBoqGroups(visibleRows) {
  const groups = new Map()
  let previousCode = null
  let groupIndex = -1
  visibleRows.forEach((row) => {
    const code = normalizeBoqCode(row.boqCode)
    if (!code) { previousCode = null; return }
    const startsGroup = code !== previousCode
    if (startsGroup) groupIndex += 1
    groups.set(row.id, { tone: groupIndex % 2 === 0 ? 'a' : 'b', startsGroup })
    previousCode = code
  })
  return groups
}
