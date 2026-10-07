import { useMemo, useState } from 'react'
import { ArrowRight, Boxes, Search } from 'lucide-react'
import { ConfirmDialog, Modal } from '../../components/Modal.jsx'
import { createAssemblySnapshot, planAssemblyApplication, resolveCurrentAssemblyRates } from '../../domain/assemblies.js'
import { normalizeBoqCode } from '../../domain/normalization.js'
import { getInheritedBoqQuantity, getInheritedCqbi } from '../../domain/resourceCopy.js'
import { ROW_LIMIT } from '../../domain/constants.js'
import { notify } from '../../stores/uiStore.js'

export function AssemblyDialog({ project, sheets, assemblies, source, onSave, onRename, onDelete, onApply, onClose }) {
  const [view, setView] = useState(source ? 'save' : 'library')
  const [name, setName] = useState('')
  const [assemblyId, setAssemblyId] = useState('')
  const [search, setSearch] = useState('')
  const [destinationSearch, setDestinationSearch] = useState('')
  const [targets, setTargets] = useState([])
  const [mode, setMode] = useState('')
  const [cqbiMode, setCqbiMode] = useState('')
  const [rateMode, setRateMode] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const assembly = assemblies.find((item) => item.id === assemblyId)
  const sourceSheet = source && sheets.find((sheet) => sheet.id === source.sheetId)
  const sourceRows = sourceSheet?.data.rows.filter((row) => normalizeBoqCode(row.boqCode) === normalizeBoqCode(source?.boqCode)) ?? []
  const resourceRates = useMemo(() => assembly ? resolveCurrentAssemblyRates(assembly, sheets) : { rates: new Map(), issues: [] }, [assembly, sheets])
  const destinations = useMemo(() => sheets.flatMap((sheet) => {
    const codes = new Map()
    for (const row of sheet.data.rows) {
      const code = normalizeBoqCode(row.boqCode)
      if (code) codes.set(code, (codes.get(code) ?? 0) + 1)
    }
    return [...codes].map(([boqCode, rowCount]) => ({ sheetId: sheet.id, sheetName: sheet.name, boqCode, rowCount }))
  }).filter((target) => `${target.sheetName} ${target.boqCode}`.toLocaleLowerCase().includes(destinationSearch.trim().toLocaleLowerCase())), [sheets, destinationSearch])
  const selectedTargets = targets.map((key) => destinations.find((target) => targetKey(target) === key) ?? sheets.flatMap((sheet) => {
    const code = key.slice(key.indexOf('\u0000') + 1)
    return sheet.data.rows.some((row) => normalizeBoqCode(row.boqCode) === code) ? [{ sheetId: sheet.id, boqCode: code, sheetName: sheet.name, rowCount: sheet.data.rows.filter((row) => normalizeBoqCode(row.boqCode) === code).length }] : []
  }).find((target) => targetKey(target) === key)).filter(Boolean)
  const optionsChosen = Boolean(mode && cqbiMode && rateMode)
  const previewErrors = []
  if (assembly && selectedTargets.length) {
    if (rateMode === 'current' && resourceRates.issues.length) previewErrors.push(...resourceRates.issues.map((issue) => `${issue.resource}: ${issue.reason}`))
    const rowDeltas = new Map()
    for (const target of selectedTargets) {
      const sheet = sheets.find((item) => item.id === target.sheetId)
      if (!sheet) previewErrors.push(`${target.sheetName} / ${target.boqCode}: sheet unavailable`)
      else {
        if (mode) {
          const oldRows = sheet.data.rows.filter((row) => normalizeBoqCode(row.boqCode) === target.boqCode).length
          rowDeltas.set(sheet.id, (rowDeltas.get(sheet.id) ?? 0) + (mode === 'append' ? assembly.rows.length : assembly.rows.length - oldRows))
        }
      }
    }
    for (const [sheetId, delta] of rowDeltas) { const sheet = sheets.find((item) => item.id === sheetId); if (sheet.data.rows.length + delta > ROW_LIMIT) previewErrors.push(`${sheet.name}: worksheet row limit (${ROW_LIMIT.toLocaleString()}) would be exceeded`) }
  }
  const filteredAssemblies = assemblies.filter((item) => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))

  const saveAssembly = async (event) => {
    event.preventDefault()
    if (!sourceSheet) { notify('The source worksheet is no longer available.', 'error'); return }
    const latestRows = sourceSheet.data.rows.filter((row) => normalizeBoqCode(row.boqCode) === normalizeBoqCode(source.boqCode))
    try {
      const record = createAssemblySnapshot({ projectId: project.id, name, sourceSheetName: sourceSheet.name, sourceBoqCode: source.boqCode, sourceRows: latestRows })
      await onSave(record)
      notify(`Saved ${record.name} with ${record.rows.length} resource lines.`)
      onClose()
    } catch (error) { notify(error.message, 'error') }
  }
  const apply = () => {
    if (!assembly || !selectedTargets.length || !optionsChosen || previewErrors.length) return
    setBusy(true)
    try {
      const changes = planAssemblyApplication({ sheets, assembly, destinations: selectedTargets, mode, cqbiMode, rateMode })
      onApply(changes)
      notify(`Applied ${assembly.name} to ${selectedTargets.length} BOQ item${selectedTargets.length === 1 ? '' : 's'}.`)
      onClose()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy(false) }
  }
  const startRename = (item) => { setEditingId(item.id); setEditingName(item.name) }
  const saveRename = async (event) => {
    event.preventDefault()
    try { await onRename(editingId, editingName); setEditingId(null); notify('Assembly renamed.') }
    catch (error) { notify(error.message, 'error') }
  }
  const toggleTarget = (target) => {
    const key = targetKey(target)
    setTargets((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  if (view === 'save') return <Modal title="Save BOQ item as assembly" onClose={onClose}>
    <form onSubmit={saveAssembly}>
      <div className="modal-body assembly-save-body">
        <p><strong>{sourceSheet?.name ?? 'Unavailable sheet'} / {source?.boqCode}</strong></p>
        <p>{sourceRows.length} resource line{sourceRows.length === 1 ? '' : 's'} will be saved, including lines hidden by the current filter.</p>
        <label>Assembly name<input autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Standard glazed partition" /></label>
        <ol className="assembly-source-lines">{sourceRows.map((row) => <li key={row.id}>{row.resource || '(unnamed resource)'} <small>{row.unit} · CQBI {row.cqbi ?? 'blank'} · CR {row.cr ?? 'blank'} · Rate {row.rate ?? 'blank'} · BOQ Qty {row.boqQty ?? 'blank'}{row.override !== null ? ` · Override ${row.override}` : ''}{row.remark ? ` · ${row.remark}` : ''}</small></li>)}</ol>
      </div>
      <footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save assembly</button></footer>
    </form>
  </Modal>

  if (view === 'manage') return <Modal title="Manage assemblies" onClose={onClose}>
    <div className="modal-body assembly-manage-body">
      <label>Search assemblies<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Assembly name" /></label>
      {!filteredAssemblies.length && <p>No assemblies found.</p>}
      {filteredAssemblies.map((item) => <article className="assembly-manage-item" key={item.id}>
        {editingId === item.id ? <form onSubmit={saveRename}><input aria-label="Assembly name" autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={100} /><button type="submit">Save</button><button type="button" onClick={() => setEditingId(null)}>Cancel</button></form> : <><div><strong>{item.name}</strong><small>{item.sourceSheetName} / {item.sourceBoqCode} · {item.rows.length} lines</small></div><div><button type="button" onClick={() => startRename(item)}>Rename</button><button type="button" onClick={() => setDeleteId(item.id)}>Delete</button></div></>}
      </article>)}
      <button type="button" className="secondary-button" onClick={() => setView('library')}>Back to assemblies</button>
    </div>
    {deleteId && <ConfirmDialog title="Delete assembly?" danger confirmLabel="Delete assembly" onClose={() => setDeleteId(null)} onConfirm={async () => { try { await onDelete(deleteId); if (assemblyId === deleteId) setAssemblyId(''); setDeleteId(null); notify('Assembly deleted.') } catch (error) { notify(error.message, 'error') } }}>This removes the saved assembly from this project. BOQ items already created from it are unchanged.</ConfirmDialog>}
  </Modal>

  return <Modal title="Project assemblies" onClose={onClose}>
    <div className="modal-body assembly-body">
      {!assembly ? <section className="assembly-library-view" aria-label="Project assembly library">
        <div className="assembly-library-heading"><span className="assembly-library-icon"><Boxes aria-hidden="true" /></span><div><p>PROJECT LIBRARY</p><h3>Choose an assembly</h3><small>Pick a saved resource set to apply across this project.</small></div><span className="assembly-library-count">{assemblies.length} saved</span></div>
        <div className="assembly-library-toolbar"><label className="assembly-search-field"><Search aria-hidden="true" /><input aria-label="Search assemblies" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by assembly name" /></label><button type="button" className="secondary-button" onClick={() => setView('manage')}>Manage</button></div>
        {filteredAssemblies.length ? <div className="assembly-library-list">{filteredAssemblies.map((item) => <button type="button" className="assembly-library-card" key={item.id} onClick={() => { setAssemblyId(item.id); setTargets([]); setMode(''); setCqbiMode(''); setRateMode('') }}><span className="assembly-library-card-mark"><Boxes aria-hidden="true" /></span><span className="assembly-library-card-copy"><strong>{item.name}</strong><small>{item.sourceSheetName} <i>/</i> {item.sourceBoqCode}</small></span><span className="assembly-library-card-count">{item.rows.length}<small>lines</small></span><ArrowRight className="assembly-library-arrow" aria-hidden="true" /></button>)}</div> : assemblies.length ? <div className="assembly-library-empty"><Search aria-hidden="true" /><strong>No matching assemblies</strong><span>Try another name or clear the search.</span><button type="button" onClick={() => setSearch('')}>Clear search</button></div> : <div className="assembly-library-empty"><Boxes aria-hidden="true" /><strong>Your assembly library is empty</strong><span>Save a BOQ item's resources from the worksheet to reuse them here.</span><button type="button" onClick={onClose}>Return to Cost Load</button></div>}
      </section> : <>
        <div className="assembly-selected-toolbar"><button type="button" className="assembly-back-button" onClick={() => { setAssemblyId(''); setTargets([]) }}>← All assemblies</button><div><strong>{assembly.name}</strong><small>{assembly.rows.length} resource lines · Saved from {assembly.sourceSheetName} / {assembly.sourceBoqCode}</small></div><button type="button" className="secondary-button" onClick={() => setView('manage')}>Manage</button></div>
        <section className="assembly-summary-card">
          <p className="assembly-source-caption">ASSEMBLY CONTENTS</p>
          <div className="assembly-summary-title"><strong>{assembly.name}</strong><span>{assembly.rows.length} lines</span></div>
          <p className="assembly-source-caption">Saved from {assembly.sourceSheetName} / {assembly.sourceBoqCode}</p>
          <details className="assembly-resource-details"><summary>Inspect resource lines</summary><ol>{assembly.rows.map((row, index) => <li key={`${row.resource}-${row.unit}-${index}`}>{row.resource || '(unnamed resource)'} <small>{row.unit} · CQBI {row.cqbi ?? 'blank'} · CR {row.cr ?? 'blank'} · Rate {row.rate ?? 'blank'} · BOQ Qty {row.boqQty ?? 'blank'}{row.override !== null ? ` · Override ${row.override}` : ''}{row.remark ? ` · ${row.remark}` : ''}</small></li>)}</ol></details>
        </section>
        <section className="assembly-destination-panel">
          <div className="assembly-panel-heading"><div><h3>Destinations</h3><p>Select BOQ items from any sheet in this project.</p></div><span>{targets.length} selected</span></div>
          <label className="assembly-destination-search">Find by sheet or BOQ code<input value={destinationSearch} onChange={(event) => setDestinationSearch(event.target.value)} placeholder="Search destinations" /></label>
          <div className="assembly-destinations" role="group" aria-label="Destination BOQ items">{destinations.map((target) => <label className="assembly-destination" key={targetKey(target)}><input type="checkbox" checked={targets.includes(targetKey(target))} onChange={() => toggleTarget(target)} /><span className="assembly-destination-content"><span className="assembly-destination-sheet">{target.sheetName}</span><span className="assembly-destination-detail"><strong>{target.boqCode}</strong><small>{target.rowCount} resource lines</small></span></span></label>)}{!destinations.length && <p>No matching coded BOQ items.</p>}</div>
        </section>
        <fieldset className="assembly-options"><legend>Application options</legend>
          <fieldset className="assembly-option-group"><legend><span>01</span> Resources</legend>
            <label className="assembly-option-card"><input type="radio" name="assembly-mode" checked={mode === 'append'} onChange={() => setMode('append')} /><span className="assembly-option-copy"><strong>Append</strong><small>Add assembly lines; keep existing resources.</small></span></label>
            <label className="assembly-option-card"><input type="radio" name="assembly-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /><span className="assembly-option-copy"><strong>Replace</strong><small>Swap existing resources for assembly lines.</small></span></label>
          </fieldset>
          <fieldset className="assembly-option-group"><legend><span>02</span> CQBI</legend>
            <label className="assembly-option-card"><input type="radio" name="assembly-cqbi" checked={cqbiMode === 'assembly'} onChange={() => setCqbiMode('assembly')} /><span className="assembly-option-copy"><strong>Assembly values</strong><small>Use the saved CQBI values.</small></span></label>
            <label className="assembly-option-card"><input type="radio" name="assembly-cqbi" checked={cqbiMode === 'destination'} onChange={() => setCqbiMode('destination')} /><span className="assembly-option-copy"><strong>Preserve destination</strong><small>Keep each BOQ item's current CQBI.</small></span></label>
          </fieldset>
          <fieldset className="assembly-option-group"><legend><span>03</span> Rates</legend>
            <label className="assembly-option-card"><input type="radio" name="assembly-rate" checked={rateMode === 'assembly'} onChange={() => setRateMode('assembly')} /><span className="assembly-option-copy"><strong>Saved rates</strong><small>Use rates captured in this assembly.</small></span></label>
            <label className="assembly-option-card"><input type="radio" name="assembly-rate" checked={rateMode === 'current'} onChange={() => setRateMode('current')} /><span className="assembly-option-copy"><strong>Current project rates</strong><small>Use a rate only when all matching rows have the same value. Multiple rates must be resolved or use saved rates.</small></span></label>
          </fieldset>
        </fieldset>
        {selectedTargets.length > 0 && <section className="assembly-preview">
          <div className="assembly-panel-heading"><div><h3>Review changes</h3><p>Each selected item is listed separately by sheet and code.</p></div><span>{selectedTargets.length} items</span></div>
          {!optionsChosen && <p className="assembly-preview-hint">Choose one option in each group to complete the preview.</p>}
          {optionsChosen && selectedTargets.map((target) => {
            const sheet = sheets.find((item) => item.id === target.sheetId)
            const targetRows = sheet?.data.rows.filter((row) => normalizeBoqCode(row.boqCode) === target.boqCode) ?? []
            const qty = getInheritedBoqQuantity(targetRows)
            const cqbi = cqbiMode === 'destination' ? getInheritedCqbi(targetRows) : null
            return <article className="assembly-preview-row" key={targetKey(target)}><strong>{target.sheetName} <span>{target.boqCode}</span></strong><span>{targetRows.length} → {mode === 'append' ? targetRows.length + assembly.rows.length : assembly.rows.length} lines</span><span>Qty {qty ?? 'blank'}</span><span>CQBI {cqbiMode === 'destination' ? cqbi ?? 'blank' : 'assembly'}</span><span>{rateMode === 'current' ? 'Current rates' : 'Saved rates'}</span></article>
          })}
          {previewErrors.length > 0 && <ul className="assembly-errors">{previewErrors.map((error) => <li key={error}>{error}</li>)}</ul>}
        </section>}
      </>}
    </div>
    <footer className="modal-actions assembly-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button>{assembly ? <button type="button" className="primary-button" disabled={busy || !selectedTargets.length || !optionsChosen || previewErrors.length > 0} onClick={apply}>{busy ? 'Applying…' : 'Apply assembly'}</button> : <button type="button" className="primary-button" disabled>Choose an assembly</button>}</footer>
  </Modal>
}

function targetKey(target) { return `${target.sheetId}\u0000${target.boqCode}` }
