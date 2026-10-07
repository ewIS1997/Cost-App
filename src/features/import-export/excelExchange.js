import * as XLSX from 'xlsx'
import { getRowDerivedValues } from '../../domain/calculations.js'
import { EXCEL_IMPORT_LIMIT } from '../../domain/constants.js'
import { createBlankRow, normalizeBoqCode, normalizeResourceText, normalizeText, parseNumeric } from '../../domain/normalization.js'

const HEADERS = [
  'BOQ Code', 'Resource', 'CQBI', 'Unit', 'CR', 'Rate', 'Cost', 'Override', 'Used Cost', 'BOQ Qty', 'Total Cost', 'Remark',
]

const HEADER_ALIASES = {
  boqCode: ['boqcode', 'boqitem', 'boqitemcode', 'itemcode'],
  resource: ['resource', 'resourcedescription', 'description'],
  cqbi: ['cqbi'],
  unit: ['unit', 'uom'],
  cr: ['cr'],
  rate: ['rate'],
  override: ['override', 'costoverride'],
  boqQty: ['boqqty', 'boqquantity', 'quantity'],
  remark: ['remark', 'remarks', 'note', 'notes'],
}

const normalizeHeader = (value) => String(value ?? '').trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
const isBlank = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

function safeFilePart(value) {
  // Control characters are explicitly stripped from downloaded filenames.
  // eslint-disable-next-line no-control-regex
  const clean = String(value ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80)
  return clean || 'Cost-Load'
}

const EXCEL_COLORS = {
  header: 'FF17324D',
  white: 'FFFFFFFF',
  itemFills: ['FFF1F6FB', 'FFFAF7EF'],
  itemCodeFills: ['FFDCEBFA', 'FFF2E9D8'],
  blankCode: 'FFF5F6F7',
  calculated: 'FFEAF0F4',
  border: 'FF9AAAB8',
  text: 'FF243447',
  mutedText: 'FF526477',
}

const HEADER_FONT = { name: 'Aptos', size: 10, bold: true, color: { argb: EXCEL_COLORS.white } }
const ITEM_TOP_BORDER = { style: 'medium', color: { argb: EXCEL_COLORS.border } }
const NUMBER_FORMAT = '#,##0.########;[Red]-#,##0.########;0'
const CALCULATED_NUMBER_FORMAT = '#,##0.00;[Red]-#,##0.00;0.00'
const INSTRUCTIONS = [
  'BOQ Cost Load Excel template',
  'Enter or edit data on the BOQ Template sheet, then import this workbook back into the application.',
  'BOQ Qty belongs to each resource row. Editing it changes only that row.',
  'Enter the same BOQ Qty on resource rows when they should use the same item quantity.',
  'A numeric zero is valid. Cost, Used Cost, and Total Cost are derived; edits to those formulas are ignored on import.',
  'Completely empty rows are ignored during import.',
  'BOQ items are grouped with alternating light row fills. A bold top border marks each new item; calculated columns are shaded.',
]

function excelFormula(formula, value) {
  return { formula, result: typeof value === 'number' && Number.isFinite(value) ? value : '' }
}

function excelInputValue(row, key) {
  const expression = row.expressions?.[key]
  return expression
    ? excelFormula(expression.trim().replace(/^=/, ''), row[key])
    : row[key]
}

function styleBoqRows(worksheet, rows, excelRowsById) {
  let groupCode = ''
  let groupIndex = -1

  rows.forEach((row) => {
    const excelRow = excelRowsById.get(row.id)
    const code = normalizeBoqCode(row.boqCode)
    const startsGroup = Boolean(code && code !== groupCode)

    if (startsGroup) {
      groupCode = code
      groupIndex += 1
    } else if (!code) {
      groupCode = ''
    }

    const tintIndex = groupIndex % EXCEL_COLORS.itemFills.length
    const blankCodeRow = !code
    const itemFill = blankCodeRow ? EXCEL_COLORS.blankCode : EXCEL_COLORS.itemFills[tintIndex]

    for (let column = 1; column <= HEADERS.length; column += 1) {
      const cell = worksheet.getCell(excelRow, column)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: [7, 9, 11].includes(column) ? EXCEL_COLORS.calculated : itemFill } }
      cell.font = { name: 'Aptos', size: 10, color: { argb: EXCEL_COLORS.text } }
      cell.alignment = { vertical: 'middle', horizontal: [3, 5, 6, 7, 8, 9, 10, 11].includes(column) ? 'right' : 'left', wrapText: [2, 12].includes(column) }
      if ([3, 5, 6, 8, 10].includes(column)) cell.numFmt = NUMBER_FORMAT
      if ([7, 9, 11].includes(column)) {
        cell.numFmt = CALCULATED_NUMBER_FORMAT
        cell.font = { name: 'Aptos', size: 10, color: { argb: EXCEL_COLORS.mutedText } }
      }
      if (startsGroup) cell.border = { top: ITEM_TOP_BORDER }
    }

    const codeCell = worksheet.getCell(excelRow, 1)
    if (code) {
      codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.itemCodeFills[tintIndex] } }
      codeCell.font = { name: 'Aptos', size: 10, bold: startsGroup, color: { argb: EXCEL_COLORS.text } }
    }

    worksheet.getRow(excelRow).height = 20
  })
}

