import assert from 'node:assert/strict'
import test from 'node:test'
import { collectFindMatches, replaceText } from './gridFind.js'

test('find scans only supplied visible rows and columns, honoring scope and navigation limit', () => {
  const rows = Array.from({ length: 502 }, (_, index) => ({ id: `row-${index}`, resource: 'Aa', remark: 'hidden' }))
  const columns = [{ key: 'resource', label: 'Resource' }, { key: 'remark', label: 'Remark' }]
  assert.equal(collectFindMatches(rows, columns, 'a', false, false, null, 500).length, 500)
  assert.equal(collectFindMatches(rows, columns, 'a', false, false).length, 502)
  assert.deepEqual(collectFindMatches(rows.slice(1, 3), columns, 'Aa', true, true,
    { rowIds: new Set(['row-2']), columnKeys: new Set(['resource']) }),
  [{ rowId: 'row-2', rowIndex: 1, columnKey: 'resource', columnLabel: 'Resource', value: 'Aa' }])
  assert.equal(collectFindMatches(rows, columns, 'aa', true, true).length, 0)
})

test('replace treats query literally and replacement dollars literally', () => {
  assert.equal(replaceText('A.a A.a', 'A.a', '$&'), '$& $&')
  assert.equal(replaceText('A.a A.a', 'a.a', 'X', true), 'A.a A.a')
  assert.equal(replaceText('A.a', 'A', 'X', false, true), 'X')
})
