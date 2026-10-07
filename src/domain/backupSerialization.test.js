import test from 'node:test'
import assert from 'node:assert/strict'
import { serializeBackupWithinLimit } from './backupSerialization.js'

test('backup size is measured in UTF-8 bytes and enforces the restore limit', () => {
  const backup = { text: 'é' }
  const json = JSON.stringify(backup, null, 2)
  const bytes = new TextEncoder().encode(json).byteLength
  assert.equal(serializeBackupWithinLimit(backup, bytes), json)
  assert.throws(() => serializeBackupWithinLimit(backup, bytes - 1), /maximum supported size/)
})
