import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpAZ, Check, Filter, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatNumber } from '../domain/calculations.js'
import { COLUMN_DEFINITIONS } from '../domain/columns.js'
import { COLUMN_WIDTH_MAX, COLUMN_WIDTH_MIN, DEFAULT_FILTER } from '../domain/constants.js'
import { parseNumeric } from '../domain/normalization.js'
import { summarizeProjectResources } from '../domain/projectResources.js'
import { projectVisibleRowIds } from '../domain/projection.js'
import { FilterMenu } from '../features/filtering/FilterMenu.jsx'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { projectRoutePath } from '../domain/projectRoutes.js'
import { notify, useUiStore } from '../stores/uiStore.js'

const resourceColumns = [
  { key: 'resource', label: 'Resource', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'resource') },
  { key: 'unit', label: 'Unit', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'unit') },
  { key: 'boqQty', label: 'Total Quantity', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'boqQty') },
  { key: 'rate', label: 'Rate', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'rate') },
  { key: 'resourceTotalCost', label: 'Total Cost', index: COLUMN_DEFINITIONS.length },
  { key: 'costPercentage', label: 'Cost %', index: COLUMN_DEFINITIONS.length + 1 },
  { key: 'remark', label: 'Status', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'remark') },
]
const defaultResourceWidths = [300, 95, 155, 140, 165, 105, 170]
const resourceWidthStorageKey = (projectId) => `project-resources-columns-v1:${projectId}`

