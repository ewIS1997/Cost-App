import assert from 'node:assert/strict'
import test from 'node:test'
import { createSaveCoordinator } from './saveCoordinator.js'

const sheet = (id, value = 0) => ({ id, projectId: 'project', data: { value } })

test('flush saves the latest scheduled snapshot and reports status in order', async () => {
  const writes = [], statuses = []
  const coordinator = createSaveCoordinator(async (value) => { writes.push(value) }, async () => {})
  coordinator.subscribe('one', (status) => statuses.push(status))
  coordinator.schedule(sheet('one', 1))
  coordinator.schedule(sheet('one', 2))
  await coordinator.flushProject('project')
  assert.deepEqual(writes.map((value) => value.data.value), [2])
  assert.deepEqual(statuses, ['Saving...', 'Saved'])
})

test('failed writes retain a retryable snapshot and do not block later project writes', async () => {
  const writes = [], statuses = []
  let fail = true
  const coordinator = createSaveCoordinator(async (value) => {
    writes.push(value.id)
    if (fail) { fail = false; throw new Error('offline') }
  }, async () => {})
  coordinator.subscribe('one', (status, error) => statuses.push([status, error?.message]))
  await assert.rejects(coordinator.saveNow(sheet('one')), /offline/)
  await coordinator.saveNow(sheet('two'))
  await coordinator.retry('one')
  assert.deepEqual(writes, ['one', 'two', 'one'])
  assert.deepEqual(statuses.map(([status]) => status), ['Saving...', 'Save failed', 'Saving...', 'Saved'])
})

test('group save flushes pending sheets then saves the supplier snapshot together', async () => {
  const calls = [], statuses = []
  const coordinator = createSaveCoordinator(async (value) => { calls.push(['single', value.id, value.data.value]) },
    async (values) => { calls.push(['group', ...values.map((value) => value.data.value)]) })
  coordinator.subscribe('one', (status) => statuses.push(status))
  coordinator.schedule(sheet('one', 1))
  await coordinator.saveGroup(() => [sheet('one', 2), sheet('two', 3)])
  assert.deepEqual(calls, [['single', 'one', 1], ['group', 2, 3]])
  assert.deepEqual(statuses, ['Saving...', 'Saved'])
})

test('group failure exposes failed status and keeps initial sheets retryable', async () => {
  const writes = [], statuses = []
  const coordinator = createSaveCoordinator(async (value) => { writes.push(value.id) },
    async () => { throw new Error('group offline') })
  coordinator.subscribe('one', (status, error) => statuses.push([status, error?.message]))
  coordinator.schedule(sheet('one', 1))
  await assert.rejects(coordinator.saveGroup([sheet('one', 2)]), /group offline/)
  await coordinator.retry('one')
  assert.deepEqual(writes, ['one', 'one'])
  assert.deepEqual(statuses.map(([status]) => status), ['Saving...', 'Save failed', 'Saving...', 'Saved'])
})

test('an edit arriving during a write persists the newest snapshot before reporting saved', async () => {
  const writes = [], statuses = []
  let releaseFirst
  const firstWrite = new Promise((resolve) => { releaseFirst = resolve })
  let firstStarted
  const started = new Promise((resolve) => { firstStarted = resolve })
  const coordinator = createSaveCoordinator(async (value) => {
    writes.push(value.data.value)
    if (writes.length === 1) { firstStarted(); await firstWrite }
  }, async () => {})
  coordinator.subscribe('one', (status) => statuses.push(status))
  const saving = coordinator.saveNow(sheet('one', 1))
  await started
  coordinator.schedule(sheet('one', 2))
  releaseFirst()
  await saving
  await coordinator.flushProject('project')
  assert.deepEqual(writes, [1, 2])
  assert.deepEqual(statuses, ['Saving...', 'Saving...', 'Saved'])
})
