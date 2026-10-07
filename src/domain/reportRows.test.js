import test from 'node:test'
import assert from 'node:assert/strict'
import { createProjectSummaryRows } from './reportRows.js'

const row = (id, boqCode, boqQty, rate, extra = {}) => ({
  id, boqCode, resource: 'Resource', cqbi: 1, unit: 'item', cr: 1, rate,
  override: null, boqQty, remark: '', ...extra,
})
const sheet = (id, rows, position = 0) => ({ id, name: id, position, data: { rows } })

test('summary rows calculate item unit cost from its largest quantity and project percentage', () => {
  const rows = createProjectSummaryRows([sheet('A', [
    row('a1', 'CW-1', 50, 500),
    row('a2', 'CW-1', 50, 500),
    row('a3', 'CW-1', 50, 500),
    row('a4', 'CW-1', 200, 125),
  ])])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].unitCost, 500)
  assert.equal(rows[0].boqQty, 200)
  assert.equal(rows[0].totalCost, 100000)
  assert.equal(rows[0].percentage, 100)
  assert.equal('incompleteCount' in rows[0], false)
  assert.equal('resourceLineCount' in rows[0], false)
})

test('repeated BQ codes remain separate per sheet and percentages use full project total', () => {
  const rows = createProjectSummaryRows([
    sheet('A', [row('a', 'CW-1', 2, 10)]),
    sheet('B', [row('b', 'CW-1', 4, 20)], 1),
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((item) => item.totalCost), [20, 80])
  assert.deepEqual(rows.map((item) => item.unitCost), [10, 20])
  assert.deepEqual(rows.map((item) => item.boqQty), [2, 4])
  assert.deepEqual(rows.map((item) => item.percentage), [20, 80])
})

test('unit cost and percentage are null for zero quantity and zero project total', () => {
  const zeroQuantity = createProjectSummaryRows([sheet('A', [row('a', 'CW-1', 0, 10)])])[0]
  assert.equal(zeroQuantity.unitCost, null)
  assert.equal(zeroQuantity.boqQty, 0)
  const zeroProjectTotal = createProjectSummaryRows([sheet('A', [row('a', 'CW-1', 2, 0)])])[0]
  assert.equal(zeroProjectTotal.totalCost, 0)
  assert.equal(zeroProjectTotal.percentage, null)
  const missingQuantity = createProjectSummaryRows([sheet('A', [row('a', 'CW-1', null, 10)])])[0]
  assert.equal(missingQuantity.boqQty, null)
})
