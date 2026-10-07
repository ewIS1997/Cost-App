import { APP_FONT_FAMILIES, createAppSettings, createBlankRow, createBlankWorksheet, createId, createProjectRecord, createSheetRecord, normalizeBoqCode, normalizeResourceText, normalizeText, parseNumeric } from '../domain/normalization.js'
import { DEFAULT_COLUMN_WIDTHS, DEFAULT_FILTER } from '../domain/constants.js'
import { validateAllProjectsBackup, validateProjectBackup, validateProject, validateWorksheet } from '../domain/validation.js'

function addUnitColumnShape(worksheet) {
  if (Array.isArray(worksheet.columnWidths) && worksheet.columnWidths.length === DEFAULT_COLUMN_WIDTHS.length - 1) {
    worksheet.columnWidths = [...worksheet.columnWidths.slice(0, 3), DEFAULT_COLUMN_WIDTHS[3], ...worksheet.columnWidths.slice(3)]
    if (worksheet.sort?.col >= 3) worksheet.sort = { ...worksheet.sort, col: worksheet.sort.col + 1 }
  }
  worksheet.filters = { ...Object.fromEntries(['boqCode','resource','cqbi','unit','cr','rate','cost','override','usedCost','boqQty','totalCost','remark'].map((key) => [key, { ...DEFAULT_FILTER }])), ...worksheet.filters, unit: worksheet.filters?.unit ?? { ...DEFAULT_FILTER } }
  return worksheet
}

/** Add the Unit column to persisted worksheets created before it existed. */
export function migrateUnitColumn(worksheet) {
  const migrated = { ...worksheet, rows: worksheet.rows.map((row) => ({ ...row, unit: row.unit ?? '' })) }
  return addUnitColumnShape(migrated)
}

export function migrateWorksheetData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.rows)) throw new Error('Worksheet data is missing or invalid.')
  if (data.schemaVersion === 4) return data
  const quantities = data.quantities && typeof data.quantities === 'object' && !Array.isArray(data.quantities) ? data.quantities : {}
  const rows = data.rows.map((row) => {
    const code = normalizeBoqCode(row?.boqCode)
    const boqQty = row?.boqQtyOverride !== null && row?.boqQtyOverride !== undefined
      ? row.boqQtyOverride
      : row?.boqQty !== null && row?.boqQty !== undefined
        ? row.boqQty
        : code
          ? quantities[code] ?? null
          : row?.unassignedQty ?? null
    const fields = { ...row }
    delete fields.boqQtyOverride
    delete fields.unassignedQty
    return { ...fields, boqQty }
  })
  const fields = { ...data }
  delete fields.quantities
  return { ...fields, schemaVersion: 4, rows }
}