export async function createCostLoadWorkbook(projectName, sheet, ExcelJSModule, attachments = []) {
  const imported = ExcelJSModule ?? await import('exceljs')
  const ExcelJS = imported.default ?? imported
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'BOQ Cost Load'
  workbook.subject = 'BOQ Cost Load'
  workbook.title = `${projectName} — ${sheet.name}`
  workbook.calcProperties = { calcMode: 'auto', fullCalcOnLoad: true, forceFullCalc: true }

  const worksheet = workbook.addWorksheet('BOQ Template', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  })
  worksheet.addRow(HEADERS)
  worksheet.getRow(1).height = 30
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } }
  worksheet.columns = HEADERS.map((header, index) => ({ header, width: Math.max(10, Math.round((sheet.data.columnWidths[index] ?? 105) / 7)) }))

  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_COLORS.header } }
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: EXCEL_COLORS.border } } }
  })

  const lastRowByCode = new Map()
  const attachmentsByCode = new Map()
  for(const [index,row] of sheet.data.rows.entries()){const code=normalizeBoqCode(row.boqCode);if(code)lastRowByCode.set(code,index)}
  for(const attachment of attachments){const code=normalizeBoqCode(attachment.boqCode);const group=attachmentsByCode.get(code)??[];group.push(attachment);attachmentsByCode.set(code,group)}
  const excelRowsById = new Map()
  const excelColumnWidths=worksheet.columns.map((column)=>(column.width??10)*7)
  const imageSlotWidths=[excelColumnWidths.slice(0,6).reduce((sum,width)=>sum+width,0)-18,excelColumnWidths.slice(6).reduce((sum,width)=>sum+width,0)-18].map((width)=>Math.max(120,width))
  for (const [index, row] of sheet.data.rows.entries()) {
    const excelRow = worksheet.rowCount + 1
    excelRowsById.set(row.id,excelRow)
    const { cost, usedCost, totalCost } = getRowDerivedValues(row)
    worksheet.addRow([
      normalizeBoqCode(row.boqCode), row.resource, excelInputValue(row, 'cqbi'), row.unit, excelInputValue(row, 'cr'), excelInputValue(row, 'rate'),
      excelFormula(`IF(OR(C${excelRow}="",E${excelRow}="",F${excelRow}=""),"",C${excelRow}*E${excelRow}*F${excelRow})`, cost),
      excelInputValue(row, 'override'),
      excelFormula(`IF(H${excelRow}<>"",H${excelRow},G${excelRow})`, usedCost),
      excelInputValue(row, 'boqQty'),
      excelFormula(`IF(OR(I${excelRow}="",J${excelRow}=""),"",I${excelRow}*J${excelRow})`, totalCost),
      row.remark,
    ])
    const code=normalizeBoqCode(row.boqCode)
    const itemImages=code&&lastRowByCode.get(code)===index?attachmentsByCode.get(code)??[]:[]
    for(let imageIndex=0;imageIndex<itemImages.length;imageIndex+=2){
      const galleryRow=worksheet.addRow([])
      galleryRow.height=96
      for(let slot=0;slot<2&&imageIndex+slot<itemImages.length;slot++){
        const attachment=itemImages[imageIndex+slot]
        if(!attachment.blob)throw new Error(`Image ${attachment.boqCode} is unavailable for Excel export.`)
        const bytes=new Uint8Array(await attachment.blob.arrayBuffer())
        const extension=attachment.mimeType==='image/png'?'png':'jpeg'
        const imageId=workbook.addImage({buffer:bytes,extension})
        const scale=Math.min(imageSlotWidths[slot]/attachment.width,120/attachment.height,1)
        const width=Math.max(1,Math.round(attachment.width*scale)),height=Math.max(1,Math.round(attachment.height*scale))
        worksheet.addImage(imageId,{tl:{col:slot===0?0:6,row:galleryRow.number-1},ext:{width,height},editAs:'oneCell'})
      }
    }
  }
  styleBoqRows(worksheet, sheet.data.rows, excelRowsById)
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, worksheet.rowCount), column: HEADERS.length } }

  const instructions = workbook.addWorksheet('Instructions')
  instructions.addRows(INSTRUCTIONS.map((text) => [text]))
  instructions.getColumn(1).width = 112
  instructions.getRow(1).height = 24
  instructions.getCell('A1').font = { name: 'Aptos', size: 14, bold: true, color: { argb: EXCEL_COLORS.header } }
  for (let row = 2; row <= INSTRUCTIONS.length; row += 1) {
    instructions.getCell(row, 1).alignment = { wrapText: true, vertical: 'top' }
    instructions.getRow(row).height = 24
  }

  return workbook
}

