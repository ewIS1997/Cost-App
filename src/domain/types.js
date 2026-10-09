/** Persisted records below describe storage and backup boundaries, not display projections. */
/** @typedef {{ id: string, boqCode: string, resource: string, cqbi: number|null, unit: string, cr: number|null, rate: number|null, override: number|null, boqQty: number|null, remark: string, expressions?: Object<string,string> }} CostRow */
/** Numeric expressions retain source text beside evaluated inputs. Zero is an input, not a missing (null) value. cost, usedCost and totalCost are derived, never persisted. */
/** @typedef {{ search: string, condition: string, conditionValue: string, conditionValue2: string, selected: string[]|null }} ColumnFilter */
/** @typedef {{ schemaVersion: 4, rows: CostRow[], columnWidths: number[], filters: Object<string,ColumnFilter>, sort: {col:number,direction:'asc'|'desc'}|null, hiddenColumnKeys: string[] }} WorksheetData */
/** @typedef {{ id:string, projectId:string, name:string, position:number, data:WorksheetData, createdAt:string, updatedAt:string }} SheetRecord */
/** @typedef {{ id:string, name:string, activeSheetId:string, darkMode:boolean, routeSlug?:string, routeAliases?:string[], createdAt:string, updatedAt:string }} ProjectRecord */
/** @typedef {{ id:string, projectId:string, name:string, sourceSheetName:string, sourceBoqCode:string, rows:Omit<CostRow,'id'|'boqCode'>[], createdAt:string, updatedAt:string }} AssemblyRecord */
/** @typedef {{ id:string, projectId:string, sheetId:string, boqCode:string, originCode?:string, itemRowIds?:string[], position:number, mimeType:string, width:number, height:number, createdAt:string }} AttachmentRecord */
/** @typedef {{ id:string, projectId:string, sheetId:string, blob:Blob }} AttachmentBlobRecord */
/** @typedef {AttachmentRecord & { data:string }} BackupAttachmentRecord Base64 image data replaces the blob in JSON backups. */
/** @typedef {{ id:'app', schemaVersion:3, theme:'system'|'light'|'warm'|'dark', fontSize:'small'|'default'|'large', fontFamily:'inter'|'manrope'|'source-sans-3'|'atkinson-hyperlegible', density:'compact'|'comfortable', quantityDecimals:number, costDecimals:number, useGrouping:boolean, currencyLabel:string, defaultDarkMode:boolean, defaultRemarkVisible:boolean, storageNoticeDismissed:boolean }} AppSettings */
/** @typedef {{ backupType:'boq-cost-load-project', schemaVersion:1, exportedAt:string, project:ProjectRecord, sheets:SheetRecord[], assemblies?:AssemblyRecord[], attachments?:BackupAttachmentRecord[] }} ProjectBackupV1 */
/** @typedef {{ backupType:'boq-cost-load-all-projects', schemaVersion:1, exportedAt:string, projects:ProjectRecord[], sheets:SheetRecord[], assemblies?:AssemblyRecord[], attachments?:BackupAttachmentRecord[], settings:AppSettings }} AllProjectsBackupV1 */
