import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, CircleAlert, Layers3, ListChecks, ReceiptText, Wrench } from 'lucide-react'
import { formatNumber } from '../domain/calculations.js'
import { summarizeProject } from '../domain/projectSummary.js'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { projectRoutePath } from '../domain/projectRoutes.js'
import { notify, useUiStore } from '../stores/uiStore.js'

export function SummaryPage() {
  const navigate = useNavigate()
  const project = useWorkspaceStore((state) => state.project)
  const sheets = useWorkspaceStore((state) => state.sheets)
  const preferences = useUiStore((state) => state.preferences)
  if (!project) return <div className="placeholder-panel">Loading workspace...</div>

  const summary = summarizeProject(sheets)
  const money = (value) => {
    const formatted = formatNumber(value, { decimals: preferences?.costDecimals, useGrouping: preferences?.useGrouping }) || '0'
    return preferences?.currencyLabel ? `${formatted} ${preferences.currencyLabel}` : formatted
  }

  return <div className="page-wrap summary-page">
    <header className="summary-heading">
      <div><p className="eyebrow">PROJECT OVERVIEW</p><h1>Cost Summary</h1><p className="subtitle">{project.name} · All sheets and rows, regardless of Cost Load filters.</p></div>
      <Link className="secondary-button" to={projectRoutePath(project)}>Open Cost Load <ArrowUpRight aria-hidden="true" /></Link>
    </header>

    <section className="summary-metrics" aria-label="Project estimate metrics">
      <Metric icon={<ReceiptText />} label="Calculated estimate" value={money(summary.total)} detail="Incomplete lines excluded" emphasis />
      <Metric icon={<Layers3 />} label="Sheets" value={summary.sheetCount.toLocaleString()} />
      <Metric icon={<ListChecks />} label="BOQ items" value={summary.boqItemCount.toLocaleString()} />
      <Metric icon={<Wrench />} label="Resource lines" value={summary.rowCount.toLocaleString()} />
      <Metric icon={<CircleAlert />} label="Incomplete lines" value={summary.incompleteCount.toLocaleString()} warning={summary.incompleteCount > 0} />
    </section>

    <section className="summary-attention" aria-labelledby="summary-attention-title">
      <div><h2 id="summary-attention-title">Needs attention</h2><p>Review missing inputs and confirm manually overridden costs.</p></div>
      <div className="summary-attention-counts">
        <span><strong>{summary.missingCostCount.toLocaleString()}</strong> missing cost</span>
        <span><strong>{summary.missingQuantityCount.toLocaleString()}</strong> missing quantity</span>
        <span><strong>{summary.overriddenCount.toLocaleString()}</strong> overridden</span>
      </div>
    </section>

    {summary.rowCount === 0 ? <div className="summary-empty"><h2>No estimate lines yet</h2><p>Add resource lines in Cost Load or import a BOQ workbook to see project totals here.</p><Link className="primary-button" to={projectRoutePath(project)}>Go to Cost Load</Link></div> : <section className="summary-sheets" aria-label="Estimate breakdown by sheet">
      {summary.sheets.map((sheet) => <article className="summary-sheet" key={sheet.id}>
        <header className="summary-sheet-heading">
          <div><h2>{sheet.name}</h2><p>{sheet.rowCount.toLocaleString()} resource {sheet.rowCount === 1 ? 'line' : 'lines'} · {sheet.incompleteCount.toLocaleString()} incomplete · {sheet.overriddenCount.toLocaleString()} overridden</p></div>
          <div className="summary-sheet-total"><small>Sheet total</small><strong>{money(sheet.total)}</strong><button type="button" onClick={async () => {
            try { await useWorkspaceStore.getState().activateSheet(sheet.id); navigate(projectRoutePath(project)) }
            catch (error) { notify(error.message, 'error') }
          }}>Open sheet</button></div>
        </header>
        <div className="summary-table-scroll"><table className="summary-table">
          <thead><tr><th scope="col">BOQ code</th><th scope="col">Resource lines</th><th scope="col">Incomplete</th><th scope="col">Calculated total</th></tr></thead>
          <tbody>{sheet.boqGroups.map((group) => <tr key={group.code || '__uncoded__'}>
            <th scope="row">{group.code || <span className="summary-uncoded">No BOQ code</span>}</th>
            <td>{group.rowCount.toLocaleString()}</td><td>{group.incompleteCount.toLocaleString()}</td><td>{money(group.total)}</td>
          </tr>)}</tbody>
        </table></div>
      </article>)}
    </section>}
  </div>
}

function Metric({ icon, label, value, detail, emphasis = false, warning = false }) {
  return <article className={`summary-metric${emphasis ? ' is-emphasis' : ''}${warning ? ' is-warning' : ''}`}>
    <span className="summary-metric-icon" aria-hidden="true">{icon}</span><span className="summary-metric-label">{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}
  </article>
}
