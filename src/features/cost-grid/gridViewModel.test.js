import assert from 'node:assert/strict'
import test from 'node:test'
import { imageAttachmentsByCode, lastVisibleIndexByCode, rowLayoutSignatures, selectionSummary, visibleBoqGroups } from './gridViewModel.js'

test('visible groups split noncontiguous codes and galleries appear after the last visible row', () => {
  const rows = [
    { id: 'a', boqCode: ' A ', resource: 'one', remark: 'note\ncontinued' },
    { id: 'b', boqCode: 'B', resource: 'two' },
    { id: 'c', boqCode: 'A', resource: 'three' },
    { id: 'd', boqCode: '', resource: '' },
    { id: 'e', boqCode: 'B', resource: 'four' },
  ]
  const last = lastVisibleIndexByCode(rows)
  const images = imageAttachmentsByCode([{ id: '1', boqCode: 'A' }, { id: '2', boqCode: 'A' }, { id: '3', boqCode: 'B' }])
  assert.deepEqual([...last], [['A', 2], ['B', 4]])
  assert.deepEqual([...images.values()].map((group) => group.map((item) => item.id)), [['1', '2'], ['3']])
  assert.deepEqual([...visibleBoqGroups(rows)], [
    ['a', { tone: 'a', startsGroup: true }],
    ['b', { tone: 'b', startsGroup: true }],
    ['c', { tone: 'a', startsGroup: true }],
    ['e', { tone: 'b', startsGroup: true }],
  ])
  assert.deepEqual([...rowLayoutSignatures(rows, true, last, images)], [
    ['a', '["one","note\\ncontinued",0]'], ['b', '["two","",0]'], ['c', '["three","",2]'], ['d', '["","",0]'], ['e', '["four","",1]'],
  ])
  assert.equal(rowLayoutSignatures(rows, false, last, images).get('c'), '["three","",0]')
})

test('selection summaries distinguish row selections, blank values and projected numbers', () => {
  const columns = [{ key: 'resource' }, { key: 'cost' }, { key: 'boqQty' }]
  const rowModel = [
    { original: { resource: 'Work', cqbi: 2, cr: 3, rate: 4, boqQty: 0, override: null } },
    { original: { resource: ' ', cqbi: null, cr: 1, rate: 2, boqQty: null, override: null } },
  ]
  const bounds = { top: 0, bottom: 1, left: 0, right: 2 }
  assert.deepEqual(selectionSummary(['a', 'b'], bounds, rowModel, columns), { kind: 'rows', rowCount: 2 })
  assert.equal(selectionSummary([], null, rowModel, columns), null)
  assert.equal(selectionSummary([], { top: 0, bottom: 0, left: 0, right: 0 }, rowModel, columns), null)
  assert.deepEqual(selectionSummary([], bounds, rowModel, columns), { kind: 'cells', count: 3, numericCount: 2, sum: 24, average: 12 })
})
