import Dexie from 'dexie'
import { DATABASE_NAME, DATABASE_SCHEMA_VERSION } from '../domain/constants.js'
import { migrateUnitColumn, migrateWorksheetData } from './migrations.js'
import { normalizeBoqCode } from '../domain/normalization.js'

export const database = new Dexie(DATABASE_NAME)
const stores = {
  projects: 'id, updatedAt, createdAt, name',
  sheets: 'id, projectId, [projectId+position], updatedAt',
  settings: 'id',
}
database.version(1).stores(stores)
database.version(3).stores(stores).upgrade(async (transaction) => {
  await transaction.table('sheets').toCollection().modify((sheet) => {
    sheet.data = migrateWorksheetData(migrateUnitColumn(sheet.data))
  })
})
database.version(4).stores({ ...stores, assemblies: 'id, projectId, [projectId+name]' })
const withAttachments={
  ...stores,
  assemblies: 'id, projectId, [projectId+name]',
  attachments: 'id, projectId, sheetId, [sheetId+boqCode], [projectId+sheetId]',
}
database.version(5).stores(withAttachments)
database.version(DATABASE_SCHEMA_VERSION).stores({
  ...withAttachments,
  attachmentBlobs: 'id, projectId, sheetId',
}).upgrade(async(transaction)=>{
  const metadataTable=transaction.table('attachments')
  const blobTable=transaction.table('attachmentBlobs')
  const existing=await metadataTable.toArray()
  const sheetsById=new Map((await transaction.table('sheets').toArray()).map((sheet)=>[sheet.id,sheet]))
  if(existing.length){
    await blobTable.bulkAdd(existing.filter((record)=>record.blob).map(({id,projectId,sheetId,blob})=>({id,projectId,sheetId,blob})))
    await metadataTable.bulkPut(existing.map((record)=>{
      const metadata={...record}
      delete metadata.blob
      metadata.originCode=metadata.originCode??metadata.boqCode
      metadata.itemRowIds=metadata.itemRowIds??(sheetsById.get(metadata.sheetId)?.data.rows??[]).filter((row)=>normalizeBoqCode(row.boqCode)===normalizeBoqCode(metadata.boqCode)).map((row)=>row.id)
      return metadata
    }))
  }
})
