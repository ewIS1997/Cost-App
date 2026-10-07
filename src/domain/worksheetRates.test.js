import test from 'node:test'
import assert from 'node:assert/strict'
import { updateWorksheetRowRate } from './worksheetRates.js'

test('updates only the targeted worksheet row when resources are repeated', () => {
  const firstSheet = { rows: [
    { id: 'foundation', resource: 'Concrete', unit: 'm³', rate: 100 },
    { id: 'slab', resource: 'Concrete', unit: 'm³', rate: 115 },
  ] }
  const secondSheet = { rows: [
    { id: 'other-sheet', resource: 'Concrete', unit: 'm³', rate: 90 },
  ] }

  updateWorksheetRowRate(firstSheet, 'foundation', 120)

  assert.deepEqual(firstSheet.rows.map((row) => row.rate), [120, 115])
  assert.equal(secondSheet.rows[0].rate, 90)
})

test('updates only the target row when its resource name and unit match another row', () => {
  const sheet = { rows: [
    { id: 'selected', resource: 'Concrete', unit: 'm³', rate: 100 },
    { id: 'other', resource: 'Concrete', unit: 'm³', rate: 100 },
  ] }

  updateWorksheetRowRate(sheet, 'selected', 0)

  assert.deepEqual(sheet.rows.map((row) => row.rate), [0, 100])
})
