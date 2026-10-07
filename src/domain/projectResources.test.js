import test from 'node:test'
import assert from 'node:assert/strict'
import { getProjectResourceKey, summarizeProjectResources } from './projectResources.js'
import { projectVisibleRowIds } from './projection.js'

const row = (id, values = {}) => ({ id, resource: 'Glass', unit: 'm²', cqbi: 1, cr: 2, boqQty: 3, rate: 250, override: null, ...values })
const sheet = (id, rows, position = 0) => ({ id, position, data: { rows } })

test('aggregates same resource and unit across sheets with complete quantity products', () => {
  const groups = summarizeProjectResources([
    sheet('second', [row('b', { resource: ' glass ', boqQty: 4 })], 1),
    sheet('first', [row('a')], 0),
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].quantity, 14)
  assert.equal(groups[0].lineCount, 2)
  assert.equal(groups[0].rate, 250)
  assert.equal(groups[0].rateStatus, 'consistent')
})

test('distinguishes units and counts missing quantity inputs while accepting zero', () => {
  const groups = summarizeProjectResources([sheet('s', [
    row('zero', { cqbi: 0, cr: 9, boqQty: 100 }),
    row('incomplete', { cqbi: null, boqQty: 2 }),
    row('other-unit', { unit: 'kg', cqbi: 1, cr: 1, boqQty: 5 }),
  ])])
  assert.equal(groups.length, 2)
  const squareMeters = groups.find((group) => group.unit === 'm²')
  assert.equal(squareMeters.quantity, 0)
  assert.equal(squareMeters.incompleteQuantityLines, 1)
})

test('reports distinct rates as multiple and preserves their values alongside missing lines', () => {
  const groups = summarizeProjectResources([sheet('s', [
    row('one', { rate: 250 }),
    row('two', { rate: 300 }),
    row('blank', { rate: null }),
  ])])
  assert.equal(groups[0].rateStatus, 'multiple')
  assert.deepEqual(groups[0].rates, [250, 300])
  assert.equal(groups[0].blankRateLines, 1)
  assert.equal(getProjectResourceKey(' Glass ', ' M² '), getProjectResourceKey('glass', 'm²'))
})

test('aggregates project resource total cost across sheets, honoring row overrides', () => {
  const groups = summarizeProjectResources([
    sheet('second', [row('b', { boqQty: 4 }), row('override', { resource: 'Steel', unit: 'kg', override: 10 })], 1),
    sheet('first', [row('a'), row('missing', { resource: 'Steel', unit: 'kg', rate: null })], 0),
  ])
  const glass = groups.find((group) => group.name === 'Glass')
  const steel = groups.find((group) => group.name === 'Steel')
  assert.equal(glass.totalCost, 3500)
  assert.equal(glass.costPercentage, 3500 / 3530 * 100)
  assert.equal(steel.totalCost, 30)
  assert.equal(steel.incompleteCostLines, 1)
  assert.equal(steel.costPercentage, 30 / 3530 * 100)
  assert.equal(glass.projectTotalCost, 3530)
})

test('preserves calculated zero costs and leaves percentages blank for a zero-cost project', () => {
  const groups = summarizeProjectResources([sheet('zero', [
    row('zero', { override: 0 }),
    row('also-zero', { resource: 'Wood', override: 0 }),
  ])])
  assert.deepEqual(groups.map((group) => group.totalCost), [0, 0])
  assert.deepEqual(groups.map((group) => group.costPercentage), [null, null])
  assert.equal(groups[0].projectTotalCost, 0)
})

test('filters and sorts resource-level cost and percentage values', () => {
  const rows = [
    { id: 'a', resourceTotalCost: 20, costPercentage: 25 },
    { id: 'b', resourceTotalCost: 60, costPercentage: 75 },
    { id: 'c', resourceTotalCost: 0, costPercentage: 0 },
  ]
  const filter = { search: '', condition: 'gte', conditionValue: '25', conditionValue2: '', selected: null }
  assert.deepEqual(projectVisibleRowIds(rows, { costPercentage: filter }, { col: 13, key: 'costPercentage', direction: 'desc' }), ['b', 'a'])
  assert.deepEqual(projectVisibleRowIds(rows, {}, { col: 12, key: 'resourceTotalCost', direction: 'desc' }), ['b', 'a', 'c'])
})
