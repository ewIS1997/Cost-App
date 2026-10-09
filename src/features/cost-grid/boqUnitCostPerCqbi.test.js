import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBoqItemCosts } from '../../domain/boqItemCostSummary.js'
import { firstCqbiByBoqCode, unitCostPerCqbi } from './boqUnitCostPerCqbi.js'

const row = (boqCode, cqbi, values = {}) => ({ boqCode, cqbi, ...values })

test('calculates Unit Cost / CQBI using the first resource row CQBI for a normalized BQ item', () => {
  const cqbiByCode = firstCqbiByBoqCode([
    row(' cw-1 ', 2), row('CW-1', 5), row('Cw-1', 3), row('CW-2', 50),
  ])

  assert.equal(cqbiByCode.get('CW-1'), 2)
  assert.equal(unitCostPerCqbi(500, cqbiByCode.get('CW-1')), 250)
  assert.equal(cqbiByCode.get('CW-2'), 50)
})

test('does not fall through to later resource rows when the first CQBI is invalid', () => {
  const cqbiByCode = firstCqbiByBoqCode([
    row('CW-1', null), row('CW-1', 5), row('CW-2', ''), row('CW-3', '5'),
    row('CW-4', Number.NaN), row('CW-5', Number.POSITIVE_INFINITY),
  ])

  for (const code of ['CW-1', 'CW-2', 'CW-3', 'CW-4', 'CW-5']) {
    assert.equal(cqbiByCode.get(code), null)
    assert.equal(unitCostPerCqbi(500, cqbiByCode.get(code)), null)
  }
})

test('does not divide by a zero CQBI from the first resource row', () => {
  const cqbiByCode = firstCqbiByBoqCode([row('CW-1', 0), row('CW-1', 5)])

  assert.equal(cqbiByCode.get('CW-1'), 0)
  assert.equal(unitCostPerCqbi(500, cqbiByCode.get('CW-1')), null)
})

test('returns null for invalid unit costs and non-finite quotients', () => {
  assert.equal(unitCostPerCqbi(null, 5), null)
  assert.equal(unitCostPerCqbi(Number.NaN, 5), null)
  assert.equal(unitCostPerCqbi(Number.POSITIVE_INFINITY, 5), null)
  assert.equal(unitCostPerCqbi(Number.MAX_VALUE, Number.MIN_VALUE), null)
})

test('keeps existing BQ summary costs unchanged', () => {
  const originalSummary = summarizeBoqItemCosts([
    { id: 'a', boqCode: 'CW-1', cqbi: 2, cr: 1, rate: 250, override: null, boqQty: 1 },
    { id: 'b', boqCode: 'CW-1', cqbi: 5, cr: 1, rate: 250, override: null, boqQty: 1 },
  ]).get('CW-1')
  const originalValues = { unitCost: originalSummary.unitCost, totalCost: originalSummary.totalCost }
  const cqbiByCode = firstCqbiByBoqCode([row('CW-1', 2), row('CW-1', 5)])

  assert.equal(unitCostPerCqbi(originalSummary.unitCost, cqbiByCode.get('CW-1')), 875)
  assert.deepEqual({ unitCost: originalSummary.unitCost, totalCost: originalSummary.totalCost }, originalValues)
})
