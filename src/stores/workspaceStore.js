// Owns loaded workspace, grouped history and dirty/failed save state; persistence stays in repositories.
import { create } from 'zustand'
import { HISTORY_BYTE_LIMIT, HISTORY_ENTRY_LIMIT, SHEET_NAME_LIMIT } from '../domain/constants.js'
import { validateWorksheet } from '../domain/validation.js'
import { getProjectResourceKey } from '../domain/projectResources.js'
import { pruneGroupedOperations } from '../domain/groupedHistory.js'
import { updateWorksheetRowRate } from '../domain/worksheetRates.js'
import { createAssembly, createSheet, deleteAssembly, deleteSheet, duplicateSheet, loadProjectWithSheets, readSettings, renameAssembly, renameSheet, saveProjectMetadata, saveCoordinator } from '../database/repositories.js'

const clone = (value) => structuredClone(value)
const uniqueSheetName = (sheets, base) => {
  const name = String(base).trim()
  if (!name || name.length > SHEET_NAME_LIMIT) throw new Error(`Sheet names must be 1-${SHEET_NAME_LIMIT} characters.`)
  if (sheets.some((sheet) => sheet.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) throw new Error('Sheet names must be unique.')
  return name
}
const historySize = (entries) => entries.reduce((total, entry) => total + JSON.stringify(entry).length, 0)
let loadGeneration = 0
const deriveSaveStatus = (dirtySheetIds, failedSheetIds) => failedSheetIds.length ? 'Save failed' : dirtySheetIds.length ? 'Saving...' : 'Saved'
let syncSaveSubscriptions = () => {}

export const useWorkspaceStore = create((set, get) => {
  const subscriptions = new Map()
  const rateOperations = { undo: [], redo: [] }
  // Grouped edits cross sheet boundaries and must be saved/undone as one operation.
  const commitSheetGroup = (changes) => {
    const current = get()
    const prepared = changes.map(({ sheetId, data }) => {
      const sheet = current.sheets.find((item) => item.id === sheetId)
      if (!sheet) throw new Error('A worksheet in this project is no longer available.')
      const errors = validateWorksheet(data)
      if (errors.length) throw new Error(errors[0])
      return { before: clone(sheet.data), sheet: { ...sheet, data: clone(data) } }
    }).filter(({ before, sheet }) => JSON.stringify(before) !== JSON.stringify(sheet.data))
    if (!prepared.length) return []
    let histories = { ...current.histories }
    const dirty = new Set(current.dirtySheetIds), failed = new Set(current.failedSheetIds)
    for (const { before, sheet } of prepared) {
      const undo = [...(histories[sheet.id]?.undo ?? []), before]
      while (undo.length > HISTORY_ENTRY_LIMIT || historySize(undo) > HISTORY_BYTE_LIMIT) undo.shift()
      histories[sheet.id] = { undo, redo: [] }
      dirty.add(sheet.id); failed.delete(sheet.id)
    }
    rateOperations.undo.push({ changes: prepared.map(({ before, sheet }) => ({ sheetId: sheet.id, before, after: clone(sheet.data) })) })
    rateOperations.redo = []
    set({ sheets: current.sheets.map((item) => prepared.find((change) => change.sheet.id === item.id)?.sheet ?? item), histories, dirtySheetIds: [...dirty], failedSheetIds: [...failed], saveStatus: deriveSaveStatus([...dirty], [...failed]) })
    const affectedIds = prepared.map(({ sheet }) => sheet.id)
    saveCoordinator.saveGroup(() => {
      const latest = get().sheets
      return affectedIds.map((id) => latest.find((sheet) => sheet.id === id)).filter(Boolean)
    }).catch(() => {
      const latest = get(), failedIds = new Set(latest.failedSheetIds), dirtyIds = new Set(latest.dirtySheetIds)
      prepared.forEach(({ sheet }) => { failedIds.add(sheet.id); dirtyIds.add(sheet.id) })
      set({ failedSheetIds: [...failedIds], dirtySheetIds: [...dirtyIds], saveStatus: 'Save failed' })
    })
    return prepared.map(({ sheet }) => sheet.id)
  }
  const applyGroupedRateHistory = (sheetId, direction) => {
    const source = direction === 'undo' ? rateOperations.undo : rateOperations.redo
    const target = direction === 'undo' ? rateOperations.redo : rateOperations.undo
    const operation = source.at(-1)
    if (!operation?.changes.some((change) => change.sheetId === sheetId)) return false
    const state = get()
    const field = direction === 'undo' ? 'after' : 'before'
    const matches = operation.changes.every((change) => JSON.stringify(state.sheets.find((sheet) => sheet.id === change.sheetId)?.data) === JSON.stringify(change[field]))
    if (!matches) {
      const selectedChange = operation.changes.find((change) => change.sheetId === sheetId)
      const selectedMatches = JSON.stringify(state.sheets.find((sheet) => sheet.id === sheetId)?.data) === JSON.stringify(selectedChange[field])
      // The selected sheet is already at this group boundary, but another
      // affected sheet has newer work. Do not fall through to a partial undo.
      if (selectedMatches) return true
      return false
    }
    const changes = operation.changes.map((change) => ({ sheetId: change.sheetId, data: clone(change[direction === 'undo' ? 'before' : 'after']) }))
    for (const change of changes) {
      const errors = validateWorksheet(change.data)
      if (errors.length) throw new Error(errors[0])
    }
    const histories = { ...state.histories }, dirty = new Set(state.dirtySheetIds), failed = new Set(state.failedSheetIds)
    for (const change of changes) {
      const history = histories[change.sheetId] ?? { undo: [], redo: [] }
      const current = state.sheets.find((sheet) => sheet.id === change.sheetId).data
      if (direction === 'undo') {
        histories[change.sheetId] = { undo: history.undo.slice(0, -1), redo: [...history.redo, current] }
      } else histories[change.sheetId] = { undo: [...history.undo, clone(current)], redo: history.redo.slice(0, -1) }
      dirty.add(change.sheetId); failed.delete(change.sheetId)
    }
    set({ sheets: state.sheets.map((sheet) => { const change = changes.find((item) => item.sheetId === sheet.id); return change ? { ...sheet, data: change.data } : sheet }), histories, dirtySheetIds: [...dirty], failedSheetIds: [...failed], saveStatus: deriveSaveStatus([...dirty], [...failed]) })
    source.pop(); target.push(operation)
    const affectedIds = changes.map((change) => change.sheetId)
    saveCoordinator.saveGroup(() => {
      const latest = get().sheets
      return affectedIds.map((id) => latest.find((sheet) => sheet.id === id)).filter(Boolean)
    }).catch(() => {
      const latest = get(), failed = new Set(latest.failedSheetIds), dirty = new Set(latest.dirtySheetIds)
      affectedIds.forEach((id) => { failed.add(id); dirty.add(id) })
      set({ failedSheetIds: [...failed], dirtySheetIds: [...dirty], saveStatus: 'Save failed' })
    })
    return true
  }
  const onSheetSave = (sheetId, status) => {
    const state = get()
    if (!state.project || !state.sheets.some((sheet) => sheet.id === sheetId)) return
    const dirty = new Set(state.dirtySheetIds)
    const failed = new Set(state.failedSheetIds)
    if (status === 'Saved') { dirty.delete(sheetId); failed.delete(sheetId) }
    else {
      dirty.add(sheetId)
      if (status === 'Save failed') failed.add(sheetId)
    }
    set({ dirtySheetIds: [...dirty], failedSheetIds: [...failed], saveStatus: deriveSaveStatus([...dirty], [...failed]) })
  }
  syncSaveSubscriptions = () => {
    const state = get()
    const wanted = new Set(state.project ? state.sheets.map((sheet) => sheet.id) : [])
    for (const [sheetId, unsubscribe] of subscriptions) {
      if (!wanted.has(sheetId)) {
        unsubscribe()
        subscriptions.delete(sheetId)
      }
    }
    for (const sheetId of wanted) {
      if (!subscriptions.has(sheetId)) {
        subscriptions.set(sheetId, saveCoordinator.subscribe(sheetId, (status) => onSheetSave(sheetId, status)))
      }
    }
  }
  return ({
  project: null, sheets: [], assemblies: [], activeSheetId: null, histories: {}, dirtySheetIds: [], failedSheetIds: [], saveStatus: 'Saved', loading: false, navigationGuard: null,
  get activeSheet() { return get().sheets.find((sheet) => sheet.id === get().activeSheetId) ?? null },
   async load(projectId, force = false) {
     const generation = ++loadGeneration
     const current = get()
     if (current.project?.id === projectId && !force) return current.project
     if (current.project) await get().guardNavigation()
     if (generation !== loadGeneration) return null
     if (current.project && current.dirtySheetIds.length) await get().flushProject(current.project.id)
     if (generation !== loadGeneration) return null
     set({ loading: true })
     const loaded = await loadProjectWithSheets(projectId)
     if (generation !== loadGeneration) return null
     if (!loaded) {
       rateOperations.undo = []; rateOperations.redo = []
       set({ project: null, sheets: [], assemblies: [], activeSheetId: null, histories: {}, dirtySheetIds: [], failedSheetIds: [], saveStatus: 'Saved', loading: false })
       syncSaveSubscriptions()
       return null
     }
     const activeSheetId = loaded.sheets.some((sheet) => sheet.id === loaded.project.activeSheetId) ? loaded.project.activeSheetId : loaded.sheets[0].id
     const histories = current.project?.id === projectId ? Object.fromEntries(Object.entries(current.histories).filter(([sheetId]) => loaded.sheets.some((sheet) => sheet.id === sheetId))) : {}
     if (current.project?.id !== projectId) { rateOperations.undo = []; rateOperations.redo = [] }
    set({ ...loaded, assemblies: loaded.assemblies ?? [], activeSheetId, histories, dirtySheetIds: [], failedSheetIds: [], saveStatus: 'Saved', loading: false })
    syncSaveSubscriptions()
    return loaded
  },
  clear() { loadGeneration++; rateOperations.undo=[];rateOperations.redo=[];set({ project: null, sheets: [], assemblies: [], activeSheetId: null, histories: {}, dirtySheetIds: [], failedSheetIds: [], saveStatus: 'Saved', navigationGuard: null, loading: false }); syncSaveSubscriptions() },
  syncProject(project) { if (get().project?.id === project.id) set({ project }) },
  async activateSheet(sheetId) {
    const { project, sheets } = get(); if (!project || !sheets.some((sheet) => sheet.id === sheetId)) return
    await get().guardNavigation()
    if (project.activeSheetId !== sheetId) {
      const next = { ...project, activeSheetId: sheetId }
      await saveProjectMetadata(next)
      set({ project: next, activeSheetId: sheetId })
    } else set({ activeSheetId: sheetId })
  },
   async flushProject(projectId) {
     try {
       await saveCoordinator.flushProject(projectId)
     } catch (error) {
       set({ saveStatus: 'Save failed' })
       throw new Error(`Unable to save pending worksheet changes: ${error.message}`, { cause: error })
     }
   },
   async addSheet(name) {
     const { project, sheets } = get()
     await get().guardNavigation()
     await get().flushProject(project.id)
     const settings = await readSettings()
     const sheet = await createSheet(project.id, uniqueSheetName(sheets, name), settings.defaultRemarkVisible)
     await get().load(project.id, true)
     return sheet
   },
   async renameSheet(sheetId, name) {
     const { sheets, project } = get()
     await get().guardNavigation()
     await get().flushProject(project.id)
     const updated = await renameSheet(sheetId, uniqueSheetName(sheets.filter((sheet) => sheet.id !== sheetId), name))
     set({ sheets: get().sheets.map((sheet) => sheet.id === sheetId ? updated : sheet) })
     syncSaveSubscriptions()
   },
   async duplicateSheet(sheetId, name) {
     const { sheets, project } = get()
     await get().guardNavigation()
     await get().flushProject(project.id)
     const copy = await duplicateSheet(sheetId, uniqueSheetName(sheets, name))
     await get().load(project.id, true)
     await get().activateSheet(copy.id)
   },
   async deleteSheet(sheetId) {
     const { project, histories } = get()
     await get().guardNavigation()
     await get().flushProject(project.id)
     const active = await deleteSheet(sheetId)
     const loaded = await loadProjectWithSheets(project.id)
     const nextHistories = { ...histories }
     delete nextHistories[sheetId]
     for (const direction of ['undo', 'redo']) {
       rateOperations[direction] = pruneGroupedOperations(rateOperations[direction], sheetId)
     }
     set({ ...loaded, activeSheetId: active, histories: nextHistories, dirtySheetIds: [], failedSheetIds: [], saveStatus: 'Saved' })
     syncSaveSubscriptions()
   },
  async retryFailedSaves() { const state=get(); const failed=state.sheets.filter((sheet)=>state.failedSheetIds.includes(sheet.id)); await Promise.all(failed.map((sheet)=>saveCoordinator.retry(sheet.id))) },
  async saveAssembly(assembly) { const saved=await createAssembly(assembly); set((state)=>({assemblies:[...state.assemblies,saved].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}))})); return saved },
  async renameAssembly(assemblyId,name) { const saved=await renameAssembly(assemblyId,name); set((state)=>({assemblies:state.assemblies.map((item)=>item.id===assemblyId?saved:item).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}))})); return saved },
  async deleteAssembly(assemblyId) { await deleteAssembly(assemblyId); set((state)=>({assemblies:state.assemblies.filter((item)=>item.id!==assemblyId)})) },
  applySheetGroup(changes) { return commitSheetGroup(changes) },
  registerNavigationGuard(guard) { set({navigationGuard:guard}); return ()=>{if(get().navigationGuard===guard)set({navigationGuard:null})} },
   async guardNavigation() {
     const { navigationGuard } = get()
     if (navigationGuard && !await navigationGuard()) throw new Error('Finish or correct the active cell edit before leaving the worksheet.')
     const { project, dirtySheetIds } = get()
     if (project && dirtySheetIds.length) await get().flushProject(project.id)
     return true
   },
   mutateSheet(sheetId, mutation) {
     const state = get()
     const sheet = state.sheets.find((item) => item.id === sheetId)
     if (!sheet) return
     const before = clone(sheet.data)
     const draft = clone(sheet.data)
     mutation(draft)
     const errors = validateWorksheet(draft)
     if (errors.length) throw new Error(errors[0])
     if (JSON.stringify(before) === JSON.stringify(draft)) return
     const history = [...(state.histories[sheetId]?.undo ?? []), before]
     while (history.length > HISTORY_ENTRY_LIMIT || historySize(history) > HISTORY_BYTE_LIMIT) history.shift()
     const nextSheet = { ...sheet, data: draft }
     const dirty = new Set(state.dirtySheetIds); dirty.add(sheetId)
     const failed = new Set(state.failedSheetIds); failed.delete(sheetId)
     set({ sheets: state.sheets.map((item) => item.id === sheetId ? nextSheet : item), histories: { ...state.histories, [sheetId]: { undo: history, redo: [] } }, dirtySheetIds: [...dirty], failedSheetIds: [...failed], saveStatus: deriveSaveStatus([...dirty], [...failed]) })
     saveCoordinator.schedule(nextSheet)
  },
  setResourceRate(resourceKey, rate) {
    const state = get()
    const candidates = state.sheets.map((sheet) => {
      const data = clone(sheet.data)
      let changed = false
      for (const row of data.rows) {
        if (getProjectResourceKey(row.resource, row.unit) !== resourceKey || row.rate === rate) continue
        updateWorksheetRowRate(data, row.id, rate)
        changed = true
      }
      if (changed) {
        const errors = validateWorksheet(data)
        if (errors.length) throw new Error(errors[0])
      }
      return changed ? { sheet, data } : null
    }).filter(Boolean)
    if (!candidates.length) return
    commitSheetGroup(candidates.map(({sheet,data})=>({sheetId:sheet.id,data})))
  },
  undoSheet(sheetId) { if(!applyGroupedRateHistory(sheetId,'undo'))get().applyHistory(sheetId,'undo') },
  redoSheet(sheetId) { if(!applyGroupedRateHistory(sheetId,'redo'))get().applyHistory(sheetId,'redo') },
   applyHistory(sheetId, direction) {
     const state = get()
     const sheet = state.sheets.find((item) => item.id === sheetId)
     const history = state.histories[sheetId] ?? { undo: [], redo: [] }
     const source = direction === 'undo' ? 'undo' : 'redo'
     const target = direction === 'undo' ? 'redo' : 'undo'
     if (!sheet || !history[source].length) return
     const snapshot = clone(history[source][history[source].length - 1])
     const errors = validateWorksheet(snapshot)
     if (errors.length) throw new Error(errors[0])
     const current = clone(sheet.data)
     const nextStack = [...history[source].slice(0, -1)]
     const opposite = [...history[target], current]
     while (opposite.length > HISTORY_ENTRY_LIMIT || historySize(opposite) > HISTORY_BYTE_LIMIT) opposite.shift()
     const nextSheet = { ...sheet, data: snapshot }
     const dirty = new Set(state.dirtySheetIds); dirty.add(sheetId)
     const failed = new Set(state.failedSheetIds); failed.delete(sheetId)
     set({ sheets: state.sheets.map((item) => item.id === sheetId ? nextSheet : item), histories: { ...state.histories, [sheetId]: { [source]: nextStack, [target]: opposite } }, dirtySheetIds: [...dirty], failedSheetIds: [...failed], saveStatus: deriveSaveStatus([...dirty], [...failed]) })
     saveCoordinator.schedule(nextSheet)
  },
  })
})
