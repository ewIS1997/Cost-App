import { useMemo, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpAZ, Filter } from 'lucide-react'
import { formatNumber, getRowDerivedValues } from '../domain/calculations.js'
import { COLUMN_DEFINITIONS } from '../domain/columns.js'
import { DEFAULT_FILTER } from '../domain/constants.js'
import { createProjectSummaryRows } from '../domain/reportRows.js'
import { projectVisibleRowIds } from '../domain/projection.js'
import { summarizeProject } from '../domain/projectSummary.js'
import { FilterMenu } from '../features/filtering/FilterMenu.jsx'
import { serializeClipboardMatrix } from '../features/cost-grid/clipboard.js'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { notify, useUiStore } from '../stores/uiStore.js'

const summaryColumns = [
  { key: 'resource', label: 'Sheet', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'resource') },
  { key: 'boqCode', label: 'BOQ Code', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'boqCode') },
  { key: 'boqQty', label: 'BOQ Qty', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'boqQty') },
  { key: 'rate', label: 'Unit Cost', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'rate') },
  { key: 'override', label: 'Total Cost', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'override') },
  { key: 'cr', label: '% of Project', index: COLUMN_DEFINITIONS.findIndex((column) => column.key === 'cr') },
]

export function ReportsPage() {
  const project = useWorkspaceStore((state) => state.project)
  const sheets = useWorkspaceStore((state) => state.sheets)
  const preferences = useUiStore((state) => state.preferences)
  const [report, setReport] = useState('summary')
  const [sheetId, setSheetId] = useState('all')
  const [summaryFilters, setSummaryFilters] = useState({})
  const [summarySort, setSummarySort] = useState({ col: summaryColumns[0].index, direction: 'asc' })
  const [openFilter, setOpenFilter] = useState(null)
  const [filterTrigger, setFilterTrigger] = useState(null)
  const [copying, setCopying] = useState(false)
  const filterButtonRefs = useRef({})
  const scopedSheets = useMemo(() => sheetId === 'all' ? sheets : sheets.filter((sheet) => sheet.id === sheetId), [sheets, sheetId])
  const projectSummary = useMemo(() => summarizeProject(sheets), [sheets])
  const summaryRows = useMemo(() => createProjectSummaryRows(sheets), [sheets])
  const scopedSummaryRows = useMemo(() => sheetId === 'all' ? summaryRows : summaryRows.filter((row) => row.sheetId === sheetId), [summaryRows, sheetId])
  // Transient report rows reuse worksheet column keys solely for filtering/sorting.
  const reportFilterRows = useMemo(() => scopedSummaryRows.map((row) => ({
    ...row,
    id: row.id,
    resource: row.sheet,
    boqQty: row.boqQty,
    rate: row.unitCost,
    override: row.totalCost,
    cr: row.percentage,
  })), [scopedSummaryRows])
  const visibleSummaryIds = useMemo(() => projectVisibleRowIds(reportFilterRows, summaryFilters, summarySort), [reportFilterRows, summaryFilters, summarySort])
  const filterRowById = useMemo(() => new Map(reportFilterRows.map((row) => [row.id, row])), [reportFilterRows])
  const visibleSummaryRows = visibleSummaryIds.map((id) => filterRowById.get(id)).filter(Boolean)

  if (!project) return <div className="placeholder-panel">Loading workspace...</div>
  const number = (value, decimals = preferences?.costDecimals) => formatNumber(value, { decimals, useGrouping: preferences?.useGrouping }) || '—'
  const money = (value) => value === null || value === undefined ? '—' : `${number(value)}${preferences?.currencyLabel ? ` ${preferences.currencyLabel}` : ''}`
  const rows = scopedSheets.flatMap((sheet) => sheet.data.rows.map((row) => ({ sheet: sheet.name, row, derived: getRowDerivedValues(row) })))
  const activeFilterCount = Object.values(summaryFilters).filter((filter) => filter && (filter.search || filter.condition || filter.selected !== null)).length
  const clearAllFilters = () => setSummaryFilters({})
  const copyTable = async () => {
    const copiedReport = report
    const copiedSheet = sheetId === 'all' ? 'All sheets' : sheets.find((sheet) => sheet.id === sheetId)?.name ?? 'Selected sheet'
    const headers = copiedReport === 'summary'
      ? ['Sheet', 'BOQ Code', 'BOQ Qty', 'Unit Cost', 'Total Cost', '% of Project']
      : ['Sheet', 'BOQ Code', 'Resource', 'CQBI', 'Unit', 'CR', 'Rate', 'Cost', 'Override', 'Used Cost', 'BOQ Qty', 'Total Cost', 'Remark']
    const values = copiedReport === 'summary'
      ? visibleSummaryRows.map((row) => [row.sheet, row.boqCode || 'Unassigned', row.boqQty ?? '', row.unitCost ?? '', row.totalCost, row.percentage === null ? '' : `${row.percentage}%`])
      : rows.map(({ sheet, row, derived }) => [sheet, row.boqCode, row.resource, row.cqbi ?? '', row.unit, row.cr ?? '', row.rate ?? '', derived.cost ?? '', row.override ?? '', derived.usedCost ?? '', row.boqQty ?? '', derived.totalCost ?? '', row.remark])
    const text = serializeClipboardMatrix([headers, ...values])
    setCopying(true)
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.append(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        textarea.remove()
        if (!copied) throw new Error('Clipboard access is unavailable in this browser.')
      }
      notify(`Copied ${values.length} ${copiedReport === 'summary' ? 'Project Summary' : 'Resource Detail'} row${values.length === 1 ? '' : 's'} (${copiedSheet}).`)
    } catch (error) {
      notify(`Could not copy report table: ${error.message}`, 'error')
    } finally { setCopying(false) }
  }

  return <div className="page-wrap report-page">
    <div className="report-controls"><div><p className="eyebrow">PROJECT OUTPUT</p><h1>Reports</h1><p className="subtitle">{project.name} · Read-only estimate report</p></div><div className="report-actions"><label>Report<select value={report} onChange={(event) => { setReport(event.target.value); setOpenFilter(null) }}><option value="summary">Project Summary</option><option value="detail">Resource Detail</option></select></label><label>Sheets<select value={sheetId} onChange={(event) => { setSheetId(event.target.value); setSummaryFilters({}); setOpenFilter(null) }}><option value="all">All sheets</option>{sheets.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.name}</option>)}</select></label><button className="secondary-button" type="button" onClick={copyTable} disabled={copying}>{copying ? 'Copying…' : 'Copy table'}</button><button className="primary-button" type="button" onClick={() => window.print()}>Print</button></div></div>
    <article className="report-paper"><header><p>BOQ COST LOAD · {report === 'summary' ? 'PROJECT SUMMARY' : 'RESOURCE DETAIL'}</p><h2>{project.name}</h2><p>Generated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</p></header>
      {report === 'summary' ? <>
        <div className="report-total"><span>Full project total <small>· percentages use all project sheets</small></span><strong>{money(projectSummary.total)}</strong></div>
        <div className="report-table-meta"><span>{visibleSummaryRows.length.toLocaleString()} of {scopedSummaryRows.length.toLocaleString()} BOQ items shown{sheetId !== 'all' ? ' · percentages remain based on the full project' : ''}</span>{activeFilterCount > 0 && <button type="button" onClick={clearAllFilters}>Clear all filters</button>}</div>
        {visibleSummaryRows.length ? <div className="report-table-scroll"><table className="report-excel-table report-summary-table">
          <thead><tr>{summaryColumns.map((column) => {
            const filter = summaryFilters[column.key] ?? { ...DEFAULT_FILTER }
            const isFiltered = Boolean(filter.search || filter.condition || filter.selected !== null)
            const sortDirection = summarySort?.col === column.index ? summarySort.direction : null
            const icon = sortDirection === 'asc' ? <ArrowUpAZ aria-hidden="true" /> : sortDirection === 'desc' ? <ArrowDownAZ aria-hidden="true" /> : <Filter aria-hidden="true" />
            return <th key={column.key} className={isFiltered ? 'has-filter' : ''}>
              <span>{column.label}</span>
              <button type="button" className="report-filter-trigger" ref={(node) => { filterButtonRefs.current[column.key] = node }} aria-label={`Filter ${column.label}${isFiltered ? ', filter active' : ''}`} aria-expanded={openFilter === column.key} title={`Filter ${column.label}`} onClick={() => { setFilterTrigger(filterButtonRefs.current[column.key]); setOpenFilter((current) => current === column.key ? null : column.key) }}>{icon}{isFiltered && <i />}</button>
            </th>
          })}</tr></thead>
          <tbody>{visibleSummaryRows.map((row) => <tr key={row.id}>
            <td>{row.sheet || '—'}</td><td>{row.boqCode || 'Unassigned'}</td><td className="report-number-cell">{row.boqQty === null ? '—' : number(row.boqQty, preferences?.quantityDecimals)}</td><td className="report-number-cell">{money(row.unitCost)}</td><td className="report-number-cell">{money(row.totalCost)}</td><td className="report-number-cell">{row.percentage === null ? '—' : `${number(row.percentage, 2)}%`}</td>
          </tr>)}</tbody>
        </table></div> : <div className="report-no-results">No matching BQ items. <button type="button" onClick={clearAllFilters}>Clear filters</button></div>}
        {openFilter && <FilterMenu
          column={summaryColumns.find((column) => column.key === openFilter)}
          rows={reportFilterRows}
          currentFilter={summaryFilters[openFilter] ?? { ...DEFAULT_FILTER }}
          sortDirection={summarySort?.col === summaryColumns.find((column) => column.key === openFilter)?.index ? summarySort.direction : null}
          hasSort={Boolean(summarySort)}
          onApply={(next) => { setSummaryFilters((current) => ({ ...current, [openFilter]: next })); setOpenFilter(null) }}
          onClear={() => { setSummaryFilters((current) => ({ ...current, [openFilter]: { ...DEFAULT_FILTER } })); setOpenFilter(null) }}
          onSort={(direction) => { setSummarySort(direction ? { col: summaryColumns.find((column) => column.key === openFilter).index, direction } : null); setOpenFilter(null) }}
          onClose={() => setOpenFilter(null)}
          triggerElement={filterTrigger}
        />}
      </> : <div className="report-table-scroll"><table className="report-excel-table report-detail-table"><thead><tr>{['Sheet','BOQ Code','Resource','CQBI','Unit','CR','Rate','Cost','Override','Used Cost','BOQ Qty','Total Cost','Remark'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(({ sheet, row, derived }) => <tr key={`${sheet}:${row.id}`}><td>{sheet}</td><td>{row.boqCode}</td><td>{row.resource}</td><td>{row.cqbi ?? ''}</td><td>{row.unit}</td><td>{row.cr ?? ''}</td><td>{row.rate ?? ''}</td><td>{derived.cost ?? ''}</td><td>{row.override ?? ''}</td><td>{derived.usedCost ?? ''}</td><td>{row.boqQty ?? ''}</td><td>{derived.totalCost ?? ''}</td><td>{row.remark}</td></tr>)}</tbody></table></div>}
    </article>
  </div>
}
