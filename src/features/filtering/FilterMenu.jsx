import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpAZ, Check, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { DEFAULT_FILTER } from '../../domain/constants.js'
import { parseNumeric } from '../../domain/normalization.js'
import { getProjectionValue, isNumericFilterColumn } from '../../domain/projection.js'

const textConditions = [
  ['contains', 'Contains'], ['notContains', 'Does not contain'], ['equals', 'Equals'],
  ['notEquals', 'Does not equal'], ['startsWith', 'Begins with'], ['endsWith', 'Ends with'],
  ['isBlank', 'Is blank'], ['isNotBlank', 'Is not blank'],
]
const numberConditions = [
  ['equals', 'Equals'], ['notEquals', 'Does not equal'], ['gt', 'Greater than'],
  ['gte', 'Greater than or equal'], ['lt', 'Less than'], ['lte', 'Less than or equal'],
  ['between', 'Between'], ['isBlank', 'Is blank'], ['isNotBlank', 'Is not blank'],
]

export function FilterMenu({ column, rows, currentFilter, sortDirection, hasSort, onApply, onClear, onSort, onClose, triggerElement }) {
  const rootRef = useRef(null)
  const searchInputRef = useRef(null)
  const [position, setPosition] = useState({ left: 12, top: 90, maxHeight: 480 })
  const numeric = isNumericFilterColumn(column.key)
  const [draft, setDraft] = useState(() => ({ ...DEFAULT_FILTER, ...currentFilter, selected: currentFilter.selected === null ? null : [...currentFilter.selected] }))
  const [valueSearch, setValueSearch] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(currentFilter.condition || currentFilter.search))
  const [conditionError, setConditionError] = useState('')
  const applyRef = useRef(null)
  const values = useMemo(() => [...new Set(rows.map((row) => String(getProjectionValue(row, column.key) ?? '')))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), [rows, column.key])
  const searchedValues = values.filter((value) => (value || '(Blanks)').toLocaleLowerCase().includes(valueSearch.trim().toLocaleLowerCase()))
  const selectedSet = draft.selected === null ? new Set(values) : new Set(draft.selected)
  const displayedValues = searchedValues.filter((value) => !selectedOnly || selectedSet.has(value)).slice(0, 200)
   const allDisplayedSelected = displayedValues.length > 0 && displayedValues.every((value) => selectedSet.has(value))
  const selectedCount = values.filter((value) => selectedSet.has(value)).length

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = triggerElement?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(330, window.innerWidth - 24)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const availableBelow = Math.max(0, window.innerHeight - rect.bottom - 12)
      const availableAbove = Math.max(0, rect.top - 12)
      const placeAbove = availableBelow < 360 && availableAbove > availableBelow
      const maxHeight = Math.max(140, Math.min(500, (placeAbove ? availableAbove : Math.max(availableBelow, window.innerHeight - 24)) - 4))
      const top = placeAbove ? Math.max(8, rect.top - Math.min(maxHeight, 500) - 4) : Math.min(rect.bottom + 4, window.innerHeight - maxHeight - 8)
      setPosition({ left, top, maxHeight })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [triggerElement])

  useEffect(() => {
    const onPointerDown = (event) => { if (!rootRef.current?.contains(event.target) && !triggerElement?.contains(event.target)) onClose() }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); triggerElement?.focus() }
      if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'SELECT') { event.preventDefault(); applyRef.current?.() }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, triggerElement])

  const updateDraft = (updates) => setDraft((current) => ({ ...current, ...updates }))
  const toggleValue = (value) => {
    const next = new Set(selectedSet)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    updateDraft({ selected: next.size === values.length ? null : [...next] })
  }
  const toggleDisplayedValues = () => {
    const next = new Set(selectedSet)
     if (allDisplayedSelected) displayedValues.forEach((value) => next.delete(value))
     else displayedValues.forEach((value) => next.add(value))
    updateDraft({ selected: next.size === values.length ? null : [...next] })
  }
  const selectAllValues = (selectAll) => updateDraft({ selected: selectAll ? null : [] })
  const apply = useCallback(() => {
    if (numeric && !['', 'isBlank', 'isNotBlank'].includes(draft.condition)) {
      const first = parseNumeric(draft.conditionValue)
      const second = parseNumeric(draft.conditionValue2)
      if (first.error || first.value === null || (draft.condition === 'between' && (second.error || second.value === null))) {
        setConditionError('Enter valid numeric condition values.')
        return
      }
    }
    setConditionError('')
    onApply(draft)
  }, [numeric, draft, onApply])
    useEffect(() => { applyRef.current = apply }, [apply])

  const appShell = document.querySelector('.app-shell')
  const themeClass = appShell?.classList.contains('theme-dark') ? ' theme-dark' : appShell?.classList.contains('theme-warm') ? ' theme-warm' : ''
  return createPortal(<div className={`filter-menu${themeClass}`} role="dialog" aria-label={`${column.label} filter`} ref={rootRef} style={position} onClick={(event) => event.stopPropagation()}>
    <div className="filter-menu-heading"><div className="filter-title"><span>FILTER BY</span><strong>{column.label}</strong></div><button type="button" aria-label="Close filter" onClick={() => { onClose(); triggerElement?.focus() }}><X /></button></div>
    <div className="filter-sort-actions" aria-label="Sort values">
      <button type="button" aria-pressed={sortDirection === 'asc'} title={numeric ? 'Smallest to largest' : 'Sort A to Z'} onClick={() => onSort('asc')}><ArrowUpAZ /><span>{numeric ? 'Smallest first' : 'A to Z'}</span></button>
      <button type="button" aria-pressed={sortDirection === 'desc'} title={numeric ? 'Largest to smallest' : 'Sort Z to A'} onClick={() => onSort('desc')}><ArrowDownAZ /><span>{numeric ? 'Largest first' : 'Z to A'}</span></button>
      {hasSort && <button type="button" className="filter-sort-reset" onClick={() => onSort(null)} title="Restore original order">Reset</button>}
    </div>
    <label className="filter-field-label filter-value-search">Search values<input ref={searchInputRef} type="search" value={valueSearch} onChange={(event) => setValueSearch(event.target.value)} placeholder="Type to find a value…" /></label>
    <div className="filter-selection-tools">
      <label className="filter-select-visible"><input type="checkbox" checked={allDisplayedSelected} onChange={toggleDisplayedValues} /> Select visible</label>
      <div><button type="button" onClick={() => selectAllValues(true)}>All</button><button type="button" onClick={() => selectAllValues(false)}>None</button></div>
    </div>
    <div className="filter-values-heading"><span>{selectedCount} of {values.length} selected · showing {displayedValues.length} of {searchedValues.length}</span><label><input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} /> Selected only</label></div>
    <div className="filter-values-list" role="group" aria-label={`${column.label} values`}>
      {displayedValues.length ? displayedValues.map((value) => <label key={value} title={value || 'Blank value'}>
        <input type="checkbox" checked={selectedSet.has(value)} onChange={() => toggleValue(value)} />
        <span>{value || '(Blanks)'}</span>
      </label>) : <p className="filter-no-values">{selectedOnly ? 'No selected values match this search.' : 'No matching values.'}</p>}
    </div>
    <div className={`filter-advanced${advancedOpen ? ' is-open' : ''}`}>
      <button type="button" className="filter-advanced-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}><span>Advanced filter</span><small>{draft.condition || draft.search ? 'Active' : 'Optional'}</small><span className="filter-advanced-chevron">⌄</span></button>
      {advancedOpen && <div className="filter-advanced-content">
        <div className="filter-condition">
          <label className="filter-field-label">{numeric ? 'Number condition' : 'Text condition'}
            <select value={draft.condition} onChange={(event) => updateDraft({ condition: event.target.value, conditionValue: '', conditionValue2: '' })}>
              <option value="">No condition</option>
              {(numeric ? numberConditions : textConditions).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          {draft.condition && !['isBlank', 'isNotBlank'].includes(draft.condition) && <div className="filter-condition-inputs">
            <input aria-label="Filter condition value" type="text" inputMode={numeric ? 'decimal' : 'text'} value={draft.conditionValue} onChange={(event) => updateDraft({ conditionValue: event.target.value })} placeholder="Value" />
            {draft.condition === 'between' && <input aria-label="Filter condition upper value" type="text" inputMode="decimal" value={draft.conditionValue2} onChange={(event) => updateDraft({ conditionValue2: event.target.value })} placeholder="And" />}
          </div>}
          {conditionError && <p className="filter-condition-error" role="alert">{conditionError}</p>}
        </div>
        <label className="filter-field-label filter-text-search">Filter rows containing<input type="search" value={draft.search} onChange={(event) => updateDraft({ search: event.target.value })} placeholder={`Text in ${column.label}`} /></label>
      </div>}
    </div>
    <div className="filter-menu-footer">
      <button type="button" className="filter-clear" onClick={() => { setDraft({ ...DEFAULT_FILTER }); setValueSearch(''); setConditionError(''); onClear() }}>Clear filter</button>
      <button type="button" className="filter-apply" onClick={apply}><Check /> Apply</button>
    </div>
  </div>, document.body)
}
