import assert from 'node:assert/strict'
import test from 'node:test'
import { gridPositionKey, readGridPosition, writeGridPosition } from './gridPosition.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('grid position storage preserves the active cell, range, and scroll coordinates for the matching route', () => {
  const storage = memoryStorage()
  const key = gridPositionKey('project-1', 'sheet-1')
  const position = {
    url: '/projects/project-1/cost-load',
    selection: {
      active: { rowId: 'row-7', columnKey: 'remark' },
      anchor: { rowId: 'row-6', columnKey: 'rate' },
      extent: { rowId: 'row-7', columnKey: 'remark' },
    },
    scrollTop: 412,
    scrollLeft: 155,
  }

  writeGridPosition(storage, key, position)

  assert.equal(key, 'cost-grid-position-v1:project-1:sheet-1')
  assert.deepEqual(readGridPosition(storage, key, position.url), {
    url: position.url,
    ...position.selection,
    scrollTop: 412,
    scrollLeft: 155,
  })
  assert.equal(readGridPosition(storage, key, '/projects/project-1/summary'), null)
})

test('position reads safely reject malformed storage and writes tolerate unavailable storage', () => {
  const brokenStorage = { getItem: () => '{', setItem: () => { throw new Error('storage full') } }
  assert.equal(readGridPosition(brokenStorage, 'key', '/cost-load'), null)
  assert.doesNotThrow(() => writeGridPosition(brokenStorage, 'key', {
    url: '/cost-load', selection: { active: { rowId: 'r', columnKey: 'resource' } }, scrollTop: 0, scrollLeft: 0,
  }))
})
