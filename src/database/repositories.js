import Dexie from 'dexie'
import { database } from './database.js'
import { createAppSettings, createId, createProjectRecord, createSheetRecord, normalizeText } from '../domain/normalization.js'
import { createUniqueProjectRouteSlug, getProjectRouteSlug } from '../domain/projectRoutes.js'
import { validateAllProjectsBackup, validateAssemblies, validateProject, validateProjectBackup, validateSettings, validateWorksheet } from '../domain/validation.js'
import { migrateAppSettings, migrateLegacyWorkbook, migrateLegacyWorksheet } from './migrations.js'
import { createDemoSheets } from '../domain/demoData.js'
import { createAsyncWriteQueue } from '../domain/asyncWriteQueue.js'
import { normalizeBoqCode } from '../domain/normalization.js'
import { isImageTargetCurrent, normalizeAttachmentCode } from '../domain/imageAttachments.js'
import { transitionItemAttachments } from '../domain/imageAttachmentTransitions.js'
import { decodeAttachmentFromBackup, encodeAttachmentForBackup } from '../domain/attachmentBackup.js'

const now=()=>new Date().toISOString()
const newest=(...values)=>values.reduce((a,b)=>Date.parse(a)>=Date.parse(b)?a:b)
function assertValid(errors,what) { if (errors.length) throw new Error(`${what} validation failed: ${errors.join(' ')}`) }
function cloneWithNewRowIds(data) { return {...structuredClone(data),rows:data.rows.map((row)=>({...row,id:createId()}))} }
async function checkedProject(project,sheets) { assertValid(validateProject(project,sheets),'Persisted project'); return {project,sheets} }

export async function listProjectsWithSheetCounts() {
  return database.transaction('rw',database.projects,database.sheets,async()=>{
    const projects=await database.projects.toArray(); const sheets=await database.sheets.toArray()
    const ordered=[...projects].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id))
    const reservedIds=new Set(projects.map((project)=>project.id))
    const aliasOwner=new Map()
    for(const project of ordered)for(const alias of Array.isArray(project.routeAliases)?project.routeAliases:[]){
      if(typeof alias==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias)&&!reservedIds.has(alias)&&!aliasOwner.has(alias))aliasOwner.set(alias,project.id)
    }
    const assigned=[]
    for(const project of ordered){
      const requested=project.routeSlug
      const requestedAvailable=typeof requested==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requested)&&!reservedIds.has(requested)&&!aliasOwner.has(requested)&&!assigned.some((item)=>getProjectRouteSlug(item)===requested)
      const routeSlug=requestedAvailable?requested:createUniqueProjectRouteSlug(project.name,[...projects,...assigned],project.id)
      assigned.push({...project,routeSlug})
    }
    const currentSlugs=new Set(assigned.map(getProjectRouteSlug)),usedAliases=new Set(),finalized=[]
    for(const project of assigned){
      const oldAliases=Array.isArray(project.routeAliases)?project.routeAliases:[]
      const routeAliases=[...new Set(oldAliases.filter((alias)=>typeof alias==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias)&&alias!==project.routeSlug&&!reservedIds.has(alias)&&!currentSlugs.has(alias)&&!usedAliases.has(alias)))]
      routeAliases.forEach((alias)=>usedAliases.add(alias))
      const routedProject={...project,routeAliases}
      if(project.routeSlug!==projects.find((item)=>item.id===project.id)?.routeSlug||JSON.stringify(routeAliases)!==JSON.stringify(oldAliases))await database.projects.put(routedProject)
      finalized.push(routedProject)
    }
    for(const project of finalized){const related=sheets.filter((sheet)=>sheet.projectId===project.id);const errors=validateProject(project,related);if(errors.length)throw new Error(`Project ${project.id} is corrupt: ${errors.join(' ')}`)}
    return finalized.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).map((project)=>({...project,sheetCount:sheets.filter((sheet)=>sheet.projectId===project.id).length}))
  })
}
export async function loadProjectWithSheets(projectId) {
  const project=await database.projects.get(projectId); if (!project) return null
  const sheets=await database.sheets.where('[projectId+position]').between([projectId,Dexie.minKey],[projectId,Dexie.maxKey]).toArray()
  const orderedSheets=sheets.sort((a,b)=>a.position-b.position)
  const assemblies=await database.assemblies.where('projectId').equals(projectId).toArray()
  await checkedProject(project,orderedSheets)
  assertValid(validateAssemblies(assemblies,projectId),'Persisted assemblies')
  return {project,sheets:orderedSheets,assemblies:assemblies.sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}))}
}

