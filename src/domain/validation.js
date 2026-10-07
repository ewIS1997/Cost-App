import { COLUMN_DEFINITIONS, COLUMN_KEYS } from './columns.js'
import { ASSEMBLY_LINE_LIMIT, ASSEMBLY_NAME_LIMIT, BOQ_CODE_LIMIT, COLUMN_WIDTH_MAX, COLUMN_WIDTH_MIN, PROJECT_NAME_LIMIT, REMARK_LIMIT, RESOURCE_LIMIT, ROW_LIMIT, SHEET_LIMIT, SHEET_NAME_LIMIT, UNIT_LIMIT, NUMERIC_ABSOLUTE_LIMIT } from './constants.js'
import { APP_FONT_FAMILIES, normalizeBoqCode, parseNumeric } from './normalization.js'
import { validateProjectRouteIdentities } from './projectRoutes.js'
import { evaluateArithmeticExpression } from './arithmetic.js'
import { IMAGE_ATTACHMENT_MAX_BYTES, IMAGE_ATTACHMENT_MAX_DIMENSION } from './imageAttachments.js'

const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key)
function numeric(value,label,errors,nullable=true) { if (nullable && value===null) return; if (typeof value!=='number' || !Number.isFinite(value) || Math.abs(value)>NUMERIC_ABSOLUTE_LIMIT) errors.push(`${label} must be ${nullable?'null or ':''}a finite number within ±${NUMERIC_ABSOLUTE_LIMIT}.`) }
export function validateRow(row, index=0, ids=new Set()) {
  const errors=[]; const label=`Row ${index+1}`
  if (!row || typeof row!=='object') return [`${label}: expected a row object.`]
  if (typeof row.id!=='string' || !row.id.trim()) errors.push(`${label}: id is required.`)
  else if (ids.has(row.id)) errors.push(`${label}: duplicate row id "${row.id}".`); else ids.add(row.id)
    const required=new Set(['id','boqCode','resource','cqbi','unit','cr','rate','override','boqQty','remark'])
    const allowed=new Set([...required,'expressions'])
   for (const key of required) if (!own(row,key)) errors.push(`${label}: required field ${key} is missing.`)
  for (const key of Object.keys(row)) if (!allowed.has(key)) errors.push(`${label}: unsupported persisted field ${key}.`)
  for (const [key,max] of [['boqCode',BOQ_CODE_LIMIT],['resource',RESOURCE_LIMIT],['unit',UNIT_LIMIT],['remark',REMARK_LIMIT]]) if (typeof row[key]!=='string' || row[key].length>max) errors.push(`${label}: ${key} must be text of at most ${max} characters.`)
   for (const key of ['cqbi','cr','rate','override','boqQty']) numeric(row[key],`${label} ${key}`,errors)
   if (row.expressions!==undefined) {
     const expressionKeys=new Set(['cqbi','cr','rate','override','boqQty'])
     if (!row.expressions || typeof row.expressions!=='object' || Array.isArray(row.expressions)) errors.push(`${label}: expressions must be an object.`)
     else for (const [key,expression] of Object.entries(row.expressions)) {
       if (!expressionKeys.has(key)) { errors.push(`${label}: unsupported expression field ${key}.`); continue }
       if (typeof expression!=='string'||!expression.trim()||expression.length>256) { errors.push(`${label}: ${key} expression must be 1–256 characters.`); continue }
       const evaluated=evaluateArithmeticExpression(expression)
       if (evaluated.error||evaluated.value!==row[key]) errors.push(`${label}: ${key} expression must evaluate to its stored numeric value.`)
     }
   }
  return errors
}
export function validateWorksheet(data) {
  const errors=[]
  if (!data || typeof data!=='object') return ['Worksheet must be an object.']
   if (data.schemaVersion!==4) errors.push('Worksheet schemaVersion must be 4.')
   if (!Array.isArray(data.rows) || data.rows.length>ROW_LIMIT) errors.push(`Worksheet must contain 0–${ROW_LIMIT} rows.`)
  const ids=new Set(); for (const [index,row] of (Array.isArray(data.rows)?data.rows:[]).entries()) errors.push(...validateRow(row,index,ids))
  if (!Array.isArray(data.columnWidths) || data.columnWidths.length!==COLUMN_DEFINITIONS.length || data.columnWidths.some((width)=>!Number.isFinite(width)||width<COLUMN_WIDTH_MIN||width>COLUMN_WIDTH_MAX)) errors.push(`Column widths must contain ${COLUMN_DEFINITIONS.length} values from ${COLUMN_WIDTH_MIN} to ${COLUMN_WIDTH_MAX}.`)
  if (!data.filters || typeof data.filters!=='object') errors.push('Worksheet filters must be an object.')
  else for (const key of Object.keys(data.filters)) { const f=data.filters[key]; if (!COLUMN_KEYS.includes(key)) errors.push(`Unknown filter column "${key}".`); if (!f || typeof f.search!=='string' || typeof f.condition!=='string' || typeof f.conditionValue!=='string' || typeof f.conditionValue2!=='string' || !(f.selected===null || (Array.isArray(f.selected)&&f.selected.every((v)=>typeof v==='string')))) errors.push(`Filter ${key} has an invalid shape.`) }
  if (!(data.sort===null || (Number.isInteger(data.sort?.col)&&data.sort.col>=0&&data.sort.col<COLUMN_DEFINITIONS.length&&['asc','desc'].includes(data.sort.direction)))) errors.push('Sort state is invalid.')
  if (!Array.isArray(data.hiddenColumnKeys) || data.hiddenColumnKeys.some((key)=>!COLUMN_KEYS.includes(key))) errors.push('Hidden columns contain an unrecognized key.')
  return errors
}
export function validateSheet(sheet, projectId) {
  const errors=[]; if (!sheet || typeof sheet!=='object') return ['Sheet must be an object.']
  if (typeof sheet.id!=='string'||!sheet.id) errors.push('Sheet id is required.'); if (sheet.projectId!==projectId) errors.push(`Sheet ${sheet.id||''} belongs to a different project.`)
  if (typeof sheet.name!=='string'||!sheet.name.trim()||sheet.name.trim().length>SHEET_NAME_LIMIT) errors.push(`Sheet name must be non-empty and at most ${SHEET_NAME_LIMIT} characters.`)
  if (!Number.isInteger(sheet.position)||sheet.position<0) errors.push(`Sheet ${sheet.name||''} has an invalid position.`)
  for (const key of ['createdAt','updatedAt']) if (!Number.isFinite(Date.parse(sheet[key]))) errors.push(`Sheet ${sheet.name||''} has an invalid ${key} timestamp.`)
  return errors.concat(validateWorksheet(sheet.data))
}
export function validateProject(project,sheets) {
  const errors=[]; if (!project || typeof project!=='object') return ['Project must be an object.']
  if (typeof project.id!=='string'||!project.id) errors.push('Project id is required.')
  if (typeof project.name!=='string'||!project.name.trim()||project.name.trim().length>PROJECT_NAME_LIMIT) errors.push(`Project name must be non-empty and at most ${PROJECT_NAME_LIMIT} characters.`)
  if (typeof project.darkMode!=='boolean') errors.push('Project darkMode must be boolean.')
  if (project.routeSlug!==undefined&&(typeof project.routeSlug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.routeSlug))) errors.push('Project routeSlug must be a readable lowercase URL slug.')
  if (project.routeAliases!==undefined&&(!Array.isArray(project.routeAliases)||project.routeAliases.some((slug)=>typeof slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))||new Set(project.routeAliases).size!==project.routeAliases.length)) errors.push('Project routeAliases must be unique readable lowercase URL slugs.')
  if(typeof project.id==='string'&&project.routeSlug===project.id)errors.push('Project routeSlug must not equal its internal ID.')
  if(typeof project.id==='string'&&Array.isArray(project.routeAliases)&&project.routeAliases.includes(project.id))errors.push('Project routeAliases must not contain its internal ID.')
  if(typeof project.routeSlug==='string'&&Array.isArray(project.routeAliases)&&project.routeAliases.includes(project.routeSlug))errors.push('Project routeAliases must not contain its current routeSlug.')
  for (const key of ['createdAt','updatedAt']) if (!Number.isFinite(Date.parse(project[key]))) errors.push(`Project has an invalid ${key} timestamp.`)
  if (!Array.isArray(sheets)||sheets.length<1||sheets.length>SHEET_LIMIT) errors.push(`Project must contain 1–${SHEET_LIMIT} sheets.`)
  else {
    const names=new Set(); const ids=new Set(); const positions=new Set(); for (const sheet of sheets) { errors.push(...validateSheet(sheet,project.id)); const name=sheet.name?.trim().toLocaleLowerCase(); if (names.has(name)) errors.push(`Duplicate sheet name "${sheet.name}".`); names.add(name); if (ids.has(sheet.id)) errors.push(`Duplicate sheet id "${sheet.id}".`); ids.add(sheet.id); if(positions.has(sheet.position)) errors.push(`Duplicate sheet position ${sheet.position}.`); positions.add(sheet.position) }
    for(let position=0;position<sheets.length;position++) if(!positions.has(position)) errors.push(`Sheet position ${position} is missing.`)
    if (!ids.has(project.activeSheetId)) errors.push('Project activeSheetId must reference one of its sheets.')
  }
  return errors
}
export function validateSettings(settings) { return settings?.id==='app'&&settings.schemaVersion===3&&['system','light','dark','warm'].includes(settings.theme)&&['small','default','large'].includes(settings.fontSize)&&APP_FONT_FAMILIES.includes(settings.fontFamily)&&['compact','comfortable'].includes(settings.density)&&Number.isInteger(settings.quantityDecimals)&&settings.quantityDecimals>=0&&settings.quantityDecimals<=6&&Number.isInteger(settings.costDecimals)&&settings.costDecimals>=0&&settings.costDecimals<=6&&typeof settings.useGrouping==='boolean'&&typeof settings.currencyLabel==='string'&&settings.currencyLabel.length<=12&&typeof settings.defaultDarkMode==='boolean'&&typeof settings.defaultRemarkVisible==='boolean'&&typeof settings.storageNoticeDismissed==='boolean' ? [] : ['Application settings have an invalid schema or field value.'] }
export function validateAssemblies(assemblies, projectId) {
  if (!Array.isArray(assemblies)) return ['Assemblies must be an array.']
  const errors=[]; const ids=new Set(); const names=new Set()
  for (const [index,assembly] of assemblies.entries()) {
    const label=`Assembly ${index+1}`
    if (!assembly || typeof assembly!=='object') { errors.push(`${label} must be an object.`); continue }
    if (typeof assembly.id!=='string'||!assembly.id.trim()) errors.push(`${label} id is required.`)
    else if(ids.has(assembly.id)) errors.push(`${label} has duplicate id "${assembly.id}".`); else ids.add(assembly.id)
    if (assembly.projectId!==projectId) errors.push(`${label} belongs to a different project.`)
    if (typeof assembly.name!=='string'||!assembly.name.trim()||assembly.name.trim().length>ASSEMBLY_NAME_LIMIT) errors.push(`${label} name must be 1-${ASSEMBLY_NAME_LIMIT} characters.`)
    const normalizedName=typeof assembly.name==='string'?assembly.name.trim().toLocaleLowerCase():''
    if(normalizedName&&names.has(normalizedName)) errors.push(`${label} name "${assembly.name}" is duplicated.`); names.add(normalizedName)
    if(typeof assembly.sourceSheetName!=='string'||assembly.sourceSheetName.length>SHEET_NAME_LIMIT) errors.push(`${label} source sheet name is invalid.`)
    if(typeof assembly.sourceBoqCode!=='string'||!assembly.sourceBoqCode.trim()||assembly.sourceBoqCode.length>BOQ_CODE_LIMIT) errors.push(`${label} source BOQ code is invalid.`)
    for(const key of Object.keys(assembly))if(!['id','projectId','name','sourceSheetName','sourceBoqCode','rows','createdAt','updatedAt'].includes(key))errors.push(`${label} has unsupported field ${key}.`)
    if(!Number.isFinite(Date.parse(assembly.createdAt))||!Number.isFinite(Date.parse(assembly.updatedAt))) errors.push(`${label} timestamps are invalid.`)
    if(!Array.isArray(assembly.rows)||assembly.rows.length<1||assembly.rows.length>ASSEMBLY_LINE_LIMIT) { errors.push(`${label} must contain 1-${ASSEMBLY_LINE_LIMIT} resource lines.`); continue }
    assembly.rows.forEach((row,rowIndex)=>{
      const rowLabel=`${label} resource ${rowIndex+1}`
      if(!row||typeof row!=='object'||Array.isArray(row)) { errors.push(`${rowLabel} must be an object.`); return }
      const keys=['resource','cqbi','unit','cr','rate','override','boqQty','remark']
      for(const key of keys)if(!own(row,key))errors.push(`${rowLabel} is missing ${key}.`)
      for(const key of Object.keys(row))if(!keys.includes(key))errors.push(`${rowLabel} has unsupported field ${key}.`)
      for(const [key,max] of [['resource',RESOURCE_LIMIT],['unit',UNIT_LIMIT],['remark',REMARK_LIMIT]])if(typeof row[key]!=='string'||row[key].length>max)errors.push(`${rowLabel} ${key} must be text of at most ${max} characters.`)
      for(const key of ['cqbi','cr','rate','override','boqQty'])numeric(row[key],`${rowLabel} ${key}`,errors)
    })
  }
  return errors
}
export function validateBackupAttachments(attachments, projects, sheets) {
  if (attachments===undefined) return []
  if (!Array.isArray(attachments)) return ['Backup attachments must be an array.']
  const errors=[],ids=new Set(),positions=new Set()
  const projectIds=new Set((Array.isArray(projects)?projects:[]).filter(Boolean).map((project)=>project.id))
  const sheetById=new Map((Array.isArray(sheets)?sheets:[]).filter(Boolean).map((sheet)=>[sheet.id,sheet]))
  for (const [index,attachment] of attachments.entries()) {
    const label=`Image attachment ${index+1}`
    if (!attachment||typeof attachment!=='object'||Array.isArray(attachment)) { errors.push(`${label} must be an object.`); continue }
    if (typeof attachment.id!=='string'||!attachment.id.trim()) errors.push(`${label} id is required.`)
    else if(ids.has(attachment.id)) errors.push(`${label} id is duplicated.`); else ids.add(attachment.id)
    if (!projectIds.has(attachment.projectId)) errors.push(`${label} references a missing project.`)
    const sheet=sheetById.get(attachment.sheetId)
    if (!sheet||sheet.projectId!==attachment.projectId) errors.push(`${label} references a missing or unrelated worksheet.`)
    if (typeof attachment.boqCode!=='string'||!normalizeBoqCode(attachment.boqCode)||attachment.boqCode!==normalizeBoqCode(attachment.boqCode)) errors.push(`${label} has an invalid BQ code.`)
    if (attachment.originCode!==undefined&&(typeof attachment.originCode!=='string'||!normalizeBoqCode(attachment.originCode)||attachment.originCode!==normalizeBoqCode(attachment.originCode))) errors.push(`${label} has an invalid origin BQ code.`)
    if (attachment.itemRowIds!==undefined&&(!Array.isArray(attachment.itemRowIds)||attachment.itemRowIds.some((id)=>typeof id!=='string'||!id)||new Set(attachment.itemRowIds).size!==attachment.itemRowIds.length)) errors.push(`${label} has invalid originating row IDs.`)
    if (!Number.isInteger(attachment.position)||attachment.position<0) errors.push(`${label} has an invalid order.`)
    else { const positionKey=`${attachment.sheetId}\u0000${attachment.boqCode}\u0000${attachment.position}`;if(positions.has(positionKey))errors.push(`${label} has a duplicate order for its BQ item.`);positions.add(positionKey) }
    if (!['image/png','image/jpeg'].includes(attachment.mimeType)) errors.push(`${label} has an unsupported image type.`)
    if (!Number.isInteger(attachment.width)||attachment.width<1||attachment.width>IMAGE_ATTACHMENT_MAX_DIMENSION||!Number.isInteger(attachment.height)||attachment.height<1||attachment.height>IMAGE_ATTACHMENT_MAX_DIMENSION) errors.push(`${label} has invalid image dimensions.`)
    if (typeof attachment.data!=='string'||!attachment.data.length||attachment.data.length>Math.ceil(IMAGE_ATTACHMENT_MAX_BYTES*4/3)+8||!/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data)) errors.push(`${label} has invalid or oversized image data.`)
  }
  return errors
}
export function validateProjectBackup(backup) {
  const errors=[]; if (backup?.backupType!=='boq-cost-load-project'||backup.schemaVersion!==1) return ['Unsupported project backup type or schema version.']
  if (!Number.isFinite(Date.parse(backup.exportedAt))) errors.push('Backup exportedAt timestamp is invalid.')
  errors.push(...validateProject(backup.project,backup.sheets)); errors.push(...validateAssemblies(own(backup,'assemblies')?backup.assemblies:[],backup.project?.id)); errors.push(...validateBackupAttachments(backup.attachments,[backup.project],backup.sheets)); return errors
}
export function validateAllProjectsBackup(backup) {
  const errors=[]; if (backup?.backupType!=='boq-cost-load-all-projects'||backup.schemaVersion!==1) return ['Unsupported all-projects backup type or schema version.']
  if (!Number.isFinite(Date.parse(backup.exportedAt))) errors.push('Backup exportedAt timestamp is invalid.')
  const projects=backup.projects; const sheets=backup.sheets; const assemblies=own(backup,'assemblies')?backup.assemblies:[]
  if (!Array.isArray(projects)||!Array.isArray(sheets)||!Array.isArray(assemblies)) return errors.concat(['Backup projects, sheets, and assemblies must be arrays.'])
  const projectIds=new Set(); const sheetIds=new Set(); const assemblyIds=new Set(); for (const project of projects) { if (projectIds.has(project.id)) errors.push(`Duplicate project id "${project.id}".`); projectIds.add(project.id); errors.push(...validateProject(project,sheets.filter((sheet)=>sheet.projectId===project.id))); errors.push(...validateAssemblies(assemblies.filter((assembly)=>assembly?.projectId===project.id),project.id)) }
  for(const sheet of sheets){if(sheetIds.has(sheet.id)) errors.push(`Duplicate sheet id "${sheet.id}" in all-projects backup.`);sheetIds.add(sheet.id)}
  if (sheets.some((sheet)=>!projectIds.has(sheet.projectId))) errors.push('Backup contains a sheet referencing a missing project.')
  if (assemblies.some((assembly)=>!assembly||!projectIds.has(assembly.projectId))) errors.push('Backup contains an assembly referencing a missing project.')
  if(projects.every((project)=>typeof project?.routeSlug==='string')) errors.push(...validateProjectRouteIdentities(projects))
  for(const assembly of assemblies){if(assembly?.id&&assemblyIds.has(assembly.id))errors.push(`Duplicate assembly id "${assembly.id}" in all-projects backup.`);if(assembly?.id)assemblyIds.add(assembly.id)}
  errors.push(...validateSettings(backup.settings)); errors.push(...validateBackupAttachments(backup.attachments,projects,sheets)); return errors
}
export function validateExcelStagingRows(rows) {
  const errors=[]
  for (const row of rows) {
    if (row.boqQty===null || row.boqQty===undefined) continue
    const parsed=parseNumeric(row.boqQty)
    if (parsed.error) errors.push(`Excel row ${row.sourceRow}: BOQ Qty: ${parsed.error}`)
  }
  return errors
}