export async function exportCostLoadToExcel(projectName, sheet, attachments = []) {
  const workbook = await createCostLoadWorkbook(projectName, sheet, undefined, attachments)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFilePart(projectName)}-${safeFilePart(sheet.name)}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function indexHeaders(headers) {
  const normalized = headers.map(normalizeHeader)
  const indexes = {}
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex((header) => aliases.includes(header))
    if (index >= 0) indexes[key] = index
  }
  return indexes
}

function readText(row, index, field) {
  if (index === undefined || index < 0 || isBlank(row[index])) return ''
  const value = field === 'resource' ? normalizeResourceText(row[index]) : normalizeText(row[index])
  const parsed = field === 'boqCode' ? normalizeBoqCode(value) : value
  return parsed
}

function readNumber(row, index, label, excelRow) {
  if (index === undefined || index < 0) return null
  const parsed = parseNumeric(row[index])
  if (parsed.error) throw new Error(`Excel row ${excelRow}, ${label}: ${parsed.error}`)
  return parsed.value
}

export async function parseCostLoadExcel(file) {
  if (!file) throw new Error('Choose an Excel workbook to import.')
  if (file.size > EXCEL_IMPORT_LIMIT) throw new Error(`Excel workbooks must be ${Math.round(EXCEL_IMPORT_LIMIT / (1024 * 1024))} MB or smaller.`)
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  if (!workbook.SheetNames.length) throw new Error('The workbook does not contain a worksheet.')
  // Prefer the named template only when it contains a supported header. A blank
  // or unrelated tab with that name must not hide a valid worksheet elsewhere.
  const candidates = workbook.SheetNames.map((name) => {
    // Keep empty worksheet rows so array indexes continue to equal Excel row numbers.
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true, range: 0 })
    const headerRowIndex = matrix.findIndex((row) => indexHeaders(row).boqCode !== undefined)
    return { name, matrix, headerRowIndex, indexes: headerRowIndex >= 0 ? indexHeaders(matrix[headerRowIndex]) : null }
  })
  const validCandidates = candidates.filter((candidate) => candidate.indexes)
  const selected = validCandidates.find((candidate) => candidate.name.trim().toLocaleLowerCase() === 'boq template') ?? validCandidates[0]
  if (!selected) throw new Error('Could not find a supported BOQ Code header in any Excel worksheet.')
  const { name: sheetName, matrix, headerRowIndex, indexes } = selected

  const rows = []
  for (let sourceIndex = headerRowIndex + 1; sourceIndex < matrix.length; sourceIndex++) {
    const values = matrix[sourceIndex] ?? []
    const excelRow = sourceIndex + 1
    const code = readText(values, indexes.boqCode, 'boqCode')
    const resource = readText(values, indexes.resource, 'resource')
    const unit = readText(values, indexes.unit, 'unit')
    const remark = readText(values, indexes.remark, 'remark')
    const cqbi = readNumber(values, indexes.cqbi, 'CQBI', excelRow)
    const cr = readNumber(values, indexes.cr, 'CR', excelRow)
    const rate = readNumber(values, indexes.rate, 'Rate', excelRow)
    const override = readNumber(values, indexes.override, 'Override', excelRow)
    const boqQty = readNumber(values, indexes.boqQty, 'BOQ Qty', excelRow)
    const anyValue = Boolean(code || resource || unit || remark)
      || [cqbi, cr, rate, override, boqQty].some((value) => value !== null)
    if (!anyValue) continue

    const row = createBlankRow()
    row.boqCode = code
    row.resource = resource
    row.cqbi = cqbi
    row.unit = unit
    row.cr = cr
    row.rate = rate
    row.override = override
    row.boqQty = boqQty
    row.remark = remark
    rows.push(row)
  }
  return { rows, sourceSheetName: sheetName }
}