const publicAttachment = (record) => { const metadata={...record};delete metadata.blob;return metadata }
async function hydrateAttachments(metadata){
  const blobs=await database.attachmentBlobs.bulkGet(metadata.map((record)=>record.id))
  return metadata.map((record,index)=>({...record,blob:blobs[index]?.blob}))
}
function splitAttachmentRecords(records){
  const metadata=[],imageBlobs=[]
  for(const record of records){const item={...record};const blob=item.blob;delete item.blob;metadata.push(item);if(blob)imageBlobs.push({id:item.id,projectId:item.projectId,sheetId:item.sheetId,blob})}
  return {metadata,imageBlobs}
}
function normalizeAttachmentOwnership(record,sourceSheet,targetSheet=sourceSheet){
  if(!sourceSheet||!targetSheet)return {...record,originCode:record.originCode??record.boqCode,itemRowIds:record.itemRowIds??[]}
  const sourceIndexes=new Map(sourceSheet.data.rows.map((row,index)=>[row.id,index]))
  const rowIds=record.itemRowIds??sourceSheet.data.rows.filter((row)=>normalizeBoqCode(row.boqCode)===normalizeBoqCode(record.boqCode)).map((row)=>row.id)
  return {
    ...record,
    originCode:record.originCode??record.boqCode,
    itemRowIds:rowIds.map((rowId)=>targetSheet.data.rows[sourceIndexes.get(rowId)]?.id).filter(Boolean),
  }
}
const attachmentChange = (sheetId) => { if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('boq-attachments-updated',{detail:{sheetId}})) }

export async function listSheetAttachments(sheetId,{includeBlob=false}={}) {
  const records = await database.attachments.where('sheetId').equals(sheetId).toArray()
  const ordered=records.sort((a, b) => a.boqCode.localeCompare(b.boqCode) || a.position - b.position || a.createdAt.localeCompare(b.createdAt))
  if(!includeBlob)return ordered
  return hydrateAttachments(ordered)
}

export async function getImageAttachment(attachmentId) {
  const record = await database.attachments.get(attachmentId)
  if(!record)return null
  const image=await database.attachmentBlobs.get(attachmentId)
  return image?{...record,blob:image.blob}:record
}

export async function addImageAttachment({ projectId, sheetId, rowId, boqCode, blob, mimeType, width, height, validateTarget }) {
  const code = normalizeAttachmentCode(boqCode)
  if (typeof Blob==='undefined'||!(blob instanceof Blob) || !['image/png', 'image/jpeg'].includes(mimeType) || blob.type !== mimeType) throw new Error('The image attachment data is invalid.')
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) throw new Error('The image dimensions are invalid.')
  const saved=await database.transaction('rw', database.projects, database.sheets, database.attachments, database.attachmentBlobs, async () => {
    const sheet = await database.sheets.get(sheetId)
    if (!sheet || sheet.projectId !== projectId) throw new Error('The target worksheet is no longer available.')
    if(!isImageTargetCurrent(sheet.data.rows,rowId,code)||validateTarget?.()===false)throw new Error('The selected BQ item changed while the image was being prepared. Select the intended item and try again.')
    const existing = await database.attachments.where('[sheetId+boqCode]').equals([sheetId, code]).toArray()
    if(validateTarget?.()===false)throw new Error('The selected BQ item changed before the image could be saved. Select the intended item and try again.')
    if(existing.length>=20)throw new Error('A BQ item can have up to 20 attached images.')
    const itemRowIds=sheet.data.rows.filter((row)=>normalizeBoqCode(row.boqCode)===code).map((row)=>row.id)
    const record = { id: createId(), projectId, sheetId, boqCode: code, originCode:code, itemRowIds, position: existing.length ? Math.max(...existing.map((item) => item.position)) + 1 : 0, mimeType, width, height, createdAt: now() }
    await database.attachments.add(record)
    await database.attachmentBlobs.add({id:record.id,projectId,sheetId,blob})
    return publicAttachment(record)
  })
  attachmentChange(sheetId)
  return saved
}

