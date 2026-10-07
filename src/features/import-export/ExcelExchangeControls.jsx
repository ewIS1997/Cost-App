import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Modal } from '../../components/Modal.jsx'
import { COLUMN_KEYS } from '../../domain/columns.js'
import { DEFAULT_FILTER } from '../../domain/constants.js'
import { validateWorksheet } from '../../domain/validation.js'
import { useWorkspaceStore } from '../../stores/workspaceStore.js'
import { notify } from '../../stores/uiStore.js'
import { exportCostLoadToExcel, parseCostLoadExcel } from './excelExchange.js'
import { listSheetAttachments } from '../../database/repositories.js'

export function ExcelExchangeControls({ projectName, sheet, compact = false }) {
  const fileInputRef = useRef(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [importing, setImporting] = useState(false)
  const mutateSheet = useWorkspaceStore((state) => state.mutateSheet)

  const exportExcel = async () => {
    try {
      await useWorkspaceStore.getState().guardNavigation()
      const latest = useWorkspaceStore.getState().sheets.find((item) => item.id === sheet.id)
      if (!latest) throw new Error('The active worksheet is no longer available.')
      const attachments=await listSheetAttachments(latest.id,{includeBlob:true})
      await exportCostLoadToExcel(projectName, latest, attachments)
      notify(`Exported ${latest.name} to Excel.`)
    } catch (reason) { notify(reason.message, 'error') }
  }

  const selectFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const parsed = await parseCostLoadExcel(file)
      const latest = useWorkspaceStore.getState().sheets.find((item) => item.id === sheet.id)
      if (!latest) throw new Error('The active worksheet is no longer available.')
      const candidate = { ...latest.data, rows: parsed.rows }
      const errors = validateWorksheet(candidate)
      if (errors.length) throw new Error(errors[0])
      const boqItemCount = new Set(parsed.rows.map((row) => row.boqCode).filter(Boolean)).size
      setPendingImport({ sheetId: sheet.id, fileName: file.name, parsed, rowCount: parsed.rows.length, boqItemCount })
    } catch (reason) { notify(reason.message, 'error') }
    finally { setImporting(false) }
  }

  const confirmImport = async () => {
    if (!pendingImport) return
    if (pendingImport.sheetId !== sheet.id) { setPendingImport(null); notify('The active worksheet changed. Choose the workbook again.', 'warning'); return }
    setImporting(true)
    try {
      await useWorkspaceStore.getState().guardNavigation()
      const latest = useWorkspaceStore.getState().sheets.find((item) => item.id === sheet.id)
      if (!latest) throw new Error('The active worksheet is no longer available.')
      const errors = validateWorksheet({ ...latest.data, rows: pendingImport.parsed.rows })
      if (errors.length) throw new Error(errors[0])
      mutateSheet(sheet.id, (draft) => {
        draft.rows = pendingImport.parsed.rows
        draft.filters = Object.fromEntries(COLUMN_KEYS.map((key) => [key, { ...DEFAULT_FILTER }]))
        draft.sort = null
      })
      notify(`Imported ${pendingImport.rowCount} row${pendingImport.rowCount === 1 ? '' : 's'} from ${pendingImport.fileName}.`)
      setPendingImport(null)
    } catch (reason) { notify(reason.message, 'error') }
    finally { setImporting(false) }
  }

  return <>
    <div className="excel-exchange-controls" role="group" aria-label="Excel exchange">
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".xlsx,.xls,.xlsm" aria-label="Choose Excel workbook to import" onChange={selectFile} />
      <button type="button" className="tool-button" onClick={exportExcel} title="Export the active worksheet to Excel"><Download /><span>{compact ? 'Export Excel' : 'Export to Excel'}</span></button>
      <button type="button" className="tool-button" onClick={() => fileInputRef.current?.click()} disabled={importing} title="Import an Excel workbook into the active worksheet"><Upload /><span>{importing ? 'Importing...' : compact ? 'Import Excel' : 'Import from Excel'}</span></button>
    </div>
    {pendingImport && <Modal title="Replace active worksheet?" onClose={() => setPendingImport(null)}>
      <div className="modal-body">
        <p><strong>{pendingImport.fileName}</strong> contains {pendingImport.rowCount} data row{pendingImport.rowCount === 1 ? '' : 's'} and {pendingImport.boqItemCount} BOQ item{pendingImport.boqItemCount === 1 ? '' : 's'}.</p>
        <p>Importing replaces the active worksheet rows. This import is a single undoable change.</p>
      </div>
      <footer className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPendingImport(null)}>Cancel</button><button type="button" className="primary-button" disabled={importing} onClick={confirmImport}>{importing ? 'Importing...' : 'Replace worksheet'}</button></footer>
    </Modal>}
  </>
}