export function ResourcesPage() {
  const project = useWorkspaceStore((state) => state.project)
  const sheets = useWorkspaceStore((state) => state.sheets)
  const setResourceRate = useWorkspaceStore((state) => state.setResourceRate)
  const preferences = useUiStore((state) => state.preferences)
  const [drafts, setDrafts] = useState({})
  const [errors, setErrors] = useState({})
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState({ col: resourceColumns[0].index, direction: 'asc' })
  const [openFilter, setOpenFilter] = useState(null)
  const [editingKey, setEditingKey] = useState(null)
  const [columnWidths, setColumnWidths] = useState(defaultResourceWidths)
  const resizeRef = useRef(null)
  const filterButtonRefs = useRef({})
  const resources = useMemo(() => summarizeProjectResources(sheets), [sheets])
  // Adapter rows are ephemeral: they map resource aggregates to worksheet filter keys.
  const resourceFilterRows = useMemo(() => resources.map((resource) => ({
    ...resource,
    id: resource.key,
    resource: resource.name,
    boqQty: resource.quantity,
    rate: resource.rateStatus === 'consistent' ? resource.rate : null,
    resourceTotalCost: resource.totalCost,
    costPercentage: resource.costPercentage,
    remark: resource.rateStatus === 'multiple' ? 'Multiple rates' : resource.incompleteQuantityLines ? 'Incomplete quantity' : resource.rateStatus === 'incomplete' || resource.rateStatus === 'missing' ? 'Missing rate' : 'Ready',
  })), [resources])
  const visibleResourceIds = useMemo(() => projectVisibleRowIds(resourceFilterRows, filters, sort), [resourceFilterRows, filters, sort])
  const resourceByKey = useMemo(() => new Map(resources.map((resource) => [resource.key, resource])), [resources])
  const filteredResources = visibleResourceIds.map((id) => resourceByKey.get(id)).filter(Boolean)

  useEffect(() => {
    if (!project?.id) return
    try {
      const saved = JSON.parse(window.localStorage.getItem(resourceWidthStorageKey(project.id)) || 'null')
      const migrated = Array.isArray(saved) && saved.length === 6
        ? [saved[0], saved[1], saved[2], saved[3], defaultResourceWidths[4], defaultResourceWidths[5], saved[4]]
        : saved
      setColumnWidths(Array.isArray(migrated) && migrated.length === defaultResourceWidths.length
        ? migrated.map((width, index) => Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, Number(width) || defaultResourceWidths[index])))
        : defaultResourceWidths)
    } catch { setColumnWidths(defaultResourceWidths) }
  }, [project?.id])

  useEffect(() => {
    const onMove = (event) => {
      const resize = resizeRef.current
      if (!resize || resize.pointerId !== event.pointerId) return
      const width = Math.round(Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, resize.startWidth + event.clientX - resize.startX)))
      setColumnWidths((current) => current[resize.index] === width ? current : current.map((value, index) => index === resize.index ? width : value))
    }
    const onUp = (event) => {
      if (!resizeRef.current || resizeRef.current.pointerId !== event.pointerId) return
      resizeRef.current = null
      setColumnWidths((current) => {
        try { if (project?.id) window.localStorage.setItem(resourceWidthStorageKey(project.id), JSON.stringify(current)) } catch { /* Storage may be unavailable; resizing still works for this visit. */ }
        return current
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [project?.id])

  const beginResize = (event, index) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = { pointerId: event.pointerId, index, startX: event.clientX, startWidth: columnWidths[index] }
  }
  const resizeByKeyboard = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const width = Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, columnWidths[index] + (event.key === 'ArrowRight' ? 10 : -10)))
    setColumnWidths((current) => current.map((value, item) => item === index ? width : value))
    try { if (project?.id) window.localStorage.setItem(resourceWidthStorageKey(project.id), JSON.stringify(columnWidths.map((value, item) => item === index ? width : value))) } catch { /* Storage may be unavailable; resizing still works for this visit. */ }
  }
  const resetColumnWidth = (index) => {
    const next = columnWidths.map((value, item) => item === index ? defaultResourceWidths[index] : value)
    setColumnWidths(next)
    try { if (project?.id) window.localStorage.setItem(resourceWidthStorageKey(project.id), JSON.stringify(next)) } catch { /* Storage may be unavailable; resizing still works for this visit. */ }
  }

  const shownNumber = (value, decimals = preferences?.quantityDecimals) => formatNumber(value, { decimals, useGrouping: preferences?.useGrouping }) || '—'
  const shownCost = (value) => {
    const formatted = shownNumber(value, preferences?.costDecimals)
    return formatted === '—' || !preferences?.currencyLabel ? formatted : `${formatted} ${preferences.currencyLabel}`
  }
  const rateText = (resource) => drafts[resource.key] ?? (resource.rateStatus === 'consistent' ? String(resource.rate) : '')
  const rateStatusText = (resource) => resource.rateStatus === 'multiple'
    ? `Multiple rates across ${resource.lineCount} matching rows: ${resource.rates.map(String).join(', ')}${resource.blankRateLines ? `; ${resource.blankRateLines} row${resource.blankRateLines === 1 ? '' : 's'} missing a rate` : ''}`
    : resource.rateStatus === 'missing' ? 'No rate entered'
      : resource.rateStatus === 'incomplete' ? `${resource.blankRateLines} line${resource.blankRateLines === 1 ? '' : 's'} missing a rate`
        : 'Shared rate'

  const updateRate = (resource) => {
    const text = rateText(resource)
    if (!String(text).trim()) {
      setErrors((current) => ({ ...current, [resource.key]: 'Enter a rate, or clear rates explicitly.' }))
      return
    }
    const parsed = parseNumeric(text)
    if (parsed.error) {
      setErrors((current) => ({ ...current, [resource.key]: parsed.error }))
      return
    }
    try {
      const currentResource = summarizeProjectResources(useWorkspaceStore.getState().sheets).find((item) => item.key === resource.key)
      const rowCount = currentResource?.lineCount ?? 0
      const sheetCount = new Set((currentResource?.references ?? []).map((reference) => reference.sheetId)).size
      setResourceRate(resource.key, parsed.value)
      setDrafts((current) => { const next = { ...current }; delete next[resource.key]; return next })
      setErrors((current) => { const next = { ...current }; delete next[resource.key]; return next })
      setEditingKey(null)
      notify(`Applied ${resource.name} rate to ${rowCount} matching row${rowCount === 1 ? '' : 's'} across ${sheetCount} worksheet${sheetCount === 1 ? '' : 's'}.`)
    } catch (error) { setErrors((current) => ({ ...current, [resource.key]: error.message })) }
  }

  const clearRate = (resource) => {
    try {
      const currentResource = summarizeProjectResources(useWorkspaceStore.getState().sheets).find((item) => item.key === resource.key)
      const rowCount = currentResource?.lineCount ?? 0
      const sheetCount = new Set((currentResource?.references ?? []).map((reference) => reference.sheetId)).size
      setResourceRate(resource.key, null)
      setDrafts((current) => { const next = { ...current }; delete next[resource.key]; return next })
      setErrors((current) => { const next = { ...current }; delete next[resource.key]; return next })
      setEditingKey(null)
      notify(`Cleared the rate for ${rowCount} matching row${rowCount === 1 ? '' : 's'} across ${sheetCount} worksheet${sheetCount === 1 ? '' : 's'}.`)
    } catch (error) { setErrors((current) => ({ ...current, [resource.key]: error.message })) }
  }

  if (!project) return <div className="placeholder-panel">Loading workspace...</div>
  const activeFilterCount = Object.values(filters).filter((filter) => filter && (filter.search || filter.condition || filter.selected !== null)).length
  const clearAllFilters = () => setFilters({})

  return <div className="page-wrap resources-page">
    <header className="page-heading resources-heading">
      <div><p className="eyebrow">PROJECT WORKSPACE</p><h1>Resources</h1><p className="subtitle">{project.name} · Aggregated from all Cost Load sheets.</p></div>
      <Link className="secondary-button" to={projectRoutePath(project)}>Open Cost Load</Link>
    </header>
    {!resources.length ? <section className="resources-empty"><h2>No resources yet</h2><p>Add named resources in Cost Load and they will appear here automatically.</p><Link className="primary-button" to={projectRoutePath(project)}>Go to Cost Load</Link></section>
      : <>
        <div className="resources-table-toolbar"><span>{filteredResources.length.toLocaleString()} <span className="resource-count-total">of {resources.length.toLocaleString()} resources</span></span>{activeFilterCount > 0 && <button type="button" onClick={clearAllFilters}>Clear all filters</button>}</div>
        {filteredResources.length === 0 ? <div className="resources-no-results">No matching resources. <button type="button" onClick={clearAllFilters}>Clear filters</button></div>
          : <div className="resources-table-scroll"><table className="resources-table" style={{ width: `${columnWidths.reduce((sum, width) => sum + width, 0)}px`, minWidth: `${columnWidths.reduce((sum, width) => sum + width, 0)}px` }}>
            <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width: `${width}px` }} />)}</colgroup>
            <thead><tr>{resourceColumns.map((column) => {
              const key = column.key
              const isFiltered = Boolean(filters[key] && (filters[key].search || filters[key].condition || filters[key].selected !== null))
              const sorted = sort?.col === column.index
              const sortIcon = sorted ? sort.direction === 'asc' ? <ArrowUpAZ aria-hidden="true" /> : <ArrowDownAZ aria-hidden="true" /> : <Filter aria-hidden="true" />
              return <th scope="col" key={key} className={isFiltered ? 'has-resource-filter' : ''}>
                <div className={`resource-header-content${['boqQty', 'rate', 'resourceTotalCost', 'costPercentage'].includes(key) ? ' is-numeric' : ''}`}>
                  <span>{column.label}</span>
                  <button type="button" className="resource-filter-button column-filter-trigger" ref={(node) => { filterButtonRefs.current[key] = node }} aria-label={`Filter ${column.label}${isFiltered ? ', filter active' : ''}`} aria-expanded={openFilter === key} title={`Filter ${column.label}`} onClick={() => setOpenFilter((current) => current === key ? null : key)}>{sortIcon}{isFiltered && <i />}</button>
                  <span className="resource-column-resize" role="separator" aria-label={`Resize ${column.label} column`} aria-orientation="vertical" aria-valuemin={COLUMN_WIDTH_MIN} aria-valuemax={COLUMN_WIDTH_MAX} aria-valuenow={columnWidths[resourceColumns.indexOf(column)]} tabIndex={0} onPointerDown={(event) => beginResize(event, resourceColumns.indexOf(column))} onKeyDown={(event) => resizeByKeyboard(event, resourceColumns.indexOf(column))} onDoubleClick={() => resetColumnWidth(resourceColumns.indexOf(column))} />
                </div>
              </th>
             })}</tr></thead>
            <tbody>{filteredResources.map((resource) => {
              const isEditing = editingKey === resource.key
              return <tr key={resource.key}>
                <td className="resource-name-cell" title={`${resource.lineCount} Cost Load lines`}>{resource.name}<small>{resource.lineCount}</small></td>
                <td>{resource.unit || <span className="resource-muted">—</span>}</td>
                <td className="resource-number-cell" title={resource.incompleteQuantityLines ? `${resource.incompleteQuantityLines} line(s) missing CQBI, CR, or BOQ Quantity` : 'All lines have quantity inputs'}>{shownNumber(resource.quantity)}{resource.incompleteQuantityLines > 0 && <span className="resource-inline-warning" aria-label={`${resource.incompleteQuantityLines} incomplete quantity lines`}>!</span>}</td>
               <td className="resource-number-cell">
                  {isEditing ? <div className="resource-rate-editor"><input autoFocus aria-label={`Project-wide unit rate for ${resource.name} ${resource.unit}`} inputMode="decimal" value={rateText(resource)} aria-invalid={Boolean(errors[resource.key])} onChange={(event) => { setDrafts((current) => ({ ...current, [resource.key]: event.target.value })); setErrors((current) => ({ ...current, [resource.key]: '' })) }} onKeyDown={(event) => { if (event.key === 'Enter') updateRate(resource); if (event.key === 'Escape') { setEditingKey(null); setErrors((current) => ({ ...current, [resource.key]: '' })) } }} /><button type="button" aria-label={`Apply rate to all ${resource.lineCount} matching rows`} title={`Apply rate to all ${resource.lineCount} matching rows`} onClick={() => updateRate(resource)}><Check /></button><button type="button" aria-label="Cancel rate edit" title="Cancel" onClick={() => { setEditingKey(null); setErrors((current) => ({ ...current, [resource.key]: '' })) }}><X /></button>{resource.rates.length > 0 && <button type="button" className="resource-editor-clear" aria-label={`Clear rate for all ${resource.lineCount} matching rows`} title={`Clear rate for all ${resource.lineCount} matching rows`} onClick={() => clearRate(resource)}>Clear all</button>}<small className="resource-rate-scope">Applies to all {resource.lineCount} matching rows across {new Set(resource.references.map((reference) => reference.sheetId)).size} worksheets (same resource and unit).</small>{errors[resource.key] && <span className="resource-error" role="alert">{errors[resource.key]}</span>}</div>
                     : <button type="button" className={`resource-rate-cell${resource.rateStatus === 'multiple' ? ' is-multiple' : ''}`} title={resource.rateStatus === 'multiple' ? `${rateStatusText(resource)}. Click to apply one rate to all matching rows.` : 'Click to apply a rate to all matching rows'} onClick={() => { setEditingKey(resource.key); setDrafts((current) => ({ ...current, [resource.key]: resource.rates.length === 1 ? String(resource.rates[0]) : '' })) }} onKeyDown={(event) => { if (event.key === 'Enter') { setEditingKey(resource.key); setDrafts((current) => ({ ...current, [resource.key]: resource.rates.length === 1 ? String(resource.rates[0]) : '' })) } }}>{resource.rateStatus === 'consistent' ? shownNumber(resource.rate, preferences?.costDecimals) : resource.rateStatus === 'multiple' ? <span className="resource-multiple-values">Multiple rates</span> : <span className="resource-muted">—</span>}</button>}
                </td>
                <td className="resource-number-cell resource-cost-cell" title={resource.incompleteCostLines ? `${resource.incompleteCostLines} line(s) missing a calculable total cost` : 'Total cost across all matching Cost Load lines'}>{shownCost(resource.totalCost)}{resource.incompleteCostLines > 0 && <span className="resource-inline-warning" aria-label={`${resource.incompleteCostLines} incomplete cost lines`}>!</span>}</td>
                <td className="resource-number-cell">{resource.costPercentage === null ? '—' : `${shownNumber(resource.costPercentage, 2)}%`}</td>
                <td className="resource-status-cell"><span className={`resource-status resource-status-${resource.rateStatus}`} title={rateStatusText(resource)}>{resource.rateStatus === 'multiple' ? 'Multiple rates' : resource.rateStatus === 'missing' ? 'No rate' : resource.rateStatus === 'incomplete' ? 'Partial rate' : 'Ready'}</span>{resource.rateStatus === 'multiple' && resource.blankRateLines > 0 && <span className="resource-status resource-status-warning" title={`${resource.blankRateLines} matching row(s) are missing a rate`}>{resource.blankRateLines} missing</span>}{resource.incompleteQuantityLines > 0 && <span className="resource-status resource-status-warning" title={`${resource.incompleteQuantityLines} quantity line(s) incomplete`}>Qty partial</span>}</td>
              </tr>
            })}</tbody>
          </table></div>}
      </>}
    {openFilter && <FilterMenu
      column={resourceColumns.find((column) => column.key === openFilter)}
       rows={resourceFilterRows}
      currentFilter={filters[openFilter] ?? { ...DEFAULT_FILTER }}
       sortDirection={sort?.key === openFilter || (sort?.key === undefined && sort?.col === resourceColumns.find((column) => column.key === openFilter)?.index) ? sort.direction : null}
      hasSort={Boolean(sort)}
      onApply={(next) => { setFilters((current) => ({ ...current, [openFilter]: next })); setOpenFilter(null) }}
      onClear={() => { setFilters((current) => ({ ...current, [openFilter]: { ...DEFAULT_FILTER } })); setOpenFilter(null) }}
       onSort={(direction) => { const column = resourceColumns.find((item) => item.key === openFilter); setSort(direction ? { col: column.index, ...(column.index >= COLUMN_DEFINITIONS.length ? { key: column.key } : {}), direction } : null); setOpenFilter(null) }}
      onClose={() => setOpenFilter(null)}
      triggerElement={filterButtonRefs.current[openFilter]}
    />}
  </div>
}
