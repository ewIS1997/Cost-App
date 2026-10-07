import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { createCostLoadWorkbook, parseCostLoadExcel } from './excelExchange.js'

const createRow = (boqCode, resource, values = {}) => ({
  id: `${boqCode}-${resource}`,
  boqCode,
  resource,
  cqbi: 1,
  unit: 'm²',
  cr: 2,
  rate: 10,
  override: null,
  boqQty: 3,
  remark: '',
  ...values,
})

const sourceSheet = {
  name: 'Level 1',
  data: {
    columnWidths: [128, 190, 100, 100, 90, 110, 120, 110, 125, 105, 145, 220],
    rows: [
      createRow(' A.01 ', 'Concrete', { cqbi: 0, rate: 0, boqQty: 0, remark: 'Zero values stay valid' }),
      createRow('a.01', 'Labour', { cqbi: 4, expressions: { cqbi: '2+2' } }),
      createRow('B.01', 'Steel', { override: 12.5 }),
      createRow('', 'Uncoded note'),
      createRow('A.01', 'Later item run'),
    ],
  },
}

function workbookFile(sheets) {
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  const result = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const buffer = result instanceof ArrayBuffer ? result : result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
  return { size: buffer.byteLength, arrayBuffer: async () => buffer }
}

test('exports styled BOQ groups, formulas, workbook controls, and a compatible import round trip', async () => {
  const workbook = await createCostLoadWorkbook('Sample project', sourceSheet, ExcelJS)
  const buffer = await workbook.xlsx.writeBuffer()
  const reloaded = new ExcelJS.Workbook()
  await reloaded.xlsx.load(buffer)

  const worksheet = reloaded.getWorksheet('BOQ Template')
  assert.ok(worksheet)
  assert.deepEqual(worksheet.getRow(1).values.slice(1), [
    'BOQ Code', 'Resource', 'CQBI', 'Unit', 'CR', 'Rate', 'Cost', 'Override', 'Used Cost', 'BOQ Qty', 'Total Cost', 'Remark',
  ])
  assert.equal(worksheet.getCell('A2').value, 'A.01')
  assert.equal(worksheet.getCell('C2').value, 0)
  assert.equal(worksheet.getCell('C3').value.formula, '2+2')
  assert.equal(worksheet.getCell('C3').value.result, 4)
  assert.equal(worksheet.getCell('F2').value, 0)
  assert.equal(worksheet.getCell('J2').value, 0)

  assert.equal(worksheet.getCell('G2').value.formula, 'IF(OR(C2="",E2="",F2=""),"",C2*E2*F2)')
  assert.equal(worksheet.getCell('I4').value.formula, 'IF(H4<>"",H4,G4)')
  assert.equal(worksheet.getCell('I4').value.result, 12.5)
  assert.equal(worksheet.getCell('K4').value.result, 37.5)

  assert.equal(worksheet.getCell('A1').fill.fgColor.argb, 'FF17324D')
  assert.equal(worksheet.getCell('A1').font.bold, true)
  assert.equal(worksheet.getCell('A2').fill.fgColor.argb, 'FFDCEBFA')
  assert.equal(worksheet.getCell('B2').fill.fgColor.argb, worksheet.getCell('B3').fill.fgColor.argb)
  assert.notEqual(worksheet.getCell('B3').fill.fgColor.argb, worksheet.getCell('B4').fill.fgColor.argb)
  assert.equal(worksheet.getCell('B5').fill.fgColor.argb, 'FFF5F6F7')
  assert.equal(worksheet.getCell('A6').border.top.style, 'medium')
  assert.equal(worksheet.getCell('G2').fill.fgColor.argb, 'FFEAF0F4')

  assert.equal(worksheet.autoFilter, 'A1:L6')
  assert.equal(worksheet.views[0].state, 'frozen')
  assert.equal(worksheet.views[0].ySplit, 1)
  assert.equal(worksheet.getColumn(2).width, Math.round(190 / 7))
  assert.ok(reloaded.getWorksheet('Instructions').getCell('A7').value.includes('alternating light row fills'))

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const parsed = await parseCostLoadExcel({ size: arrayBuffer.byteLength, arrayBuffer: async () => arrayBuffer })
  assert.equal(parsed.rows.length, sourceSheet.data.rows.length)
  assert.deepEqual(parsed.rows.map(({ boqCode, resource, cqbi, rate, override, boqQty, remark }) => ({ boqCode, resource, cqbi, rate, override, boqQty, remark })), [
    { boqCode: 'A.01', resource: 'Concrete', cqbi: 0, rate: 0, override: null, boqQty: 0, remark: 'Zero values stay valid' },
    { boqCode: 'A.01', resource: 'Labour', cqbi: 4, rate: 10, override: null, boqQty: 3, remark: '' },
    { boqCode: 'B.01', resource: 'Steel', cqbi: 1, rate: 10, override: 12.5, boqQty: 3, remark: '' },
    { boqCode: '', resource: 'Uncoded note', cqbi: 1, rate: 10, override: null, boqQty: 3, remark: '' },
    { boqCode: 'A.01', resource: 'Later item run', cqbi: 1, rate: 10, override: null, boqQty: 3, remark: '' },
  ])
})

