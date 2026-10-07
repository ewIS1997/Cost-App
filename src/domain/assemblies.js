import { ASSEMBLY_NAME_LIMIT } from './constants.js'
import { getProjectResourceKey } from './projectResources.js'
import { normalizeBoqCode, normalizeText, createId } from './normalization.js'
import { copyResourcesToBoq } from './resourceCopy.js'
import { validateWorksheet } from './validation.js'

const RESOURCE_FIELDS = ['resource','cqbi','unit','cr','rate','override','boqQty','remark']

export function createAssemblySnapshot({ projectId, name, sourceSheetName, sourceBoqCode, sourceRows, id = createId(), timestamp = new Date().toISOString() }) {
  const normalizedName = normalizeText(name)
  if (!normalizedName || normalizedName.length > ASSEMBLY_NAME_LIMIT) throw new Error(`Assembly name must be 1-${ASSEMBLY_NAME_LIMIT} characters.`)
  const code = normalizeBoqCode(sourceBoqCode)
  if (!code) throw new Error('A BOQ item with a code is required to create an assembly.')
  if (!Array.isArray(sourceRows) || !sourceRows.length) throw new Error('The selected BOQ item has no resource rows to save.')
  return {
    id, projectId, name: normalizedName, sourceSheetName: normalizeText(sourceSheetName), sourceBoqCode: code,
    rows: sourceRows.map((row) => Object.fromEntries(RESOURCE_FIELDS.map((key) => [key, row[key]]))),
    createdAt: timestamp, updatedAt: timestamp,
  }
}

export function resolveCurrentAssemblyRates(assembly, sheets) {
  const resources = new Map()
  for (const sheet of sheets) for (const row of sheet.data?.rows ?? []) {
    const key = getProjectResourceKey(row.resource, row.unit)
    if (!key) continue
    const entry = resources.get(key) ?? { rates: new Set(), missing: false }
    if (typeof row.rate === 'number' && Number.isFinite(row.rate)) entry.rates.add(row.rate)
    else entry.missing = true
    resources.set(key, entry)
  }
  const rates = new Map()
  const issues = []
  for (const row of assembly.rows) {
    const key = getProjectResourceKey(row.resource, row.unit)
    const entry = key ? resources.get(key) : null
    if (!entry || entry.missing || entry.rates.size !== 1) {
      const reason = !entry || entry.rates.size === 0 ? 'no current rate' : entry.rates.size > 1 ? 'multiple current rates' : 'some matching lines have no rate'
      issues.push({ resource: row.resource || '(unnamed resource)', unit: row.unit, reason })
      continue
    }
    rates.set(key, [...entry.rates][0])
  }
  return { rates, issues }
}

export function applyAssemblyToSheet({ sheet, assembly, destinationCode, mode = 'replace', cqbiMode = 'assembly', rateMode = 'assembly', currentRates = new Map(), createRowId = createId }) {
  const code = normalizeBoqCode(destinationCode)
  if (!code) throw new Error('Choose a destination BOQ item with a code.')
  if (!['append','replace'].includes(mode)) throw new Error('Choose Append or Replace.')
  if (!['assembly','destination'].includes(cqbiMode)) throw new Error('Choose assembly or destination CQBI.')
  if (!['assembly','current'].includes(rateMode)) throw new Error('Choose saved or current project rates.')
  const rows = sheet.data.rows
  const destinationRows = rows.filter((row) => normalizeBoqCode(row.boqCode) === code)
  if (!destinationRows.length) throw new Error(`Destination BOQ ${code} is no longer available on ${sheet.name}.`)
  if (rateMode === 'current') {
    const missing = assembly.rows.filter((row) => !currentRates.has(getProjectResourceKey(row.resource, row.unit)))
    if (missing.length) throw new Error(`Current rates are unavailable for: ${missing.map((row) => row.resource || '(unnamed resource)').join(', ')}.`)
  }
  const replacementRows = copyResourcesToBoq(assembly.rows, destinationRows, code, createRowId, { preserveDestinationCqbi: cqbiMode === 'destination' })
    .map((row) => rateMode === 'current' ? { ...row, rate: currentRates.get(getProjectResourceKey(row.resource, row.unit)) } : row)
  const firstIndex = rows.findIndex((row) => normalizeBoqCode(row.boqCode) === code)
  const lastIndex = rows.reduce((last, row, index) => normalizeBoqCode(row.boqCode) === code ? index : last, -1)
  const nextRows = rows.filter((row) => mode !== 'replace' || normalizeBoqCode(row.boqCode) !== code)
  const insertionIndex = mode === 'replace' ? firstIndex : lastIndex + 1
  nextRows.splice(insertionIndex, 0, ...replacementRows)
  return { ...sheet.data, rows: nextRows }
}

export function planAssemblyApplication({ sheets, assembly, destinations, mode = 'replace', cqbiMode = 'assembly', rateMode = 'assembly', createRowId = createId }) {
  if (!Array.isArray(destinations) || !destinations.length) throw new Error('Select at least one destination BOQ item.')
  const targetKeys = new Set()
  for (const target of destinations) {
    const key = `${target.sheetId}\u0000${normalizeBoqCode(target.boqCode)}`
    if (targetKeys.has(key)) throw new Error(`Destination ${target.boqCode} is selected more than once.`)
    targetKeys.add(key)
  }
  const { rates: currentRates, issues } = resolveCurrentAssemblyRates(assembly, sheets)
  if (rateMode === 'current' && issues.length) {
    throw new Error(`Resolve current rates or choose saved assembly rates: ${issues.map((item) => `${item.resource} (${item.reason})`).join(', ')}.`)
  }
  const working = new Map()
  for (const target of destinations) {
    const sheet = sheets.find((item) => item.id === target.sheetId)
    if (!sheet) throw new Error('A selected destination sheet is no longer available.')
    const current = working.get(sheet.id) ?? { ...sheet, data: structuredClone(sheet.data) }
    current.data = applyAssemblyToSheet({ sheet: current, assembly, destinationCode: target.boqCode, mode, cqbiMode, rateMode, currentRates, createRowId })
    working.set(sheet.id, current)
  }
  const changes = [...working.values()].map((sheet) => ({ sheetId: sheet.id, data: sheet.data }))
  for (const change of changes) {
    const errors = validateWorksheet(change.data)
    if (errors.length) throw new Error(`${sheets.find((sheet) => sheet.id === change.sheetId)?.name ?? 'Worksheet'}: ${errors[0]}`)
  }
  return changes
}
