import { COLUMN_DEFINITIONS } from './columns.js'
import { getRowDerivedValues } from './calculations.js'
import { parseNumeric, normalizeBoqCode } from './normalization.js'

export function getProjectionValue(row, key) {
  if (['resourceTotalCost', 'costPercentage'].includes(key)) return row[key] ?? null
  if (key === 'boqCode') return normalizeBoqCode(row.boqCode)
  if (key === 'boqQty') return row.boqQty
  if (['cost','usedCost','totalCost'].includes(key)) return getRowDerivedValues(row)[key]
  return row[key]
}
export const isNumericFilterColumn = (key) => ['cqbi','cr','rate','override','cost','usedCost','boqQty','totalCost','resourceTotalCost','costPercentage'].includes(key)
function blank(value) { return value === null || value === undefined || (typeof value==='string' && value.trim()==='') }
function conditionMatches(value, filter, numeric) {
  const c = filter.condition; const text = String(value ?? '').toLocaleLowerCase(); const target = String(filter.conditionValue ?? '').toLocaleLowerCase()
  if (!c) return true
  if (c==='isBlank') return blank(value)
  if (c==='isNotBlank') return !blank(value)
  if (['equals','notEquals','contains','notContains','startsWith','endsWith'].includes(c)) {
    let match
    if (numeric && ['equals','notEquals'].includes(c)) {
      const valueNumber=parseNumeric(value),targetNumber=parseNumeric(filter.conditionValue)
      match=!valueNumber.error&&!targetNumber.error&&valueNumber.value!==null&&targetNumber.value!==null&&valueNumber.value===targetNumber.value
    } else if (c==='contains') match=text.includes(target)
    else if (c==='notContains') match=!text.includes(target)
    else if (c==='startsWith') match=text.startsWith(target)
    else if (c==='endsWith') match=text.endsWith(target)
    else match=text===target
    return c==='notEquals' ? !match : match
  }
  if (!numeric || blank(value)) return false
  const parsed = parseNumeric(value); const first = parseNumeric(filter.conditionValue)
  if (parsed.error || first.error || parsed.value===null || first.value===null) return false
  const second = parseNumeric(filter.conditionValue2)
  if (c==='between') {
    if (second.error || second.value===null) return false
    const low=Math.min(first.value,second.value), high=Math.max(first.value,second.value)
    return parsed.value>=low && parsed.value<=high
  }
  return c==='gt' ? parsed.value>first.value : c==='gte' ? parsed.value>=first.value : c==='lt' ? parsed.value<first.value : c==='lte' ? parsed.value<=first.value : true
}
export function projectVisibleRowIds(rows, filters = {}, sort = null) {
  const filtered = rows.filter((row)=>Object.entries(filters).every(([key, filter])=>{
    if (!filter) return true
    const value=getProjectionValue(row,key); const definition=COLUMN_DEFINITIONS.find((col)=>col.key===key)
    const search=String(filter.search ?? '').trim().toLocaleLowerCase()
    const searchable=String(value ?? '').toLocaleLowerCase()
    if (search && !searchable.includes(search)) return false
    if (Array.isArray(filter.selected) && !filter.selected.includes(String(value ?? ''))) return false
    return conditionMatches(value,filter,Boolean(definition?.derived) || isNumericFilterColumn(key))
  }))
  if (!sort) return filtered.map((row)=>row.id)
   const key=sort.key ?? COLUMN_DEFINITIONS[sort.col]?.key
  if (!key) return filtered.map((row)=>row.id)
  const direction=sort.direction==='desc' ? -1 : 1
  return filtered.map((row,index)=>({row,index,value:getProjectionValue(row,key)})).sort((a,b)=>{
    const ab=blank(a.value), bb=blank(b.value); if (ab!==bb) return ab ? 1 : -1
    if (ab) return a.index-b.index
    let order
    if (typeof a.value==='number' && typeof b.value==='number') order=a.value-b.value
    else order=String(a.value).localeCompare(String(b.value),undefined,{sensitivity:'base',numeric:true})
    return order*direction || a.index-b.index
  }).map(({row})=>row.id)
}
export function getFilterRelevantValues(filter) {
  if (!filter || (!filter.search && !filter.condition && filter.selected===null)) return { suitable:true, values:{} }
  return { suitable:false, values:{}, reason:'No source row is available to copy values that satisfy the active filter.' }
}
export function getInsertionValuesFromRow(row, filters = {}) {
  if (!row) return { suitable:false, values:{}, reason:'No visible source row is available for filter-aware insertion.' }
  const values={}
  const dependencies = {
    boqCode:['boqCode','boqQty'], resource:['resource'], cqbi:['cqbi'], unit:['unit'], cr:['cr'], rate:['rate'],
    cost:['cqbi','cr','rate'], override:['override'], usedCost:['override','cqbi','cr','rate'],
    boqQty:['boqQty'],
    totalCost:['cqbi','cr','rate','override','boqQty'], remark:['remark'],
  }
  for (const [key,filter] of Object.entries(filters)) {
    if (!filter || (!filter.search && !filter.condition && filter.selected===null)) continue
    for (const field of dependencies[key] ?? []) values[field]=row[field]
  }
  return { suitable:true, values }
}
