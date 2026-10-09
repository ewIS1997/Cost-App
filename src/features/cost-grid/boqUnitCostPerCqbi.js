import { normalizeBoqCode } from '../../domain/normalization.js'

/** Read CQBI from each BQ item's first worksheet resource row without modifying rows. */
export function firstCqbiByBoqCode(rows = []) {
  const firstValues = new Map()

  for (const row of rows) {
    const code = normalizeBoqCode(row?.boqCode)
    if (!code || firstValues.has(code)) continue
    firstValues.set(code, typeof row.cqbi === 'number' && Number.isFinite(row.cqbi) ? row.cqbi : null)
  }

  return firstValues
}

/** Return the display-only unit-cost/CQBI value, or null when it is undefined. */
export function unitCostPerCqbi(unitCost, cqbi) {
  if (typeof unitCost !== 'number' || !Number.isFinite(unitCost)
    || typeof cqbi !== 'number' || !Number.isFinite(cqbi)
    || cqbi === 0) return null

  const result = unitCost / cqbi
  return Number.isFinite(result) ? result : null
}