test('Excel export serializes item images below their final resource row without overlap or shifted formulas', async () => {
  const rows=[createRow('CW-01','Frame'),createRow('CW-01','Glass'),createRow('CW-02','Fixings')]
  const sheet={name:'Facade',data:{...sourceSheet.data,rows}}
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTl8AAAAASUVORK5CYII=','base64')
  const attachments=[
    {id:'photo-1',boqCode:'CW-01',position:0,mimeType:'image/png',width:2000,height:100,blob:new Blob([png],{type:'image/png'})},
    {id:'photo-2',boqCode:'CW-01',position:1,mimeType:'image/png',width:2000,height:100,blob:new Blob([png],{type:'image/png'})},
  ]
  const workbook=await createCostLoadWorkbook('Facade project',sheet,ExcelJS,attachments)
  const buffer=await workbook.xlsx.writeBuffer()
  const reopened=new ExcelJS.Workbook()
  await reopened.xlsx.load(buffer)
  const worksheet=reopened.getWorksheet('BOQ Template')
  assert.equal(worksheet.rowCount,5)
  assert.equal(worksheet.getCell('A5').value,'CW-02')
  assert.equal(worksheet.getCell('G5').value.formula,'IF(OR(C5="",E5="",F5=""),"",C5*E5*F5)')
  assert.equal(worksheet.getImages().length,2)
  assert.equal(worksheet.getImages()[0].range.tl.nativeRow,3)
  assert.equal(worksheet.getImages()[1].range.tl.nativeRow,3)
  assert.ok(worksheet.getImages()[0].range.ext.width<=worksheet.columns.slice(0,6).reduce((sum,column)=>sum+(column.width??10)*7,0))
  assert.ok(worksheet.getImages()[1].range.tl.nativeCol>=6)
})

test('uses a valid worksheet when an empty BOQ Template tab exists', async () => {
  const parsed = await parseCostLoadExcel(workbookFile([
    ['BOQ Template', [['Notes'], ['No BOQ data']]],
    ['Estimate', [['BOQ Code', 'Resource', 'Rate'], ['A-1', 'Concrete', 25]]],
  ]))
  assert.equal(parsed.sourceSheetName, 'Estimate')
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].resource, 'Concrete')
})

test('prefers a valid BOQ Template and rejects a workbook with no supported sheet', async () => {
  const parsed = await parseCostLoadExcel(workbookFile([
    ['Other', [['BOQ Code', 'Resource'], ['B-1', 'Steel']]],
    ['BOQ Template', [['BOQ Code', 'Resource'], ['A-1', 'Concrete']]],
  ]))
  assert.equal(parsed.sourceSheetName, 'BOQ Template')
  await assert.rejects(parseCostLoadExcel(workbookFile([
    ['BOQ Template', [['Notes'], ['No BOQ data']]],
    ['Other', [['Description', 'Rate'], ['Steel', 25]]],
  ])), /supported BOQ Code header/)
})
