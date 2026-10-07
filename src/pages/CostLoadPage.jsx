import { useRef, useState } from 'react'
import { Boxes, CircleHelp, Eye, EyeOff, ImagePlus, ListPlus, Plus, Redo2, Search, Undo2 } from 'lucide-react'
import { Modal } from '../components/Modal.jsx'
import { CostGrid } from '../features/cost-grid/CostGrid.jsx'
import { ExcelExchangeControls } from '../features/import-export/ExcelExchangeControls.jsx'
import { SheetTabs } from '../features/workbook/SheetTabs.jsx'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { formatNumber, getRowDerivedValues } from '../domain/calculations.js'
import { ROW_LIMIT } from '../domain/constants.js'
import { normalizeBoqCode } from '../domain/normalization.js'
import { projectVisibleRowIds } from '../domain/projection.js'
import { useUiStore } from '../stores/uiStore.js'
import { AssemblyDialog } from '../features/assemblies/AssemblyDialog.jsx'

export function CostLoadPage() {
  const gridActions = useRef(null)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [selectionSummary, setSelectionSummary] = useState(null)
  const [assembliesOpen, setAssembliesOpen] = useState(false)
  const [assemblySource, setAssemblySource] = useState(null)
  const [showImages, setShowImages] = useState(() => { try { return localStorage.getItem('boq-cost-load-show-images') !== 'false' } catch { return true } })
  const preferences=useUiStore((state)=>state.preferences)
  const { project, sheets, assemblies, activeSheetId, saveStatus, undoSheet, redoSheet, mutateSheet } = useWorkspaceStore()
  const sheet = sheets.find((item) => item.id === activeSheetId)
  if (!project || !sheet) return <div className="placeholder-panel">Loading workspace…</div>
  const remarkVisible = !sheet.data.hiddenColumnKeys.includes('remark')
  const rows = sheet.data.rows
  const visibleIds = projectVisibleRowIds(rows, sheet.data.filters, sheet.data.sort)
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const visibleRows = visibleIds.map((id) => rowsById.get(id)).filter(Boolean)
  const total = visibleRows.reduce((sum, row) => sum + (getRowDerivedValues(row).totalCost ?? 0), 0)
  const usedCost = visibleRows.reduce((sum, row) => sum + (getRowDerivedValues(row).usedCost ?? 0), 0)
  const boqItemCount = new Set(visibleRows.map((row) => normalizeBoqCode(row.boqCode)).filter(Boolean)).size
  const toggleRemark = () => mutateSheet(sheet.id, (draft) => {
    draft.hiddenColumnKeys = remarkVisible
      ? [...draft.hiddenColumnKeys, 'remark']
      : draft.hiddenColumnKeys.filter((key) => key !== 'remark')
  })
  return <div className="cost-workspace">
    <div className="cost-toolbar" role="toolbar" aria-label="Worksheet tools">
      <div className="toolbar-group" aria-label="History">
        <button type="button" className="tool-button" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={() => undoSheet(sheet.id)}><Undo2 /><span>Undo</span></button>
        <button type="button" className="tool-button" aria-label="Redo" title="Redo (Ctrl+Y)" onClick={() => redoSheet(sheet.id)}><Redo2 /><span>Redo</span></button>
      </div>
      <span className="toolbar-divider" />
      <div className="toolbar-group" aria-label="Rows">
        <button type="button" className="tool-button" disabled={rows.length >= ROW_LIMIT} onClick={() => gridActions.current?.addRow()} title="Append a blank row"><Plus /><span>Add row</span></button>
        <button type="button" className="tool-button" disabled={rows.length >= ROW_LIMIT} onClick={() => gridActions.current?.insertBelow()} title="Insert a blank row below the active row"><ListPlus /><span>Insert below</span></button>
      </div>
      <span className="toolbar-divider" />
      <div className="toolbar-group" aria-label="Worksheet display">
        <button type="button" className="tool-button" aria-pressed={remarkVisible} onClick={toggleRemark}>{remarkVisible ? <EyeOff /> : <Eye />}<span>{remarkVisible ? 'Hide Remark' : 'Show Remark'}</span></button>
        <button type="button" className="tool-button" aria-pressed={showImages} onClick={() => setShowImages((current) => { const next=!current; try { localStorage.setItem('boq-cost-load-show-images',String(next)) } catch { /* Continue with the in-memory display preference. */ } return next })}><Eye /><span>{showImages ? 'Hide Images' : 'Show Images'}</span></button>
        <button type="button" className="tool-button" onClick={() => gridActions.current?.addImage()} title="Attach an image to the selected BQ item"><ImagePlus /><span>Add Image</span></button>
      </div>
      <span className="toolbar-divider" />
      <ExcelExchangeControls compact projectName={project.name} sheet={sheet} />
      <span className="toolbar-divider" />
        <div className="toolbar-group" aria-label="Worksheet search">
          <button type="button" className="tool-button" onClick={() => gridActions.current?.openFind()} title="Find and replace (Ctrl+F)"><Search /><span>Find</span></button>
        </div>
        <button type="button" className="tool-button" onClick={() => setAssembliesOpen(true)} title="Save and apply project resource assemblies"><Boxes /><span>Assemblies</span></button>
       <button type="button" className="tool-button toolbar-help-button" aria-label="Worksheet keyboard shortcuts" title="Worksheet keyboard shortcuts" onClick={() => setShortcutHelpOpen(true)}><CircleHelp aria-hidden="true" /><span>Shortcuts</span></button>
    </div>

    <div className="workbook-panel">
      <div className="workbook-tab-strip">
        <div className="workbook-identity" title={project.name}>
          <span>ESTIMATE</span>
          <strong>{project.name}</strong>
        </div>
        <SheetTabs />
      </div>
       <CostGrid key={sheet.id} sheet={sheet} showHistoryControls={false} actionsRef={gridActions} onSelectionSummary={setSelectionSummary} onRequestSaveAssembly={setAssemblySource} showImages={showImages} />
      <footer className="workbook-status" aria-label="Worksheet status and totals">
        <span className={`status-live${saveStatus === 'Save failed' ? ' is-error' : ''}`} role="status" aria-live="polite"><i /> {saveStatus}</span>
        <span className="workbook-status-metric"><small>{visibleRows.length === rows.length ? 'Rows' : 'Rows shown'}</small><strong>{visibleRows.length === rows.length ? visibleRows.length.toLocaleString() : `${visibleRows.length.toLocaleString()} / ${rows.length.toLocaleString()}`}</strong></span>
        <span className="workbook-status-metric"><small>BOQ items</small><strong>{boqItemCount.toLocaleString()}</strong></span>
        <span className="workbook-status-metric status-used-cost"><small title="Sum of each visible row’s Used Cost, before multiplying by BOQ quantity">Used cost sum</small><strong>{formatNumber(usedCost,{decimals:preferences?.costDecimals,useGrouping:preferences?.useGrouping}) || '—'}{preferences?.currencyLabel?` ${preferences.currencyLabel}`:''}</strong></span>
        {selectionSummary?.kind === 'rows' && <span className="workbook-selection-summary" aria-live="polite"><strong>{selectionSummary.rowCount.toLocaleString()} rows selected</strong></span>}
        {selectionSummary?.kind === 'cells' && <span className="workbook-selection-summary" aria-live="polite">
          <span><small>Count</small><strong>{selectionSummary.count.toLocaleString()}</strong></span>
          {selectionSummary.numericCount > 0 && <>
            <span><small>Sum</small><strong>{formatNumber(selectionSummary.sum,{decimals:preferences?.costDecimals,useGrouping:preferences?.useGrouping})}</strong></span>
            <span><small>Average</small><strong>{formatNumber(selectionSummary.average,{decimals:preferences?.costDecimals,useGrouping:preferences?.useGrouping})}</strong></span>
          </>}
        </span>}
        <span className="workbook-status-metric status-total"><small>Total estimate</small><strong>{formatNumber(total,{decimals:preferences?.costDecimals,useGrouping:preferences?.useGrouping}) || '—'}{preferences?.currencyLabel?` ${preferences.currencyLabel}`:''}</strong></span>
      </footer>
    </div>
    {shortcutHelpOpen && <Modal title="Worksheet shortcuts" onClose={() => setShortcutHelpOpen(false)}>
      <div className="modal-body worksheet-shortcut-help">
        <p>Select worksheet cells, then press <kbd>Ctrl/Cmd</kbd> + <kbd>C</kbd> to copy or <kbd>Ctrl/Cmd</kbd> + <kbd>V</kbd> to paste.</p>
        <p><kbd>Ctrl</kbd> + <kbd>F</kbd> Find · <kbd>Ctrl</kbd> + <kbd>H</kbd> Find &amp; replace</p>
        <p>Hover a coded BOQ row number: press <kbd>CC</kbd> to copy its resources; hover a different BOQ row number and press <kbd>VV</kbd> to replace its resources or <kbd>PP</kbd> to replace them while preserving the destination CQBI. Type each pair within half a second.</p>
        <p>Right-click a coded BOQ row (or press <kbd>Shift + F10</kbd> on its row number) to save its resources as a project assembly. Use <strong>Assemblies</strong> to apply it across sheets.</p>
        <p>In a numeric cell, enter a calculation such as <code>.5*50</code> and press Enter to display <strong>25</strong>. The original expression remains available in the formula bar and when you edit the cell. While editing, an arrow key commits and moves to the adjacent cell; use <kbd>Ctrl/Cmd</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd> to navigate suggestions.</p>
        <p>Select any cell in a coded BQ item and press <kbd>Ctrl/Cmd</kbd> + <kbd>V</kbd> with an image on the clipboard, or choose <strong>Add Image</strong>. Images appear below the item’s last visible resource row; use <strong>Show Images</strong> / <strong>Hide Images</strong> to control the galleries.</p>
      </div>
    </Modal>}
    {(assembliesOpen || assemblySource) && <AssemblyDialog
      project={project}
      sheets={sheets}
      assemblies={assemblies ?? []}
      source={assemblySource}
      onSave={(record) => useWorkspaceStore.getState().saveAssembly(record)}
      onRename={(id, name) => useWorkspaceStore.getState().renameAssembly(id, name)}
      onDelete={(id) => useWorkspaceStore.getState().deleteAssembly(id)}
      onApply={(changes) => useWorkspaceStore.getState().applySheetGroup(changes)}
      onClose={() => { setAssembliesOpen(false); setAssemblySource(null) }}
    />}
  </div>
}
