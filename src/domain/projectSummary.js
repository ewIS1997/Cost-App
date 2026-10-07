import { getRowDerivedValues } from './calculations.js'
import { normalizeBoqCode } from './normalization.js'

const isPopulated = (row) => Boolean(
  normalizeBoqCode(row.boqCode)
  || String(row.resource ?? '').trim()
  || String(row.unit ?? '').trim()
  || String(row.remark ?? '').trim()
  || [row.cqbi, row.cr, row.rate, row.override, row.boqQty].some((value) => value !== null && value !== undefined),
)

export function summarizeProject(sheets = []) {
  let total = 0
  let rowCount = 0
  let missingCostCount = 0
  let missingQuantityCount = 0
  let overriddenCount = 0

  const sheetSummaries = sheets.map((sheet) => {
    let sheetTotal = 0
    let sheetRowCount = 0
    let sheetMissingCostCount = 0
    let sheetMissingQuantityCount = 0
    let sheetOverriddenCount = 0
    let sheetIncompleteCount = 0
    const groups = new Map()

    for (const row of sheet.data?.rows ?? []) {
      if (!isPopulated(row)) continue
      const values = getRowDerivedValues(row)
      const code = normalizeBoqCode(row.boqCode) || ''
      if (!groups.has(code)) groups.set(code, { code, rowCount: 0, total: 0, missingCostCount: 0, missingQuantityCount: 0, incompleteCount: 0 })
      const group = groups.get(code)
      const hasCost = values.usedCost !== null
      const hasQuantity = values.boqQty !== null
      const hasTotal = values.totalCost !== null
      sheetRowCount += 1
      rowCount += 1
      group.rowCount += 1
      if (hasCost && hasQuantity && hasTotal) {
        sheetTotal += values.totalCost
        group.total += values.totalCost
      }
      if (!hasCost) { sheetMissingCostCount += 1; missingCostCount += 1; group.missingCostCount += 1 }
      if (!hasQuantity) { sheetMissingQuantityCount += 1; missingQuantityCount += 1; group.missingQuantityCount += 1 }
      if (!hasCost || !hasQuantity) { sheetIncompleteCount += 1; group.incompleteCount += 1 }
      if (row.override !== null) { sheetOverriddenCount += 1; overriddenCount += 1 }
    }

    const boqGroups = [...groups.values()].sort((a, b) => {
      if (!a.code) return 1
      if (!b.code) return -1
      return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
    })
    total += sheetTotal
    return { id: sheet.id, name: sheet.name, total: sheetTotal, rowCount: sheetRowCount, missingCostCount: sheetMissingCostCount, missingQuantityCount: sheetMissingQuantityCount, overriddenCount: sheetOverriddenCount, incompleteCount: sheetIncompleteCount, boqGroups }
  })
  // Count coded BOQ groups per sheet. Reusing a code on another sheet represents
  // another sheet-level BOQ item and should contribute to the displayed metric.
  const boqItemCount = sheetSummaries.reduce((count, sheet) => count + sheet.boqGroups.filter((group) => group.code).length, 0)

  return {
    total,
    sheetCount: sheets.length,
    rowCount,
    boqItemCount,
    missingCostCount,
    missingQuantityCount,
    incompleteCount: sheetSummaries.reduce((sum, sheet) => sum + sheet.incompleteCount, 0),
    overriddenCount,
    sheets: sheetSummaries,
  }
}
