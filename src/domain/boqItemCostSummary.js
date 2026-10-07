import { getRowDerivedValues } from './calculations.js'
import { normalizeBoqCode } from './normalization.js'

export function summarizeBoqItemCosts(rows = []) {
  const summaries = new Map()
  for (const row of rows) {
    const code = normalizeBoqCode(row.boqCode)
    if (!code) continue
    if (!summaries.has(code)) summaries.set(code, { code, totalCost: 0, maxBoqQty: null })
    const summary = summaries.get(code)
    const totalCost = getRowDerivedValues(row).totalCost
    if (typeof totalCost === 'number' && Number.isFinite(totalCost)) summary.totalCost += totalCost
    if (typeof row.boqQty === 'number' && Number.isFinite(row.boqQty)) {
      summary.maxBoqQty = summary.maxBoqQty === null ? row.boqQty : Math.max(summary.maxBoqQty, row.boqQty)
    }
  }
  for (const summary of summaries.values()) {
    summary.unitCost = summary.maxBoqQty !== null && summary.maxBoqQty !== 0
      ? summary.totalCost / summary.maxBoqQty
      : null
    if (!Number.isFinite(summary.unitCost)) summary.unitCost = null
  }
  return summaries
}
