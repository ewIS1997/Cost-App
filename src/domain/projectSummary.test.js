import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeProject } from './projectSummary.js'

const row = (id, values = {}) => ({ id, boqCode: '', resource: '', cqbi: null, unit: '', cr: null, rate: null, override: null, boqQty: null, remark: '', ...values })
const sheet = (id, rows, name = id) => ({ id, name, data: { rows } })

test('summarizes sheets independently and retains per-resource BOQ quantities', () => {
  const summary = summarizeProject([
    sheet('A', [
      row('a1', { boqCode: ' b.01 ', resource: 'Concrete', cqbi: 1, cr: 1, rate: 10, boqQty: 2 }),
      row('a2', { boqCode: 'B.01', resource: 'Labour', cqbi: 1, cr: 1, rate: 5, boqQty: 3 }),
    ]),
    sheet('B', [row('b1', { boqCode: 'B.01', resource: 'Other', cqbi: 1, cr: 1, rate: 4, boqQty: 1 })]),
  ])
  assert.equal(summary.total, 39)
  assert.equal(summary.boqItemCount, 2)
  assert.deepEqual(summary.sheets.map((item) => item.total), [35, 4])
  assert.equal(summary.sheets[0].boqGroups[0].total, 35)
})

test('counts each coded BOQ group per sheet and excludes uncoded resource groups', () => {
  const summary = summarizeProject([
    sheet('A', [
      row('a1', { boqCode: 'A.01', resource: 'Concrete' }),
      row('a2', { boqCode: 'A.01', resource: 'Labour' }),
      row('a3', { boqCode: 'A.02', resource: 'Steel' }),
      row('a4', { resource: 'Unassigned' }),
    ]),
    sheet('B', [row('b1', { boqCode: 'A.01', resource: 'Other' })]),
  ])

  assert.equal(summary.boqItemCount, 3)
  assert.deepEqual(summary.sheets.map((item) => item.boqGroups.length), [3, 1])
})

test('counts missing inputs once per incomplete line and treats zero as a valid input', () => {
  const summary = summarizeProject([sheet('A', [
    row('missing', { boqCode: 'A', resource: 'Unpriced', boqQty: 2 }),
    row('qty', { boqCode: 'B', resource: 'No quantity', cqbi: 1, cr: 1, rate: 2 }),
    row('zero', { boqCode: 'C', resource: 'Free item', override: 0, boqQty: 0 }),
    row('override', { boqCode: 'D', resource: 'Adjusted', override: 12, boqQty: 2 }),
  ])])
  assert.equal(summary.missingCostCount, 1)
  assert.equal(summary.missingQuantityCount, 1)
  assert.equal(summary.incompleteCount, 2)
  assert.equal(summary.overriddenCount, 2)
  assert.equal(summary.total, 24)
})

test('ignores completely blank rows and includes unfiltered underlying rows', () => {
  const summary = summarizeProject([sheet('A', [
    row('blank'),
    row('hidden-by-grid-filter', { boqCode: 'X', resource: 'Included row', cqbi: 1, cr: 1, rate: 7, boqQty: 2 }),
    row('uncoded', { resource: 'Uncoded line', override: 3, boqQty: 1 }),
  ])])
  assert.equal(summary.rowCount, 2)
  assert.equal(summary.total, 17)
  assert.equal(summary.boqItemCount, 1)
  assert.equal(summary.sheets[0].boqGroups.at(-1).code, '')
})

test('returns a zero total for projects without populated estimate rows', () => {
  assert.deepEqual(summarizeProject([sheet('A', [row('blank')])]), {
    total: 0,
    sheetCount: 1,
    rowCount: 0,
    boqItemCount: 0,
    missingCostCount: 0,
    missingQuantityCount: 0,
    incompleteCount: 0,
    overriddenCount: 0,
    sheets: [{ id: 'A', name: 'A', total: 0, rowCount: 0, missingCostCount: 0, missingQuantityCount: 0, overriddenCount: 0, incompleteCount: 0, boqGroups: [] }],
  })
})
