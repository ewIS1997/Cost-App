import test from 'node:test'
import assert from 'node:assert/strict'
import { isImageTargetCurrent, rekeyAttachmentRecords } from './imageAttachments.js'
import { encodeAttachmentForBackup, decodeAttachmentFromBackup } from './attachmentBackup.js'
import { transitionItemAttachments } from './imageAttachmentTransitions.js'

test('rekeys item attachments without changing worksheet identity or image order', () => {
  const records=[
    {id:'one',projectId:'p',sheetId:'s',boqCode:'CW-01',position:0},
    {id:'two',projectId:'p',sheetId:'s',boqCode:'CW-01',position:1},
  ]
  const moved=rekeyAttachmentRecords(records,[['CW-01','CW-02']])
  assert.deepEqual(moved.map(({boqCode,position,sheetId})=>({boqCode,position,sheetId})),[
    {boqCode:'CW-02',position:0,sheetId:'s'},
    {boqCode:'CW-02',position:1,sheetId:'s'},
  ])
})

test('merged BQ image ownership can be restored independently on undo and redo', () => {
  const attachments=[
    {id:'from-cw1',boqCode:'CW-02',originCode:'CW-01',itemRowIds:['a1','a2'],position:0,createdAt:'2026-01-01'},
    {id:'native-cw2',boqCode:'CW-02',originCode:'CW-02',itemRowIds:['b1'],position:1,createdAt:'2026-01-02'},
  ]
  const merged=[{id:'a1',boqCode:'CW-02'},{id:'a2',boqCode:'CW-02'},{id:'b1',boqCode:'CW-02'}]
  const partiallyUndone=[{id:'a1',boqCode:'CW-01'},{id:'a2',boqCode:'CW-02'},{id:'b1',boqCode:'CW-02'}]
  assert.deepEqual(transitionItemAttachments(attachments,merged,partiallyUndone),[])
  const undone=[{id:'a1',boqCode:'CW-01'},{id:'a2',boqCode:'CW-01'},{id:'b1',boqCode:'CW-02'}]
  const undoChanges=transitionItemAttachments(attachments,merged,undone)
  assert.deepEqual(undoChanges.map(({id,boqCode,position})=>({id,boqCode,position})),[{id:'from-cw1',boqCode:'CW-01',position:0},{id:'native-cw2',boqCode:'CW-02',position:0}])

  const undoState=attachments.map((item)=>undoChanges.find((change)=>change.id===item.id)??item)
  const redoChanges=transitionItemAttachments(undoState,undone,merged)
  assert.deepEqual(redoChanges.map(({id,boqCode,position})=>({id,boqCode,position})),[{id:'from-cw1',boqCode:'CW-02',position:1}])
})

test('a complete item rename moves its images; deleting all rows leaves them in place', () => {
  const rowsA=[{id:'r1',boqCode:'A-01'},{id:'r2',boqCode:'A-01'}]
  const rowsB=rowsA.map((row)=>({...row,boqCode:'B-01'}))
  const attachment={id:'img',boqCode:'A-01',originCode:'A-01',itemRowIds:['r1','r2'],position:0}
  const renamed=transitionItemAttachments([attachment],rowsA,rowsB)
  assert.equal(renamed[0].boqCode,'B-01')
  assert.deepEqual(transitionItemAttachments([attachment],rowsA,[]),[])
})

test('image backup encoding round-trips image bytes and metadata', async () => {
  const bytes=Uint8Array.from([0,1,2,127,128,255])
  const record={id:'img',projectId:'p',sheetId:'s',boqCode:'CW-01',position:0,mimeType:'image/png',width:2,height:3,blob:new Blob([bytes],{type:'image/png'})}
  const encoded=await encodeAttachmentForBackup(record)
  const restored=decodeAttachmentFromBackup(encoded)
  assert.equal(restored.id,record.id)
  assert.deepEqual([...new Uint8Array(await restored.blob.arrayBuffer())],[...bytes])
})

test('a delayed image operation rejects a deleted or renamed target row', () => {
  const rows=[{id:'row-1',boqCode:'CW-01'}]
  assert.equal(isImageTargetCurrent(rows,'row-1','cw-01'),true)
  assert.equal(isImageTargetCurrent([{id:'row-1',boqCode:'CW-02'}],'row-1','CW-01'),false)
  assert.equal(isImageTargetCurrent([],'row-1','CW-01'),false)
})