/** Migrate supported worksheet-shaped backup only when all authoritative fields are recognized. */
export function migrateLegacyWorksheet(value) {
  if (!value || ![1,2,3,4].includes(value.schemaVersion)) throw new Error('Unsupported legacy worksheet backup. Expected schema version 1, 2, 3, or 4.')
  if (!Array.isArray(value.rows)) throw new Error('Legacy worksheet rows are missing or invalid.')
  if (value.schemaVersion === 4) {
    const current = { ...createBlankWorksheet(), ...value }
    const errors = validateWorksheet(current)
    if (errors.length) throw new Error(`Legacy worksheet is invalid: ${errors.join(' ')}`)
    return current
  }
  const candidate={...createBlankWorksheet(),...value,rows:[]}
  if(value.schemaVersion<4) candidate.quantities=value.quantities??{}
  const numericFields=['cqbi','cr','rate','override','boqQty','boqQtyOverride','unassignedQty']
  candidate.rows=value.rows.map((legacy,index)=>{
    if(!legacy||typeof legacy!=='object'||Array.isArray(legacy))throw new Error(`Legacy row ${index+1} must be an object.`)
    const row=createBlankRow()
    for(const key of ['boqCode','resource','unit','remark'])if(Object.hasOwn(legacy,key)){if(typeof legacy[key]!=='string')throw new Error(`Legacy row ${index+1} field ${key} must be text.`);row[key]=key==='boqCode'?normalizeBoqCode(legacy[key]):key==='resource'?normalizeResourceText(legacy[key]):normalizeText(legacy[key])}
    for(const key of numericFields)if(Object.hasOwn(legacy,key)){const parsed=parseNumeric(legacy[key]);if(parsed.error)throw new Error(`Legacy row ${index+1} field ${key}: ${parsed.error}`);row[key]=parsed.value}
    return row
  })
  addUnitColumnShape(candidate)
  if(!candidate.quantities||typeof candidate.quantities!=='object'||Array.isArray(candidate.quantities))throw new Error('Legacy worksheet quantities must be an object.')
  const normalizedQuantities={}
  for(const [key,raw] of Object.entries(candidate.quantities)){const normalized=normalizeBoqCode(key);if(!normalized)throw new Error('Legacy worksheet contains a blank quantity key.');if(Object.hasOwn(normalizedQuantities,normalized))throw new Error(`Legacy worksheet has duplicate normalized quantity key "${normalized}".`);const parsed=parseNumeric(raw);if(parsed.error||parsed.value===null)throw new Error(`Legacy quantity ${key}: ${parsed.error||'a quantity is required.'}`);normalizedQuantities[normalized]=parsed.value}
  candidate.quantities=normalizedQuantities
  const migrated=migrateWorksheetData(candidate)
  const errors=validateWorksheet(migrated)
  if (errors.length) throw new Error(`Legacy worksheet is invalid: ${errors.join(' ')}`)
  return migrated
}

const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key)
const WORKBOOK_KEYS=new Set(['schemaVersion','darkMode','activeSheetId','sheets'])
const SHEET_KEYS=new Set(['id','name','rows','quantities','columnWidths','filters','sort','hiddenColumnKeys'])
const ROW_KEYS=new Set(['id','boqCode','resource','cqbi','unit','cr','rate','override','boqQty','boqQtyOverride','unassignedQty','remark'])
function assertKeys(value,allowed,label) {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  const extra=Object.keys(value).filter((key)=>!allowed.has(key))
  if (extra.length) throw new Error(`${label} contains unsupported field(s): ${extra.join(', ')}.`)
}

/**
 * Convert the explicitly approved synthetic v4 contract into a new project backup.
 * Contract: workbook {schemaVersion,darkMode,activeSheetId,sheets}; each sheet stores
 * worksheet fields beside id/name; rows use the current ten-field authoritative shape.
 * @param {unknown} value
 * @param {{projectName?:string}} [options]
 */
