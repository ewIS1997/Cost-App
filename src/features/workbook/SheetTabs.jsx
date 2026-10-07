import { useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { ConfirmDialog, Modal } from '../../components/Modal.jsx'
import { useWorkspaceStore } from '../../stores/workspaceStore.js'
import { notify } from '../../stores/uiStore.js'

const nextCopyName = (name) => `${name} Copy`
const firstAvailableSheetName = (sheets) => {
  for (let number = 1; number <= 100; number += 1) if (!sheets.some((sheet) => sheet.name.toLocaleLowerCase() === `sheet ${number}`)) return `Sheet ${number}`
  return 'New sheet'
}
const availableCopyName = (sheets, name) => {
  const base = nextCopyName(name); let candidate = base; let number = 2
  while (sheets.some((sheet) => sheet.name.toLocaleLowerCase() === candidate.toLocaleLowerCase())) { candidate = `${base} ${number}`; number += 1 }
  return candidate
}

export function SheetTabs() {
  const { sheets, activeSheetId, activateSheet, addSheet, renameSheet, duplicateSheet, deleteSheet } = useWorkspaceStore()
  const [dialog, setDialog] = useState(null); const tabsRef = useRef([])
  const run = async (operation) => { try { await operation(); setDialog(null) } catch (error) { notify(error.message, 'error') } }
  const moveFocus = (event, index) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: sheets.length - 1 - index }
    if (!(event.key in keys)) return
    event.preventDefault(); const next = Math.max(0, Math.min(sheets.length - 1, index + keys[event.key])); tabsRef.current[next]?.focus()
  }
  const activeSheet = sheets.find((sheet) => sheet.id === activeSheetId)
  return <div className="sheet-tabs-wrap"><div className="sheet-tabs" role="tablist" aria-label="Worksheets">
    {sheets.map((sheet, index) => <button key={sheet.id} ref={(node) => { tabsRef.current[index] = node }} role="tab" aria-selected={sheet.id === activeSheetId} tabIndex={sheet.id === activeSheetId ? 0 : -1} onKeyDown={(event) => moveFocus(event, index)} onClick={() => run(() => activateSheet(sheet.id))} onDoubleClick={() => setDialog({ type: 'rename', sheet })} onContextMenu={(event) => { event.preventDefault(); setDialog({ type: 'menu', sheet }) }}>{sheet.name}</button>)}
    <button type="button" className="add-sheet" onClick={() => setDialog({ type: 'add', initialName: firstAvailableSheetName(sheets) })} aria-label="Add sheet">+</button>
  </div>
  {activeSheet && <button type="button" className="sheet-actions-trigger" aria-label={`Actions for ${activeSheet.name}`} title={`Actions for ${activeSheet.name}`} onClick={() => setDialog({ type: 'menu', sheet: activeSheet })}><MoreHorizontal aria-hidden="true" /></button>}
  {dialog?.type === 'menu' && <Modal title={dialog.sheet.name} onClose={() => setDialog(null)}><div className="menu-actions"><button type="button" onClick={() => setDialog({ type: 'rename', sheet: dialog.sheet })}>Rename sheet</button><button type="button" onClick={() => setDialog({ type: 'duplicate', sheet: dialog.sheet })}>Duplicate sheet</button><button type="button" disabled={sheets.length === 1} onClick={() => setDialog({ type: 'delete', sheet: dialog.sheet })}>Delete sheet</button></div></Modal>}
  {(dialog?.type === 'add' || dialog?.type === 'rename' || dialog?.type === 'duplicate') && <SheetNameDialog dialog={dialog} sheets={sheets} onClose={() => setDialog(null)} onSubmit={(name) => run(() => dialog.type === 'add' ? addSheet(name) : dialog.type === 'rename' ? renameSheet(dialog.sheet.id, name) : duplicateSheet(dialog.sheet.id, name))} />}
  {dialog?.type === 'delete' && <ConfirmDialog title="Delete sheet" confirmLabel="Delete" danger onClose={() => setDialog(null)} onConfirm={() => run(() => deleteSheet(dialog.sheet.id))}>Delete <strong>{dialog.sheet.name}</strong>? This cannot be undone.</ConfirmDialog>}
  </div>
}

function SheetNameDialog({ dialog, sheets, onClose, onSubmit }) {
  const [name, setName] = useState(dialog.type === 'duplicate' ? availableCopyName(sheets, dialog.sheet.name) : dialog.sheet?.name ?? dialog.initialName)
  return <Modal title={dialog.type === 'add' ? 'Add sheet' : `${dialog.type === 'rename' ? 'Rename' : 'Duplicate'} sheet`} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); onSubmit(name) }}><div className="modal-body"><label>Sheet name<input name="sheetName" autoFocus value={name} maxLength="60" onChange={(event) => setName(event.target.value)} /></label></div><footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save</button></footer></form></Modal>
}
