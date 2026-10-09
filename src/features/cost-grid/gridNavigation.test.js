import assert from 'node:assert/strict'
import test from 'node:test'
import { findDirectionalEdge, isBlankCell } from './gridNavigation.js'

test('control-arrow navigation stops at a run edge or crosses a blank run', () => {
  const cells = ['A', 'B', '', '  ', 'C', 'D', null, 'E']
  const blank = (index) => isBlankCell(cells[index])
  assert.equal(findDirectionalEdge(0, 1, cells.length, blank), 1)
  assert.equal(findDirectionalEdge(1, 1, cells.length, blank), 4)
  assert.equal(findDirectionalEdge(2, 1, cells.length, blank), 4)
  assert.equal(findDirectionalEdge(5, -1, cells.length, blank), 4)
  assert.equal(findDirectionalEdge(4, -1, cells.length, blank), 1)
  assert.equal(findDirectionalEdge(7, 1, cells.length, blank), 7)
  assert.equal(findDirectionalEdge(0, -1, cells.length, blank), 0)
  assert.equal(findDirectionalEdge(-1, 1, cells.length, blank), -1)
  assert.equal(findDirectionalEdge(0, 1, 0, blank), 0)
})
