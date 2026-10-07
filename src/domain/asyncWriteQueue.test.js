import test from 'node:test'
import assert from 'node:assert/strict'
import { createAsyncWriteQueue } from './asyncWriteQueue.js'

test('serializes writes and continues after a failed write', async () => {
  const queue = createAsyncWriteQueue()
  const events = []
  let releaseFirst
  const gate = new Promise((resolve) => { releaseFirst = resolve })
  const first = queue.enqueue(() => gate.then(() => { events.push('first') }))
  const failed = queue.enqueue(() => { events.push('failed'); throw new Error('write failed') })
  const last = queue.enqueue(() => { events.push('last') })

  assert.deepEqual(events, [])
  releaseFirst()
  await first
  await assert.rejects(failed, /write failed/)
  await last
  assert.deepEqual(events, ['first', 'failed', 'last'])
})
