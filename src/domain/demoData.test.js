import test from 'node:test'
import assert from 'node:assert/strict'
import { getRowDerivedValues } from './calculations.js'
import { createDemoSheets } from './demoData.js'
import { createProjectRecord } from './normalization.js'
import { summarizeProject } from './projectSummary.js'
import { validateProject } from './validation.js'

test('community-centre sample is valid and provides the intended review cases', () => {
  const projectId = 'sample-project'
  const timestamp = '2026-01-01T00:00:00.000Z'
  const sheets = createDemoSheets(projectId, timestamp)
  const project = createProjectRecord('Riverside Community Centre — Sample Estimate', sheets[0].id, false, timestamp)
  project.id = projectId

  assert.deepEqual(sheets.map((sheet) => sheet.name), ['Building Works', 'MEP Works', 'Preliminaries'])
  assert.equal(validateProject(project, sheets).length, 0)

  const summary = summarizeProject(sheets)
  assert.equal(summary.sheetCount, 3)
  assert.equal(summary.rowCount, 51)
  assert.equal(summary.missingCostCount, 1)
  assert.equal(summary.missingQuantityCount, 1)
  assert.equal(summary.incompleteCount, 2)
  assert.equal(summary.overriddenCount, 2)

  const resourceRows = sheets.flatMap((sheet) => sheet.data.rows)
  const rowTotal = resourceRows.reduce((total, row) => total + (getRowDerivedValues(row).totalCost ?? 0), 0)
  assert.equal(summary.total, rowTotal)
  assert.equal(summary.sheets.reduce((total, sheet) => total + sheet.total, 0), summary.total)

  const distinctQuantityRows = sheets[0].data.rows.filter((row) => row.boqCode === 'B.01')
  assert.equal(distinctQuantityRows.length, 2)
  assert.notEqual(distinctQuantityRows[0].boqQty, distinctQuantityRows[1].boqQty)
  const tileSupply = sheets[0].data.rows.find((row) => row.resource === 'Porcelain floor tiles, supply')
  assert.equal(tileSupply.boqQty, 172)
  assert.equal(tileSupply.cqbi, 1)
  assert.equal(getRowDerivedValues(tileSupply).totalCost, 4472)
  assert.ok(resourceRows.some((row) => row.override === 0))
})
