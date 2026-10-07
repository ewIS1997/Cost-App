import test from 'node:test'
import assert from 'node:assert/strict'
import { copyResourcesToBoq, getInheritedBoqQuantity } from './resourceCopy.js'

const resource = (id, boqQty, extra = {}) => ({
  id, boqCode: 'A', resource: `Resource ${id}`, cqbi: 1, unit: 'm²', cr: 1, rate: 25,
  override: null, boqQty, remark: '', ...extra,
})

test('resource replacement uses the destination inherited quantity, not the source quantity', () => {
  const source = [resource('s1', 50), resource('s2', 50), resource('s3', 50)]
  const destination = [resource('d1', 100), resource('d2', 100)]
  const copies = copyResourcesToBoq(source, destination, 'B', (() => { let next = 0; return () => `new-${++next}` })())

  assert.deepEqual(copies.map((row) => row.boqQty), [100, 100, 100])
  assert.deepEqual(copies.map((row) => row.boqCode), ['B', 'B', 'B'])
  assert.deepEqual(copies.map((row) => row.id), ['new-1', 'new-2', 'new-3'])
  assert.equal(copies[0].resource, source[0].resource)
  assert.equal(copies[0].rate, source[0].rate)
})

test('a deliberate source resource quantity override survives while normal rows inherit destination quantity', () => {
  const source = [resource('s1', 50), resource('s2', 50), resource('s3', 75)]
  const destination = [resource('d1', 100), resource('d2', 100)]
  const copies = copyResourcesToBoq(source, destination, 'B', () => 'new-row')

  assert.deepEqual(copies.map((row) => row.boqQty), [100, 100, 75])
})

test('replacing a larger destination with fewer source resources returns only source rows and preserves destination CQBI', () => {
  const source = [resource('s1', 50, { cqbi: 2 })]
  const destination = [resource('d1', 100, { cqbi: 7 }), resource('d2', 100, { cqbi: 7 }), resource('d3', 100, { cqbi: 4 })]
  const copies = copyResourcesToBoq(source, destination, 'B', () => 'new-row', { preserveDestinationCqbi: true })

  assert.equal(copies.length, 1)
  assert.equal(copies[0].boqCode, 'B')
  assert.equal(copies[0].cqbi, 7)
  assert.equal(copies[0].boqQty, 100)
})

test('quantity zero is valid, null rows do not override destination quantity, and ties use first occurrence', () => {
  assert.equal(getInheritedBoqQuantity([resource('a', 0), resource('b', 0), resource('c', 10)]), 0)
  assert.equal(getInheritedBoqQuantity([resource('a', 10), resource('b', 20)]), 10)
  const copies = copyResourcesToBoq([resource('source', null)], [resource('destination', 0)], 'B', () => 'new')
  assert.equal(copies[0].boqQty, 0)
})