export function migrateLegacyWorkbook(value,{projectName='Imported Project'}={}) {
  assertKeys(value,WORKBOOK_KEYS,'Legacy workbook')
  if (value.schemaVersion!==4) throw new Error('Unsupported legacy workbook backup. Expected schemaVersion 4.')
  if (typeof value.darkMode!=='boolean') throw new Error('Legacy workbook darkMode must be boolean.')
  if (!Array.isArray(value.sheets)||value.sheets.length<1||value.sheets.length>100) throw new Error('Legacy workbook must contain 1–100 sheets.')
  const timestamp=new Date().toISOString(); const projectId=createId(); const sheetIdMap=new Map()
  for (const sheet of value.sheets) {
    assertKeys(sheet,SHEET_KEYS,'Legacy sheet')
    if (typeof sheet.id!=='string'||!sheet.id.trim()) throw new Error('Every legacy sheet requires a non-empty id.')
    if (sheetIdMap.has(sheet.id)) throw new Error(`Legacy workbook contains duplicate sheet id "${sheet.id}".`)
    sheetIdMap.set(sheet.id,createId())
  }
  if (typeof value.activeSheetId!=='string'||!sheetIdMap.has(value.activeSheetId)) throw new Error('Legacy workbook activeSheetId must reference an existing sheet.')
  const sheets=value.sheets.map((legacy,index)=>{
    if (typeof legacy.name!=='string') throw new Error(`Legacy sheet ${index+1} name must be text.`)
    if (!Array.isArray(legacy.rows)) throw new Error(`Legacy sheet "${legacy.name}" rows must be an array.`)
    let worksheet=addUnitColumnShape({
      schemaVersion:3,
      rows:legacy.rows.map((row,rowIndex)=>{
        assertKeys(row,ROW_KEYS,`Legacy sheet "${legacy.name}" row ${rowIndex+1}`)
        if (!has(row,'id')) throw new Error(`Legacy sheet "${legacy.name}" row ${rowIndex+1} is missing id.`)
        return {...createBlankRow(),...row,id:createId(),boqCode:normalizeBoqCode(row.boqCode)}
      }),
      quantities:legacy.quantities,
      columnWidths:legacy.columnWidths,
      filters:legacy.filters,
      sort:legacy.sort,
      hiddenColumnKeys:legacy.hiddenColumnKeys,
    })
    if (!worksheet.quantities||typeof worksheet.quantities!=='object'||Array.isArray(worksheet.quantities)) throw new Error(`Legacy sheet "${legacy.name}" quantities must be an object.`)
    const normalizedQuantities={}
    for (const [code,quantity] of Object.entries(worksheet.quantities)) {
      const normalized=normalizeBoqCode(code)
      if (!normalized) throw new Error(`Legacy sheet "${legacy.name}" has a blank quantity key.`)
      if (has(normalizedQuantities,normalized)) throw new Error(`Legacy sheet "${legacy.name}" has duplicate normalized quantity key "${normalized}".`)
      normalizedQuantities[normalized]=quantity
    }
    worksheet=migrateWorksheetData({ ...worksheet, quantities: normalizedQuantities })
    const errors=validateWorksheet(worksheet)
    if (errors.length) throw new Error(`Legacy sheet "${legacy.name}" is invalid: ${errors.join(' ')}`)
    return {
      ...createSheetRecord(projectId,normalizeText(legacy.name),index,timestamp),
      id:sheetIdMap.get(legacy.id),
      data:worksheet,
    }
  })
  let name=normalizeText(projectName).slice(0,100)
  if (!name) name='Imported Project'
  const project={...createProjectRecord(name,sheetIdMap.get(value.activeSheetId),value.darkMode,timestamp),id:projectId}
  assertProject(project,sheets)
  return {backupType:'boq-cost-load-project',schemaVersion:1,exportedAt:timestamp,project,sheets}
}

function assertProject(project,sheets) {
  const errors=validateProject(project,sheets)
  if(errors.length) throw new Error(`Legacy workbook is invalid: ${errors.join(' ')}`)
}

function addUnitToBackupSheets(sheets) {
  return sheets.map((sheet) => ({
    ...sheet,
    data: migrateWorksheetData(addUnitColumnShape({
      ...sheet.data,
      rows: sheet.data?.rows?.map((row) => ({ ...row, unit: row.unit ?? '' })),
    })),
  }))
}

export function migrateAppSettings(settings) {
  if (![1,2].includes(settings?.schemaVersion)) return settings
  return {
    ...createAppSettings(),
    ...settings,
    schemaVersion: 3,
    fontFamily: APP_FONT_FAMILIES.includes(settings.fontFamily) ? settings.fontFamily : 'inter',
  }
}

export function migrateBackup(value,options={}) {
  if (value?.backupType==='boq-cost-load-project') {
    const migrated={...value,assemblies:value.assemblies??[],sheets:addUnitToBackupSheets(value.sheets ?? [])}
    const errors=validateProjectBackup(migrated)
    if (errors.length) throw new Error(errors.join(' '))
    return migrated
  }
  if (value?.backupType==='boq-cost-load-all-projects') {
    const migrated={...value,assemblies:value.assemblies??[],settings:migrateAppSettings(value.settings),sheets:addUnitToBackupSheets(value.sheets ?? [])}
    const errors=validateAllProjectsBackup(migrated)
    if(errors.length) throw new Error(errors.join(' '))
    return migrated
  }
  if (value?.schemaVersion===4) return migrateLegacyWorkbook(value,options)
  return migrateLegacyWorksheet(value)
}