export async function deleteImageAttachment(attachmentId) {
  const record=await database.attachments.get(attachmentId)
  if(!record)return
  await database.transaction('rw',database.attachments,database.attachmentBlobs,async()=>{
    await database.attachments.delete(attachmentId)
    await database.attachmentBlobs.delete(attachmentId)
    const remaining=(await database.attachments.where('[sheetId+boqCode]').equals([record.sheetId,record.boqCode]).toArray()).sort((a,b)=>a.position-b.position)
    await database.attachments.bulkPut(remaining.map((item,position)=>({...item,position})))
  })
  attachmentChange(record.sheetId)
}

async function transitionAttachmentsInTransaction(sheetId,beforeRows,afterRows) {
  const beforeById=new Map(beforeRows.map((row)=>[row.id,normalizeBoqCode(row.boqCode)]))
  const codesChanged=beforeRows.length!==afterRows.length||afterRows.some((row)=>beforeById.get(row.id)!==normalizeBoqCode(row.boqCode))
  if(!codesChanged)return 0
  const attachments=await database.attachments.where('sheetId').equals(sheetId).toArray()
  if(!attachments.length)return 0
  const changed=transitionItemAttachments(attachments,beforeRows,afterRows)
  if(changed.length)await database.attachments.bulkPut(changed)
  return changed.length
}

