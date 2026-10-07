import test from 'node:test'
import assert from 'node:assert/strict'
import { pruneGroupedOperations } from './groupedHistory.js'

test('prunes a deleted sheet from grouped history while preserving surviving grouped changes', () => {
  const operations = [
    { changes: [{ sheetId: 'a' }, { sheetId: 'deleted' }, { sheetId: 'b' }] },
    { changes: [{ sheetId: 'deleted' }] },
  ]
  assert.deepEqual(pruneGroupedOperations(operations, 'deleted'), [{ changes: [{ sheetId: 'a' }, { sheetId: 'b' }] }])
})
