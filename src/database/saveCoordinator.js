import { createAsyncWriteQueue } from '../domain/asyncWriteQueue.js'

// A coordinator owns pending snapshots per sheet and serialized writes per project.
// Repository transaction callbacks are injected to keep the database facade acyclic.
export function createSaveCoordinator(saveSheetAndProjectTimestamp, saveSheetsAndProjectTimestamp) {
  const pending = new Map()
  const projectWriteQueues = new Map()
  const status = (entry, value, error) => entry.listeners.forEach((listener) => listener(value, error))

  function enqueueProjectWrite(projectId, write) {
    const queue = projectWriteQueues.get(projectId) ?? createAsyncWriteQueue()
    projectWriteQueues.set(projectId, queue)
    return queue.enqueue(write)
  }

  async function persistLatest(entry) {
    if (entry.active) return entry.active
    entry.active = (async () => {
      while (entry.latest) {
        const pendingSnapshot = entry.latest
        entry.latest = null
        status(entry, 'Saving...')
        try {
          await enqueueProjectWrite(pendingSnapshot.projectId, () => saveSheetAndProjectTimestamp(pendingSnapshot))
          entry.dirty = Boolean(entry.latest)
          if (!entry.dirty) {
            if (entry.groupPending) entry.savedDuringGroup = true
            else status(entry, 'Saved')
          }
        } catch (error) {
          if (!entry.latest) entry.latest = pendingSnapshot
          entry.dirty = true
          status(entry, 'Save failed', error)
          throw error
        }
      }
    })().finally(() => { entry.active = null })
    return entry.active
  }

  return {
    subscribe(sheetId, callback) {
      const entry = pending.get(sheetId) || { listeners: new Set(), latest: null, active: null, timer: null, dirty: false }
      entry.listeners.add(callback)
      pending.set(sheetId, entry)
      return () => entry.listeners.delete(callback)
    },
    schedule(sheet) {
      const entry = pending.get(sheet.id) || { listeners: new Set(), latest: null, active: null, timer: null, dirty: false }
      entry.projectId = sheet.projectId
      entry.latest = structuredClone(sheet)
      entry.dirty = true
      clearTimeout(entry.timer)
      entry.timer = setTimeout(() => persistLatest(entry).catch(() => {}), 500)
      pending.set(sheet.id, entry)
    },
    async saveNow(sheet) {
      const entry = pending.get(sheet.id) || { listeners: new Set(), latest: null, active: null, timer: null, dirty: false }
      entry.projectId = sheet.projectId
      entry.latest = structuredClone(sheet)
      entry.dirty = true
      clearTimeout(entry.timer)
      pending.set(sheet.id, entry)
      return persistLatest(entry)
    },
    async saveGroup(sheetsOrSupplier) {
      const initial = typeof sheetsOrSupplier === 'function' ? sheetsOrSupplier() : sheetsOrSupplier
      const projectId = initial[0]?.projectId
      if (!projectId) return
      const sheetIds = initial.map((sheet) => sheet.id)
      const entries = sheetIds.map((id) => pending.get(id)).filter(Boolean)
      entries.forEach((entry) => { entry.groupPending = (entry.groupPending ?? 0) + 1 })
      try {
        await this.flushProject(projectId)
        // Flushing can finish older writes while the store changes; read the supplier again afterward.
        const latest = typeof sheetsOrSupplier === 'function' ? sheetsOrSupplier() : initial
        await enqueueProjectWrite(projectId, () => saveSheetsAndProjectTimestamp(latest))
        for (const sheet of latest) {
          const entry = pending.get(sheet.id)
          if (!entry) continue
          entry.groupPending = Math.max(0, (entry.groupPending ?? 1) - 1)
          if (!entry.latest && !entry.active) {
            entry.dirty = false
            entry.savedDuringGroup = false
            if (!entry.groupPending) status(entry, 'Saved')
          }
        }
      } catch (error) {
        for (const sheet of initial) {
          const entry = pending.get(sheet.id)
          if (!entry) continue
          entry.groupPending = Math.max(0, (entry.groupPending ?? 1) - 1)
          entry.latest = entry.latest ?? structuredClone(sheet)
          entry.dirty = true
          status(entry, 'Save failed', error)
        }
        throw error
      }
    },
    async retry(sheetId) {
      const entry = pending.get(sheetId)
      if (!entry?.latest) return
      return persistLatest(entry)
    },
    async flushProject(projectId) {
      while (true) {
        const entries = [...pending.values()].filter((entry) => entry.projectId === projectId && (entry.dirty || entry.active))
        await Promise.all(entries.map((entry) => {
          clearTimeout(entry.timer)
          return persistLatest(entry)
        }))
        const queued = projectWriteQueues.get(projectId)
        if (queued) await queued.idle()
        if (![...pending.values()].some((entry) => entry.projectId === projectId && (entry.dirty || entry.active))) return
      }
    },
    async flushAll() {
      await Promise.all([...pending.values()].filter((entry) => entry.dirty || entry.active).map((entry) => {
        clearTimeout(entry.timer)
        return persistLatest(entry)
      }))
    },
  }
}
