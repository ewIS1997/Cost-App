import { DEFAULT_COLUMN_WIDTHS, DEFAULT_FILTER, NUMERIC_ABSOLUTE_LIMIT } from './constants.js'

export const normalizeBoqCode = (value) => String(value ?? '').trim().toUpperCase()
export const normalizeText = (value) => String(value ?? '').trim()
export const normalizeResourceText = (value) => String(value ?? '').replace(/\r\n?/g, '\n')
export function parseNumeric(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return { value: null, error: null }
  let number
  if (typeof value === 'number') number = value
  else if (typeof value === 'string') {
    const text = value.trim()
    if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text) || !/\d/.test(text)) return { value: null, error: 'Enter a valid number.' }
    number = Number(text.replaceAll(',', ''))
  } else return { value: null, error: 'Enter a number.' }
  if (!Number.isFinite(number)) return { value: null, error: 'Number must be finite.' }
  if (Math.abs(number) > NUMERIC_ABSOLUTE_LIMIT) return { value: null, error: `Number must be within ±${NUMERIC_ABSOLUTE_LIMIT}.` }
  return { value: number, error: null }
}
export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i=0;i<bytes.length;i++) bytes[i] = Math.floor(Math.random()*256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((n)=>n.toString(16).padStart(2,'0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
export const createBlankRow = () => ({ id:createId(), boqCode:'', resource:'', cqbi:null, unit:'', cr:null, rate:null, override:null, boqQty:null, remark:'' })
export function createBlankWorksheet(defaultRemarkVisible = false) {
  return { schemaVersion:4, rows:[], columnWidths:[...DEFAULT_COLUMN_WIDTHS], filters:Object.fromEntries(['boqCode','resource','cqbi','unit','cr','rate','cost','override','usedCost','boqQty','totalCost','remark'].map((key)=>[key,{...DEFAULT_FILTER}])), sort:null, hiddenColumnKeys:defaultRemarkVisible?[]:['remark'] }
}
export function createSheetRecord(projectId, name, position, timestamp = new Date().toISOString(), defaultRemarkVisible = false) {
  return { id:createId(), projectId, name:normalizeText(name), position, data:createBlankWorksheet(defaultRemarkVisible), createdAt:timestamp, updatedAt:timestamp }
}
export function createProjectRecord(name, firstSheetId, darkMode = false, timestamp = new Date().toISOString()) {
  return { id:createId(), name:normalizeText(name), activeSheetId:firstSheetId, darkMode:Boolean(darkMode), createdAt:timestamp, updatedAt:timestamp }
}
export const APP_FONT_FAMILIES = Object.freeze(['inter','manrope','source-sans-3','atkinson-hyperlegible'])
export const createAppSettings = () => ({ id:'app', schemaVersion:3, theme:'system', fontSize:'default', fontFamily:'inter', density:'comfortable', quantityDecimals:3, costDecimals:2, useGrouping:true, currencyLabel:'', defaultDarkMode:false, defaultRemarkVisible:false, storageNoticeDismissed:false })
