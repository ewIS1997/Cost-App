import { getTotalCost } from './calculations.js'

const clean = (value) => String(value ?? '').trim()

export function getProjectResourceKey(resource, unit) {
  const name = clean(resource).toLocaleLowerCase()
  if (!name) return null
  return JSON.stringify([name, clean(unit).toLocaleLowerCase()])
}

export function summarizeProjectResources(sheets = []) {
  const groups = new Map()
  const orderedSheets = [...sheets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  for (const sheet of orderedSheets) {
    for (const row of sheet.data?.rows ?? []) {
      const key = getProjectResourceKey(row.resource, row.unit)
      if (!key) continue
      if (!groups.has(key)) groups.set(key, {
        key, name: clean(row.resource), unit: clean(row.unit), quantity: 0,
         incompleteQuantityLines: 0, incompleteCostLines: 0, lineCount: 0, totalCost: 0, costLineCount: 0, rates: new Set(), blankRateLines: 0,
        references: [],
      })
      const group = groups.get(key)
      group.lineCount++
      group.references.push({ sheetId: sheet.id, rowId: row.id })
       if (typeof row.rate === 'number' && Number.isFinite(row.rate)) group.rates.add(row.rate)
       else group.blankRateLines++
       const totalCost = getTotalCost(row)
       if (totalCost === null) group.incompleteCostLines++
       else { group.totalCost += totalCost; group.costLineCount++ }
      const inputs = [row.cqbi, row.cr, row.boqQty]
      if (inputs.every((value) => typeof value === 'number' && Number.isFinite(value))) {
        const amount = row.cqbi * row.cr * row.boqQty
        if (Number.isFinite(amount)) group.quantity += amount
        else group.incompleteQuantityLines++
      } else group.incompleteQuantityLines++
    }
  }
  const summarized = [...groups.values()].map((group) => {
    const rates = [...group.rates]
    const rateStatus = rates.length > 1 ? 'multiple' : rates.length === 0 ? 'missing' : group.blankRateLines ? 'incomplete' : 'consistent'
    return { ...group, totalCost: group.costLineCount ? group.totalCost : null, rates, rateStatus, rate: rates.length === 1 && group.blankRateLines === 0 ? rates[0] : null }
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.unit.localeCompare(b.unit, undefined, { sensitivity: 'base' }))
  const projectTotalCost = summarized.reduce((total, resource) => total + (resource.totalCost ?? 0), 0)
  return summarized.map((resource) => ({
    ...resource,
    costPercentage: projectTotalCost !== 0 && resource.totalCost !== null ? resource.totalCost / projectTotalCost * 100 : null,
    projectTotalCost,
  }))
}
