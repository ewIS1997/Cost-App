import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAssemblyToSheet, createAssemblySnapshot, planAssemblyApplication, resolveCurrentAssemblyRates } from './assemblies.js'
import { createBlankWorksheet } from './normalization.js'
import { validateAllProjectsBackup, validateAssemblies, validateBackupAttachments, validateProjectBackup } from './validation.js'
import { migrateBackup } from '../database/migrations.js'
import { createAppSettings, createProjectRecord, createSheetRecord } from './normalization.js'

const line = (resource, values = {}) => ({ resource, cqbi: 1, unit: 'm²', cr: 1, rate: 10, override: null, boqQty: 5, remark: '', ...values })
const row = (id, code, resource, values = {}) => ({ id, boqCode: code, ...line(resource, values) })
const sheet = (id, name, rows) => ({ id, projectId: 'p', name, position: 0, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', data: { ...createBlankWorksheet(), rows } })
const assembly = (rows = [line('Concrete')]) => ({ id: 'a', projectId: 'p', name: 'Standard', sourceSheetName: 'Source', sourceBoqCode: 'SRC', rows, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' })

test('assembly snapshot stores ordered editable resource values without worksheet IDs or BOQ codes', () => {
  const result = createAssemblySnapshot({ projectId: 'p', name: ' Standard ', sourceSheetName: 'Sheet 1', sourceBoqCode: ' a.01 ', sourceRows: [row('one', 'A.01', 'Labour'), row('two', 'A.01', 'Concrete')] , id: 'assembly' })
  assert.equal(result.name, 'Standard')
  assert.equal(result.sourceBoqCode, 'A.01')
  assert.deepEqual(result.rows.map((item) => item.resource), ['Labour', 'Concrete'])
  assert.equal('id' in result.rows[0], false)
  assert.equal('boqCode' in result.rows[0], false)
})

test('Replace substitutes item rows at the original position and preserves unrelated row order', () => {
  const destination = sheet('s1', 'Sheet A', [row('before', 'X', 'Before'), row('d1', 'B.01', 'Old 1'), row('middle', 'Y', 'Middle'), row('d2', 'B.01', 'Old 2'), row('after', 'Z', 'After')])
  const result = applyAssemblyToSheet({ sheet: destination, assembly: assembly([line('New 1'), line('New 2')]), destinationCode: 'B.01', mode: 'replace', createRowId: (() => { let id = 0; return () => `new-${++id}` })() })
  assert.deepEqual(result.rows.map((item) => item.resource), ['Before', 'New 1', 'New 2', 'Middle', 'After'])
  assert.deepEqual(result.rows.map((item) => item.id).slice(1, 3), ['new-1', 'new-2'])
})

test('Append retains target rows and appends assembly lines after the target item', () => {
  const destination = sheet('s1', 'Sheet A', [row('d1', 'B.01', 'Existing 1'), row('other', 'X', 'Unrelated'), row('d2', 'B.01', 'Existing 2')])
  const result = applyAssemblyToSheet({ sheet: destination, assembly: assembly([line('Added')]), destinationCode: 'B.01', mode: 'append', createRowId: () => 'new' })
  assert.deepEqual(result.rows.map((item) => item.resource), ['Existing 1', 'Unrelated', 'Existing 2', 'Added'])
})

test('application independently preserves each destination CQBI and BOQ quantity across sheets', () => {
  const source = assembly([line('Concrete', { cqbi: 2, boqQty: 20 })])
  const a = sheet('s1', 'Sheet A', [row('a', 'B.01', 'Old A', { cqbi: 7, boqQty: 100 })])
  const b = sheet('s2', 'Sheet B', [row('b', 'B.01', 'Old B', { cqbi: 9, boqQty: 200 })])
  const result = planAssemblyApplication({ sheets: [a, b], assembly: source, destinations: [{ sheetId: 's1', boqCode: 'B.01' }, { sheetId: 's2', boqCode: 'B.01' }], mode: 'replace', cqbiMode: 'destination', createRowId: (() => { let id = 0; return () => `new-${++id}` })() })
  assert.equal(result.length, 2)
  assert.deepEqual(result.map((change) => change.data.rows[0].cqbi), [7, 9])
  assert.deepEqual(result.map((change) => change.data.rows[0].boqQty), [100, 200])
  assert.notEqual(result[0].data.rows[0].id, result[1].data.rows[0].id)
})

test('same BOQ code on two sheets is treated as two different destinations', () => {
  const a = sheet('s1', 'Sheet A', [row('a', 'B.01', 'Old A')])
  const b = sheet('s2', 'Sheet B', [row('b', 'B.01', 'Old B')])
  const changes = planAssemblyApplication({ sheets: [a, b], assembly: assembly(), destinations: [{ sheetId: 's1', boqCode: 'B.01' }, { sheetId: 's2', boqCode: 'B.01' }], createRowId: (() => { let id = 0; return () => `r-${++id}` })() })
  assert.deepEqual(changes.map((change) => change.sheetId), ['s1', 's2'])
})

test('current project rates are applied only when each matching resource has one complete rate', () => {
  const source = assembly([line('Concrete'), line('Steel', { unit: 'kg', rate: 30 })])
  const ratesSheet = sheet('s1', 'Sheet A', [row('r1', 'B.01', 'Concrete', { rate: 15 }), row('r2', 'C.01', 'Steel', { unit: 'kg', rate: 40 })])
  const resolved = resolveCurrentAssemblyRates(source, [ratesSheet])
  assert.deepEqual(resolved.issues, [])
  const target = sheet('s2', 'Sheet B', [row('d1', 'D.01', 'Old')])
  const result = applyAssemblyToSheet({ sheet: target, assembly: source, destinationCode: 'D.01', rateMode: 'current', currentRates: resolved.rates, createRowId: (() => { let id = 0; return () => `r-${++id}` })() })
  assert.deepEqual(result.rows.map((item) => item.rate), [15, 40])
  const incomplete = sheet('s3', 'Sheet C', [row('r3', 'X', 'Concrete', { rate: null })])
  assert.equal(resolveCurrentAssemblyRates(source, [ratesSheet, incomplete]).issues.some((issue) => issue.resource === 'Concrete'), true)
})

test('an invalid later destination rejects the whole plan without mutating source sheets', () => {
  const a = sheet('s1', 'Sheet A', [row('a', 'B.01', 'Old A')])
  const b = sheet('s2', 'Sheet B', [row('b', 'X.01', 'Not destination')])
  assert.throws(() => planAssemblyApplication({ sheets: [a, b], assembly: assembly(), destinations: [{ sheetId: 's1', boqCode: 'B.01' }, { sheetId: 's2', boqCode: 'MISSING' }] }), /no longer available/)
  assert.deepEqual(a.data.rows.map((item) => item.resource), ['Old A'])
})

test('multiple or missing current rates block the entire multi-sheet application', () => {
  const source = assembly()
  const first = sheet('s1', 'Sheet A', [row('r1', 'X', 'Concrete', { rate: 10 })])
  const second = sheet('s2', 'Sheet B', [row('r2', 'Y', 'Concrete', { rate: 12 }), row('d2', 'B.01', 'Old')])
  assert.throws(() => planAssemblyApplication({ sheets: [first, second], assembly: source, destinations: [{ sheetId: 's1', boqCode: 'X' }, { sheetId: 's2', boqCode: 'B.01' }], rateMode: 'current' }), /multiple current rates/)
  assert.equal(second.data.rows[1].resource, 'Old')
})

test('row-limit validation rejects assembly application before producing any sheet changes', () => {
  const rows = Array.from({ length: 9999 }, (_, index) => row(`other-${index}`, 'OTHER', 'Existing'))
  rows.push(row('destination', 'B.01', 'Destination'))
  const full = sheet('s1', 'Full Sheet', rows)
  assert.throws(() => planAssemblyApplication({ sheets: [full], assembly: assembly(), destinations: [{ sheetId: 's1', boqCode: 'B.01' }], mode: 'append' }), /Worksheet must contain/)
  assert.equal(full.data.rows.length, 10000)
  assert.equal(full.data.rows.at(-1).resource, 'Destination')
})

test('legacy project backups migrate with an empty project assembly library', () => {
  const sheetRecord = createSheetRecord('p', 'Sheet 1', 0)
  const project = { ...createProjectRecord('Project', sheetRecord.id), id: 'p' }
  const migrated = migrateBackup({ backupType: 'boq-cost-load-project', schemaVersion: 1, exportedAt: new Date().toISOString(), project, sheets: [sheetRecord] })
  assert.deepEqual(migrated.assemblies, [])
})

test('workspace backups with schema 2 settings gain the Inter font default', () => {
  const sheetRecord = createSheetRecord('p', 'Sheet 1', 0)
  const project = { ...createProjectRecord('Project', sheetRecord.id), id: 'p' }
  const settings = { ...createAppSettings(), schemaVersion: 2 }
  delete settings.fontFamily
  const migrated = migrateBackup({ backupType: 'boq-cost-load-all-projects', schemaVersion: 1, exportedAt: new Date().toISOString(), projects: [project], sheets: [sheetRecord], assemblies: [], settings })
  assert.equal(migrated.settings.schemaVersion, 3)
  assert.equal(migrated.settings.fontFamily, 'inter')
  assert.deepEqual(validateAllProjectsBackup(migrated), [])
})

test('project and workspace backup validation accepts valid assemblies and rejects wrong ownership', () => {
  const sheetRecord = createSheetRecord('p', 'Sheet 1', 0)
  const project = { ...createProjectRecord('Project', sheetRecord.id), id: 'p' }
  const savedAssembly = assembly()
  const projectBackup = { backupType: 'boq-cost-load-project', schemaVersion: 1, exportedAt: new Date().toISOString(), project, sheets: [sheetRecord], assemblies: [savedAssembly] }
  assert.deepEqual(validateProjectBackup(projectBackup), [])
  assert.match(validateProjectBackup({ ...projectBackup, assemblies: [{ ...savedAssembly, projectId: 'other' }] }).join(' '), /different project/)
  const workspaceBackup = { backupType: 'boq-cost-load-all-projects', schemaVersion: 1, exportedAt: new Date().toISOString(), projects: [project], sheets: [sheetRecord], assemblies: [savedAssembly], settings: createAppSettings() }
  assert.deepEqual(validateAllProjectsBackup(workspaceBackup), [])
})

test('workspace restore validation rejects ambiguous project slugs before data is replaced', () => {
  const firstSheet = createSheetRecord('p', 'Sheet 1', 0)
  const secondSheet = createSheetRecord('p2', 'Sheet 1', 0)
  const first = { ...createProjectRecord('First', firstSheet.id), id: 'p', routeSlug: 'shared', routeAliases: [] }
  const second = { ...createProjectRecord('Second', secondSheet.id), id: 'p2', routeSlug: 'shared', routeAliases: [] }
  const backup = { backupType: 'boq-cost-load-all-projects', schemaVersion: 1, exportedAt: new Date().toISOString(), projects: [first, second], sheets: [firstSheet, secondSheet], assemblies: [], settings: createAppSettings() }
  assert.match(validateAllProjectsBackup(backup).join(' '), /route slug "shared" is used by multiple projects/)
  const idConflict = { ...backup, projects: [first, { ...second, routeSlug: 'p' }] }
  assert.match(validateAllProjectsBackup(idConflict).join(' '), /conflicts with a project ID/)
})

test('backup attachment validation requires a real project-sheet-item relationship and bounded image data', () => {
  const sheetRecord=createSheetRecord('p','Sheet 1',0)
  const project={...createProjectRecord('Project',sheetRecord.id),id:'p'}
  const attachment={id:'image',projectId:'p',sheetId:sheetRecord.id,boqCode:'CW-01',position:0,mimeType:'image/png',width:200,height:100,data:'AQID'}
  assert.deepEqual(validateBackupAttachments([attachment],[project],[sheetRecord]),[])
  assert.match(validateBackupAttachments([{...attachment,sheetId:'missing'}],[project],[sheetRecord]).join(' '),/missing or unrelated worksheet/)
  assert.match(validateBackupAttachments([{...attachment,data:''}],[project],[sheetRecord]).join(' '),/invalid or oversized image data/)
})

test('assemblies validate project ownership, unique names, resource shapes, and reject derived fields', () => {
  const valid = assembly()
  assert.deepEqual(validateAssemblies([valid], 'p'), [])
  assert.match(validateAssemblies([valid, { ...valid, id: 'b', name: ' standard ' }], 'p').join(' '), /duplicated/)
  assert.match(validateAssemblies([{ ...valid, projectId: 'other' }], 'p').join(' '), /different project/)
  assert.match(validateAssemblies([{ ...valid, rows: [{ ...valid.rows[0], id: 'bad', cost: 10 }] }], 'p').join(' '), /unsupported field/)
})
