import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBoqItemCosts } from './boqItemCostSummary.js'

const row = (boqQty, rate, boqCode = 'CW-1') => ({
  id: `${boqCode}-${boqQty}-${rate}`, boqCode, resource: 'Resource', cqbi: 1,
  unit: 'item', cr: 1, rate, override: null, boqQty, remark: '',
})

test('unit cost divides summed row total costs by the largest quantity in the BQ item', () => {
  const summary = summarizeBoqItemCosts([
    row(50, 500), row(50, 500), row(50, 500), row(200, 125),
  ]).get('CW-1')
  assert.equal(summary.totalCost, 100000)
  assert.equal(summary.maxBoqQty, 200)
  assert.equal(summary.unitCost, 500)
})

test('does not divide by zero when the item has no nonzero BQ quantity', () => {
  assert.equal(summarizeBoqItemCosts([row(0, 10)]).get('CW-1').unitCost, null)
})
