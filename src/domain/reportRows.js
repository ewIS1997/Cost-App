import { summarizeBoqItemCosts } from './boqItemCostSummary.js'
import { summarizeProject } from './projectSummary.js'

export function createProjectSummaryRows(sheets = []) {
  const projectTotal = summarizeProject(sheets).total
  return sheets.flatMap((sheet) => {
    const sheetSummary = summarizeProject([sheet]).sheets[0]
    const itemCosts = summarizeBoqItemCosts(sheet.data?.rows ?? [])
    return sheetSummary.boqGroups.map((group) => {
      const item = itemCosts.get(group.code)
      return {
        id: `${sheet.id}:${group.code || '__unassigned__'}`,
        sheetId: sheet.id,
        sheet: sheet.name,
        boqCode: group.code,
        boqQty: item?.maxBoqQty ?? null,
        unitCost: item?.unitCost ?? null,
        totalCost: group.total,
        percentage: projectTotal === 0 ? null : group.total / projectTotal * 100,
      }
    })
  })
}