async function duplicateSheetAttachments(sourceSheet,targetSheet) {
  const attachments = await database.attachments.where('sheetId').equals(sourceSheet.id).toArray()
  const blobs=await database.attachmentBlobs.bulkGet(attachments.map((attachment)=>attachment.id))
  const rowIds=new Map(sourceSheet.data.rows.map((row,index)=>[row.id,targetSheet.data.rows[index]?.id]).filter(([,id])=>id))
  const metadata=[],imageBlobs=[]
  attachments.forEach((attachment,index)=>{
    const id=createId()
    metadata.push({...attachment,id,projectId:targetSheet.projectId,sheetId:targetSheet.id,itemRowIds:(attachment.itemRowIds??[]).map((rowId)=>rowIds.get(rowId)).filter(Boolean)})
    if(blobs[index])imageBlobs.push({...blobs[index],id,projectId:targetSheet.projectId,sheetId:targetSheet.id})
  })
  return {metadata,imageBlobs}
}
export async function createAssembly(assembly) {
  return database.transaction('rw',database.projects,database.assemblies,async()=>{
    const project=await database.projects.get(assembly.projectId); if(!project)throw new Error('Project not found.')
    const existing=await database.assemblies.where('projectId').equals(assembly.projectId).toArray()
    const name=normalizeText(assembly.name)
    if(existing.some((item)=>item.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('An assembly with this name already exists in the project.')
    const value={...structuredClone(assembly),name}
    assertValid(validateAssemblies([...existing,value],assembly.projectId),'Assembly')
    await database.assemblies.add(value)
    await database.projects.put({...project,updatedAt:newest(project.updatedAt,now())})
    return value
  })
}
export async function renameAssembly(assemblyId,name) {
  return database.transaction('rw',database.projects,database.assemblies,async()=>{
    const assembly=await database.assemblies.get(assemblyId); if(!assembly)throw new Error('Assembly not found.')
    const project=await database.projects.get(assembly.projectId); if(!project)throw new Error('Project not found.')
    const existing=await database.assemblies.where('projectId').equals(assembly.projectId).toArray()
    const normalized=normalizeText(name)
    if(existing.some((item)=>item.id!==assemblyId&&item.name.toLocaleLowerCase()===normalized.toLocaleLowerCase()))throw new Error('An assembly with this name already exists in the project.')
    const timestamp=newest(now(),project.updatedAt)
    const updated={...assembly,name:normalized,updatedAt:timestamp}
    assertValid(validateAssemblies(existing.map((item)=>item.id===assemblyId?updated:item),assembly.projectId),'Renamed assembly')
    await database.assemblies.put(updated); await database.projects.put({...project,updatedAt:timestamp}); return updated
  })
}
export async function deleteAssembly(assemblyId) {
  return database.transaction('rw',database.projects,database.assemblies,async()=>{
    const assembly=await database.assemblies.get(assemblyId); if(!assembly)return
    const project=await database.projects.get(assembly.projectId)
    await database.assemblies.delete(assemblyId)
    if(project)await database.projects.put({...project,updatedAt:newest(now(),project.updatedAt)})
  })
}
export async function createProjectWithFirstSheet(name,defaultDarkMode=false,defaultRemarkVisible=false) {
  const timestamp=now(), projectId=createId(); const sheet=createSheetRecord(projectId,'Sheet 1',0,timestamp,defaultRemarkVisible)
  const project={...createProjectRecord(name,sheet.id,defaultDarkMode,timestamp),id:projectId,routeSlug:createUniqueProjectRouteSlug(name,await database.projects.toArray()),routeAliases:[]}
  assertValid(validateProject(project,[sheet]),'New project')
  await database.transaction('rw',database.projects,database.sheets,async()=>{await database.projects.add(project);await database.sheets.add(sheet)})
  return {project,sheets:[sheet]}
}
export async function createDemoProject() {
  const timestamp=now(),projectId=createId(),sheets=createDemoSheets(projectId,timestamp)
  const name='Riverside Community Centre — Sample Estimate'
  const project={...createProjectRecord(name,sheets[0].id,false,timestamp),id:projectId,routeSlug:createUniqueProjectRouteSlug(name,await database.projects.toArray()),routeAliases:[]}
  assertValid(validateProject(project,sheets),'Demo project')
  await database.transaction('rw',database.projects,database.sheets,async()=>{await database.projects.add(project);await database.sheets.bulkAdd(sheets)})
  return {project,sheets}
}
export async function saveProjectMetadata(project) {
  const loaded=await loadProjectWithSheets(project.id); if (!loaded) throw new Error('Cannot save metadata for an unknown project.')
  assertValid(validateProject(project,loaded.sheets),'Project metadata')
  const value={...project,updatedAt:newest(project.updatedAt,now())}; await database.projects.put(value); return value
}
export async function renameProject(projectId,name) {
  const loaded=await loadProjectWithSheets(projectId); if (!loaded) throw new Error('Project not found.')
  const normalized=normalizeText(name),projects=await database.projects.toArray(),oldSlug=getProjectRouteSlug(loaded.project)
  const routeSlug=createUniqueProjectRouteSlug(normalized,projects,projectId)
  const routeAliases=[...new Set([...(loaded.project.routeAliases??[]),...(oldSlug===routeSlug?[]:[oldSlug])])].filter((slug)=>slug!==routeSlug)
  const project={...loaded.project,name:normalized,routeSlug,routeAliases,updatedAt:newest(loaded.project.updatedAt,now())}
  assertValid(validateProject(project,loaded.sheets),'Renamed project'); await database.projects.put(project); return project
}
export async function saveSheetAndProjectTimestamp(sheet,projectTimestamp=now()) {
  const dataErrors=validateWorksheet(sheet.data); assertValid(dataErrors,'Worksheet')
  const moved=await database.transaction('rw',database.sheets,database.projects,database.attachments,async()=>{
    const oldSheet=await database.sheets.get(sheet.id); const project=await database.projects.get(sheet.projectId)
    if (!oldSheet||!project) throw new Error('Cannot save a sheet whose project or sheet no longer exists.')
    const changed=await transitionAttachmentsInTransaction(sheet.id,oldSheet.data.rows,sheet.data.rows)
    const timestamp=newest(projectTimestamp,now(),oldSheet.updatedAt,project.updatedAt)
    await database.sheets.put({...sheet,updatedAt:newest(timestamp,sheet.updatedAt)})
    await database.projects.put({...project,updatedAt:timestamp})
    return changed
  })
  if(moved)attachmentChange(sheet.id)
}
export async function saveSheetsAndProjectTimestamp(sheets,projectTimestamp=now()) {
  if (!Array.isArray(sheets) || !sheets.length) return
  for (const sheet of sheets) assertValid(validateWorksheet(sheet.data),'Worksheet')
  const projectId=sheets[0].projectId
  if(sheets.some((sheet)=>sheet.projectId!==projectId))throw new Error('A grouped save cannot span projects.')
  const movedSheetIds=await database.transaction('rw',database.sheets,database.projects,database.attachments,async()=>{
    const project=await database.projects.get(projectId)
    if(!project)throw new Error('Cannot save sheets whose project no longer exists.')
    const oldSheets=await Promise.all(sheets.map((sheet)=>database.sheets.get(sheet.id)))
    if(oldSheets.some((sheet)=>!sheet))throw new Error('Cannot save a grouped change because a worksheet no longer exists.')
    const moved=[]
    for(let index=0;index<sheets.length;index++)if(await transitionAttachmentsInTransaction(sheets[index].id,oldSheets[index].data.rows,sheets[index].data.rows))moved.push(sheets[index].id)
    const timestamp=newest(projectTimestamp,now(),project.updatedAt,...oldSheets.map((sheet)=>sheet.updatedAt))
    await database.sheets.bulkPut(sheets.map((sheet,index)=>({...sheet,updatedAt:newest(timestamp,sheet.updatedAt,oldSheets[index].updatedAt)})))
    await database.projects.put({...project,updatedAt:timestamp})
    return moved
  })
  movedSheetIds.forEach(attachmentChange)
}
export async function createSheet(projectId,name,defaultRemarkVisible=false) {
  return database.transaction('rw',database.projects,database.sheets,async()=>{
    const project=await database.projects.get(projectId); if(!project) throw new Error('Project not found.')
    const sheets=await database.sheets.where('projectId').equals(projectId).toArray(); if(sheets.length>=100) throw new Error('A project cannot contain more than 100 sheets.')
    const sheet=createSheetRecord(projectId,name,sheets.length,now(),defaultRemarkVisible); const next=[...sheets,sheet]; assertValid(validateProject({...project,activeSheetId:sheet.id},next),'New sheet')
    const timestamp=newest(now(),project.updatedAt); await database.sheets.add({...sheet,updatedAt:timestamp}); await database.projects.put({...project,activeSheetId:sheet.id,updatedAt:timestamp}); return sheet
  })
}
export async function renameSheet(sheetId,name) {
  return database.transaction('rw',database.projects,database.sheets,async()=>{
    const sheet=await database.sheets.get(sheetId); if(!sheet) throw new Error('Sheet not found.')
    const project=await database.projects.get(sheet.projectId); const sheets=await database.sheets.where('projectId').equals(sheet.projectId).toArray()
    const renamed={...sheet,name:normalizeText(name)}; assertValid(validateProject(project,sheets.map((item)=>item.id===sheetId?renamed:item)),'Renamed sheet')
    const timestamp=newest(now(),project.updatedAt); await database.sheets.put({...renamed,updatedAt:timestamp}); await database.projects.put({...project,updatedAt:timestamp}); return renamed
  })
}
export async function duplicateSheet(sheetId,name) {
  return database.transaction('rw',database.projects,database.sheets,database.attachments,database.attachmentBlobs,async()=>{
    const source=await database.sheets.get(sheetId); if(!source) throw new Error('Sheet not found.')
    const project=await database.projects.get(source.projectId); const sheets=(await database.sheets.where('projectId').equals(source.projectId).toArray()).sort((a,b)=>a.position-b.position)
    if(sheets.length>=100) throw new Error('A project cannot contain more than 100 sheets.')
    const position=source.position+1; const timestamp=newest(now(),project.updatedAt)
    const copy={...structuredClone(source),id:createId(),name:normalizeText(name),position,data:cloneWithNewRowIds(source.data),createdAt:timestamp,updatedAt:timestamp}
    const next=sheets.map((s)=>s.position>=position?{...s,position:s.position+1}:s); next.splice(position,0,copy)
    assertValid(validateProject(project,next),'Duplicated sheet')
    const attachments=await duplicateSheetAttachments(source,copy)
    await database.sheets.bulkPut(next.map((s)=>({...s,updatedAt:timestamp}))); if(attachments.metadata.length)await database.attachments.bulkAdd(attachments.metadata);if(attachments.imageBlobs.length)await database.attachmentBlobs.bulkAdd(attachments.imageBlobs); await database.projects.put({...project,updatedAt:timestamp}); return copy
  })
}
export async function deleteSheet(sheetId) {
  return database.transaction('rw',database.projects,database.sheets,database.attachments,database.attachmentBlobs,async()=>{
    const sheet=await database.sheets.get(sheetId); if(!sheet) return null
    const project=await database.projects.get(sheet.projectId); const sheets=(await database.sheets.where('projectId').equals(sheet.projectId).toArray()).sort((a,b)=>a.position-b.position)
    if(sheets.length===1) throw new Error('The only sheet in a project cannot be deleted.')
    const rest=sheets.filter((s)=>s.id!==sheetId).map((s,index)=>({...s,position:index})); const active=project.activeSheetId===sheetId?rest[Math.min(sheet.position,rest.length-1)].id:project.activeSheetId; const timestamp=newest(now(),project.updatedAt)
    const attachmentIds=await database.attachments.where('sheetId').equals(sheetId).primaryKeys();await database.attachmentBlobs.bulkDelete(attachmentIds);await database.attachments.bulkDelete(attachmentIds); await database.sheets.delete(sheetId); await database.sheets.bulkPut(rest.map((s)=>({...s,updatedAt:timestamp}))); await database.projects.put({...project,activeSheetId:active,updatedAt:timestamp}); return active
  })
}
export async function duplicateProject(projectId,name) {
  const source=await loadProjectWithSheets(projectId); if(!source) throw new Error('Project not found.')
  const timestamp=now(), projectMap=new Map([[source.project.id,createId()]]), sheetMap=new Map(source.sheets.map((s)=>[s.id,createId()]))
  const sheets=source.sheets.map((s)=>({...structuredClone(s),id:sheetMap.get(s.id),projectId:projectMap.get(source.project.id),data:cloneWithNewRowIds(s.data),createdAt:timestamp,updatedAt:timestamp}))
  const assemblies=source.assemblies.map((assembly)=>({...structuredClone(assembly),id:createId(),projectId:projectMap.get(source.project.id),createdAt:timestamp,updatedAt:timestamp}))
  const project={...source.project,id:projectMap.get(source.project.id),name,routeSlug:createUniqueProjectRouteSlug(name,await database.projects.toArray()),routeAliases:[],activeSheetId:sheetMap.get(source.project.activeSheetId),createdAt:timestamp,updatedAt:timestamp}
  assertValid(validateProject(project,sheets),'Duplicated project')
  await database.transaction('rw',database.projects,database.sheets,database.assemblies,database.attachments,database.attachmentBlobs,async()=>{const metadata=[],imageBlobs=[];for(const original of source.sheets){const target=sheets.find((sheet)=>sheet.id===sheetMap.get(original.id));const copies=await duplicateSheetAttachments(original,target);metadata.push(...copies.metadata);imageBlobs.push(...copies.imageBlobs)}await database.projects.add(project);await database.sheets.bulkAdd(sheets);if(assemblies.length)await database.assemblies.bulkAdd(assemblies);if(metadata.length)await database.attachments.bulkAdd(metadata);if(imageBlobs.length)await database.attachmentBlobs.bulkAdd(imageBlobs)})
  return {project,sheets,assemblies}
}
export async function deleteProject(projectId) { return database.transaction('rw',database.projects,database.sheets,database.assemblies,database.attachments,database.attachmentBlobs,async()=>{await database.sheets.where('projectId').equals(projectId).delete();await database.assemblies.where('projectId').equals(projectId).delete();await database.attachments.where('projectId').equals(projectId).delete();await database.attachmentBlobs.where('projectId').equals(projectId).delete();await database.projects.delete(projectId)}) }
export async function readSettings() { let settings=await database.settings.get('app'); if(!settings){settings=createAppSettings();await database.settings.add(settings)} else if(settings.schemaVersion===1||settings.schemaVersion===2) { settings=migrateAppSettings(settings); await database.settings.put(settings) } assertValid(validateSettings(settings),'Persisted settings'); return settings }
export async function writeSettings(settings) { assertValid(validateSettings(settings),'Settings'); await database.settings.put(settings); return settings }

const pending=new Map()
const projectWriteQueues=new Map()
const status=(entry,value,error)=>entry.listeners.forEach((listener)=>listener(value,error))
function enqueueProjectWrite(projectId,write) {
  const queue=projectWriteQueues.get(projectId)??createAsyncWriteQueue()
  projectWriteQueues.set(projectId,queue)
  return queue.enqueue(write)
}
async function persistLatest(entry) {
  if(entry.active) return entry.active
   entry.active=(async()=>{while(entry.latest){const pendingSnapshot=entry.latest;entry.latest=null;status(entry,'Saving...');try{await enqueueProjectWrite(pendingSnapshot.projectId,()=>saveSheetAndProjectTimestamp(pendingSnapshot));entry.dirty=Boolean(entry.latest);if(!entry.dirty){if(entry.groupPending)entry.savedDuringGroup=true;else status(entry,'Saved')}}catch(error){if(!entry.latest)entry.latest=pendingSnapshot;entry.dirty=true;status(entry,'Save failed',error);throw error}}})().finally(()=>{entry.active=null})
  return entry.active
}
export const saveCoordinator={
  subscribe(sheetId,callback){const entry=pending.get(sheetId)||{listeners:new Set(),latest:null,active:null,timer:null,dirty:false};entry.listeners.add(callback);pending.set(sheetId,entry);return()=>entry.listeners.delete(callback)},
  schedule(sheet){const entry=pending.get(sheet.id)||{listeners:new Set(),latest:null,active:null,timer:null,dirty:false};entry.projectId=sheet.projectId;entry.latest=structuredClone(sheet);entry.dirty=true;clearTimeout(entry.timer);entry.timer=setTimeout(()=>persistLatest(entry).catch(()=>{}),500);pending.set(sheet.id,entry)},
  async saveNow(sheet){const entry=pending.get(sheet.id)||{listeners:new Set(),latest:null,active:null,timer:null,dirty:false};entry.projectId=sheet.projectId;entry.latest=structuredClone(sheet);entry.dirty=true;clearTimeout(entry.timer);pending.set(sheet.id,entry);return persistLatest(entry)},
   async saveGroup(sheetsOrSupplier){
     const initial=typeof sheetsOrSupplier==='function'?sheetsOrSupplier():sheetsOrSupplier
     const projectId=initial[0]?.projectId
     if(!projectId)return
     const sheetIds=initial.map((sheet)=>sheet.id)
     const entries=sheetIds.map((id)=>pending.get(id)).filter(Boolean)
     entries.forEach((entry)=>{entry.groupPending=(entry.groupPending??0)+1})
     try {
       await this.flushProject(projectId)
       const latest=typeof sheetsOrSupplier==='function'?sheetsOrSupplier():initial
       await enqueueProjectWrite(projectId,()=>saveSheetsAndProjectTimestamp(latest))
       for(const sheet of latest){
         const entry=pending.get(sheet.id)
         if(!entry)continue
         entry.groupPending=Math.max(0,(entry.groupPending??1)-1)
         if(!entry.latest&&!entry.active){entry.dirty=false;entry.savedDuringGroup=false;if(!entry.groupPending)status(entry,'Saved')}
       }
     } catch(error) {
       for(const sheet of initial){
         const entry=pending.get(sheet.id)
         if(!entry)continue
         entry.groupPending=Math.max(0,(entry.groupPending??1)-1)
         entry.latest=entry.latest??structuredClone(sheet);entry.dirty=true
         status(entry,'Save failed',error)
       }
       throw error
     }
  },
  async retry(sheetId){const entry=pending.get(sheetId);if(!entry?.latest) return;return persistLatest(entry)},
   async flushProject(projectId){
     while(true){
       const entries=[...pending.values()].filter((entry)=>entry.projectId===projectId&&(entry.dirty||entry.active))
       await Promise.all(entries.map((entry)=>{clearTimeout(entry.timer);return persistLatest(entry)}))
       const queued=projectWriteQueues.get(projectId)
       if(queued)await queued.idle()
       if(![...pending.values()].some((entry)=>entry.projectId===projectId&&(entry.dirty||entry.active)))return
     }
   },
  async flushAll(){await Promise.all([...pending.values()].filter((entry)=>entry.dirty||entry.active).map((entry)=>{clearTimeout(entry.timer);return persistLatest(entry)}))},
}
if (typeof window!=='undefined') window.addEventListener('pagehide',()=>{saveCoordinator.flushAll().catch(()=>{})})

export async function exportProjectSnapshot(projectId) {
  await saveCoordinator.flushProject(projectId)
  const snapshot=await database.transaction('r',database.projects,database.sheets,database.assemblies,database.attachments,database.attachmentBlobs,async()=>{
    const loaded=await loadProjectWithSheets(projectId)
    if(!loaded)return null
    const metadata=await database.attachments.where('projectId').equals(projectId).toArray()
    return {...loaded,attachments:await hydrateAttachments(metadata)}
  })
  return snapshot?{...snapshot,attachments:await Promise.all(snapshot.attachments.map(encodeAttachmentForBackup))}:null
}
export async function exportAllProjectsSnapshot() {
  await saveCoordinator.flushAll()
  const snapshot=await database.transaction('r',database.projects,database.sheets,database.assemblies,database.attachments,database.attachmentBlobs,database.settings,async()=>{const metadata=await database.attachments.toArray();return {projects:await database.projects.toArray(),sheets:await database.sheets.toArray(),assemblies:await database.assemblies.toArray(),attachments:await hydrateAttachments(metadata),settings:await readSettings()}})
  return {...snapshot,attachments:await Promise.all(snapshot.attachments.map(encodeAttachmentForBackup))}
}
export async function importProjectAsNew(backup) {
  assertValid(validateProjectBackup(backup),'Project backup')
  const timestamp=now(),projectId=createId(),sheetIds=new Map(backup.sheets.map((s)=>[s.id,createId()]))
  const sheets=backup.sheets.map((s,index)=>({...structuredClone(s),id:sheetIds.get(s.id),projectId,position:index,data:cloneWithNewRowIds(s.data),createdAt:timestamp,updatedAt:timestamp}))
  const assemblies=(backup.assemblies??[]).map((assembly)=>({...structuredClone(assembly),id:createId(),projectId,createdAt:timestamp,updatedAt:timestamp}))
   const project={...backup.project,id:projectId,routeSlug:createUniqueProjectRouteSlug(backup.project.name,await database.projects.toArray()),routeAliases:[],activeSheetId:sheetIds.get(backup.project.activeSheetId),createdAt:timestamp,updatedAt:timestamp}
  assertValid(validateProject(project,sheets),'Imported project')
    await database.transaction('rw',database.projects,database.sheets,database.assemblies,database.attachments,database.attachmentBlobs,async()=>{await database.projects.add(project);await database.sheets.bulkAdd(sheets);if(assemblies.length)await database.assemblies.bulkAdd(assemblies);const attachments=(backup.attachments??[]).flatMap((attachment)=>{const sourceSheet=backup.sheets.find((item)=>item.id===attachment.sheetId);const targetSheet=sheets.find((item)=>item.id===sheetIds.get(attachment.sheetId));return sourceSheet&&targetSheet?[{...normalizeAttachmentOwnership(decodeAttachmentFromBackup(attachment),sourceSheet,targetSheet),id:createId(),projectId,sheetId:targetSheet.id}]:[]});const split=splitAttachmentRecords(attachments);if(split.metadata.length)await database.attachments.bulkAdd(split.metadata);if(split.imageBlobs.length)await database.attachmentBlobs.bulkAdd(split.imageBlobs)})
  return {project,sheets,assemblies}
}
export async function replaceAllProjects(backup) {
  if (backup?.settings?.schemaVersion===1||backup?.settings?.schemaVersion===2) backup={...backup,settings:migrateAppSettings(backup.settings)}
  assertValid(validateAllProjectsBackup(backup),'All-projects backup')
   const attachments=splitAttachmentRecords((backup.attachments??[]).map((attachment)=>{const sheet=backup.sheets.find((item)=>item.id===attachment.sheetId);return normalizeAttachmentOwnership(decodeAttachmentFromBackup(attachment),sheet)}))
   await database.transaction('rw',database.projects,database.sheets,database.assemblies,database.attachments,database.attachmentBlobs,database.settings,async()=>{await database.projects.clear();await database.sheets.clear();await database.assemblies.clear();await database.attachments.clear();await database.attachmentBlobs.clear();await database.settings.clear();await database.projects.bulkAdd(backup.projects);await database.sheets.bulkAdd(backup.sheets);if(backup.assemblies?.length)await database.assemblies.bulkAdd(backup.assemblies);if(attachments.metadata.length)await database.attachments.bulkAdd(attachments.metadata);if(attachments.imageBlobs.length)await database.attachmentBlobs.bulkAdd(attachments.imageBlobs);await database.settings.put(backup.settings)})
  return {clearWorkspace:true,route:'/projects'}
}
export async function deleteAllLocalData() {
  await database.transaction('rw',database.projects,database.sheets,database.assemblies,database.attachments,database.attachmentBlobs,database.settings,async()=>{
    await database.projects.clear(); await database.sheets.clear(); await database.assemblies.clear(); await database.attachments.clear();await database.attachmentBlobs.clear(); await database.settings.clear()
  })
}

let legacyAttempted=false
export async function discoverLegacyCandidate() {
  if(legacyAttempted)return null;legacyAttempted=true
  try {
    if(typeof indexedDB==='undefined')return null
    const candidate=await new Promise((resolve,reject)=>{const request=indexedDB.open('boq-cost-load');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('appState')){db.close();resolve(null);return}const tx=db.transaction('appState','readonly');const get=tx.objectStore('appState').get('boq-cost-load:v1');get.onsuccess=()=>{const value=get.result;db.close();resolve(value??null)};get.onerror=()=>{db.close();reject(get.error)}}})
    if(!candidate)return null
    if(candidate.schemaVersion===4){migrateLegacyWorkbook(candidate);return {type:'legacy-workbook',data:candidate}}
    return {type:'legacy-worksheet',data:migrateLegacyWorksheet(candidate)}
  } catch { return null }
}
