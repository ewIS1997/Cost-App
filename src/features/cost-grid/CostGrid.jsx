// Owns grid selection, editor and capture-phase keyboard lifecycles; filter UI is shared with read-only pages.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpAZ, Filter } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useTable, tableFeatures } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ConfirmDialog } from '../../components/Modal.jsx'
import { COLUMN_DEFINITIONS } from '../../domain/columns.js'
import { COLUMN_WIDTH_MAX, COLUMN_WIDTH_MIN, DEFAULT_FILTER, FILL_CELL_LIMIT, ROW_LIMIT } from '../../domain/constants.js'
import { formatNumber, getRowDerivedValues } from '../../domain/calculations.js'
import { summarizeBoqItemCosts } from '../../domain/boqItemCostSummary.js'
import { createBlankRow, createId, normalizeBoqCode } from '../../domain/normalization.js'
import { copyResourcesToBoq } from '../../domain/resourceCopy.js'
import { updateWorksheetRowRate } from '../../domain/worksheetRates.js'
import { isImageTargetCurrent, prepareImageAttachment, normalizeAttachmentCode } from '../../domain/imageAttachments.js'
import { getInsertionValuesFromRow, getProjectionValue, projectVisibleRowIds } from '../../domain/projection.js'
import { FilterMenu } from '../filtering/FilterMenu.jsx'
import { useWorkspaceStore } from '../../stores/workspaceStore.js'
import { useUiStore } from '../../stores/uiStore.js'
import { notify } from '../../stores/uiStore.js'
import { addImageAttachment, deleteImageAttachment, listSheetAttachments } from '../../database/repositories.js'
import { BoqImageGallery } from './BoqImageGallery.jsx'
import { BoqImagePreview } from './BoqImagePreview.jsx'
import { useGridInteraction } from './useGridInteraction.js'
import { buildCellClipboardMatrix, buildRowClipboardMatrix, classifyClipboardPaste, clipboardCellValue, getPasteTargets, parseClipboardText, serializeClipboardMatrix } from './clipboard.js'
import { collectFindMatches, replaceText } from './gridFind.js'
import { applyParsedEdit, editCellText, editText, parseEdit, textFields, updateEditableCell } from './gridEdit.js'
import { imageAttachmentsByCode as groupImageAttachments, lastVisibleIndexByCode as indexLastVisibleRows, rowLayoutSignatures as getRowLayoutSignatures, selectionSummary as getSelectionSummary, visibleBoqGroups as groupVisibleBoqRows } from './gridViewModel.js'
import { FindReplaceDialog } from './FindReplaceDialog.jsx'
import { findDirectionalEdge, isBlankCell } from './gridNavigation.js'
import { gridPositionKey, readGridPosition as readStoredGridPosition, writeGridPosition as writeStoredGridPosition } from './gridPosition.js'
import { firstCqbiByBoqCode, unitCostPerCqbi } from './boqUnitCostPerCqbi.js'

const coreFeatures = tableFeatures({})
const UNIT_SUGGESTIONS = ['kg', 'sheet', 'liter', 'm²', 'm³', 'm', 'pcs', 'ton']
const INPUT_NUMBER_DISPLAY_DECIMALS = 4
const valueFor = (row, key, preferences) => {
  const derived = getRowDerivedValues(row)
  if (['cost', 'usedCost', 'boqQty', 'totalCost'].includes(key)) {
    return formatNumber(derived[key], { decimals: key === 'boqQty' ? preferences?.quantityDecimals : preferences?.costDecimals, useGrouping: preferences?.useGrouping })
  }
  if (['cqbi', 'cr', 'rate', 'override'].includes(key)) {
    return formatNumber(row[key], { decimals: INPUT_NUMBER_DISPLAY_DECIMALS, useGrouping: preferences?.useGrouping })
  }
  return row[key] ?? ''
}
function activeFilter(filter = {}) {
  return Boolean(filter.search || filter.condition || filter.selected !== null)
}

export function CostGrid({ sheet, showHistoryControls = true, actionsRef, onSelectionSummary, onRequestSaveAssembly, showImages = true }) {
  const preferences=useUiStore((state)=>state.preferences)
  const projectId = useWorkspaceStore((state) => state.project?.id)
  const positionKey = projectId ? gridPositionKey(projectId, sheet.id) : null
  const mountedPositionKeyRef = useRef(positionKey)
  const positionUrlRef = useRef(typeof window === 'undefined' ? '' : window.location.href)
  const restorePosition = readStoredGridPosition(typeof window === 'undefined' ? null : window.sessionStorage, positionKey, positionUrlRef.current)
  const restorePendingRef = useRef(Boolean(restorePosition))
  const positionWriteFrameRef = useRef(null)
  const scrollPositionRef = useRef({ scrollTop: Number(restorePosition?.scrollTop) || 0, scrollLeft: Number(restorePosition?.scrollLeft) || 0 })
  const parentRef = useRef(null)
  const headerRef = useRef(null)
  const gridRef = useRef(null)
  const editorRef = useRef(null)
  const commitRef = useRef(null)
  const filterButtonRefs = useRef({})
  const assemblyContextMenuButtonRef = useRef(null)
  const hoveredBoqCodeRef = useRef('')
  const resourceShortcutSequenceRef = useRef(null)
  const resourceClipboardRef = useRef(null)
  const rowClipboardRef = useRef(null)
  const cellClipboardRef = useRef(null)
  const dragSelectionRef = useRef(false)
  const fillDragRef = useRef(null)
  const fillLayoutRef = useRef(null)
  const [dragSelecting, setDragSelecting] = useState(false)
  const [fillDrag, setFillDrag] = useState(null)
  const [resizePreview, setResizePreview] = useState(null)
  const [openFilterKey, setOpenFilterKey] = useState(null)
  const [editor, setEditor] = useState(null)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [suggestionPosition, setSuggestionPosition] = useState(null)
  const [findOpen, setFindOpen] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const [currentFindIndex, setCurrentFindIndex] = useState(-1)
  const [findMessage, setFindMessage] = useState('')
  const [findMatchCase, setFindMatchCase] = useState(false)
  const [findEntireCell, setFindEntireCell] = useState(false)
  const [findSelectionOnly, setFindSelectionOnly] = useState(false)
  const [findScope, setFindScope] = useState(null)
  const [findSelectionCandidate, setFindSelectionCandidate] = useState(null)
  const findInputRef = useRef(null)
  const replaceInputRef = useRef(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [costSummaryTooltip, setCostSummaryTooltip] = useState(null)
  const [assemblyContextMenu, setAssemblyContextMenu] = useState(null)
  const [focusAfterInsertId, setFocusAfterInsertId] = useState(null)
  const [selectedRowIds, setSelectedRowIds] = useState([])
  const [rowSelectionAnchorId, setRowSelectionAnchorId] = useState(null)
  const [activeSelectedRowId, setActiveSelectedRowId] = useState(null)
  const [imageAttachments, setImageAttachments] = useState([])
  const [imagePreview, setImagePreview] = useState(null)
  const [imageDeleteTarget, setImageDeleteTarget] = useState(null)
  const imageFileInputRef = useRef(null)
  const pendingImageCodeRef = useRef('')
  const mutateSheet = useWorkspaceStore((state) => state.mutateSheet)
  const undoSheet = useWorkspaceStore((state) => state.undoSheet)
  const redoSheet = useWorkspaceStore((state) => state.redoSheet)

  useEffect(() => {
    resourceClipboardRef.current = null
    rowClipboardRef.current = null
    hoveredBoqCodeRef.current = ''
    if (resourceShortcutSequenceRef.current?.timeout) clearTimeout(resourceShortcutSequenceRef.current.timeout)
    resourceShortcutSequenceRef.current = null
  }, [projectId])

  useEffect(() => {
    const clearSequence = () => {
      const sequence = resourceShortcutSequenceRef.current
      if (sequence?.timeout) clearTimeout(sequence.timeout)
      resourceShortcutSequenceRef.current = null
    }
    const startSequence = (key, code) => {
      clearSequence()
      const timeout = setTimeout(() => { resourceShortcutSequenceRef.current = null }, 500)
      resourceShortcutSequenceRef.current = { key, code, timeout }
    }
    const onResourceShortcut = (event) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        clearSequence()
        return
      }
      const key = event.key.toLowerCase()
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing || event.repeat
        || (key !== 'c' && key !== 'v' && key !== 'p')) {
        clearSequence()
        return
      }
      const code = hoveredBoqCodeRef.current
      if (!code) { clearSequence(); return }
      const pending = resourceShortcutSequenceRef.current
      if (!pending || pending.key !== key || pending.code !== code) {
        startSequence(key, code)
        event.preventDefault()
        event.stopPropagation()
        return
      }
      clearSequence()
      event.preventDefault()
      event.stopPropagation()
      if (key === 'c') {
        const rows = sheet.data.rows.filter((row) => normalizeBoqCode(row.boqCode) === code)
        if (!rows.length) { notify(`No resources found for BOQ ${code}.`, 'warning'); return }
        resourceClipboardRef.current = { sourceCode: code, rows: rows.map((row) => ({
          resource: row.resource, cqbi: row.cqbi, unit: row.unit, cr: row.cr, rate: row.rate,
          override: row.override, boqQty: row.boqQty, remark: row.remark,
        })) }
        notify(`Copied ${rows.length} resource${rows.length === 1 ? '' : 's'} from BOQ ${code}.`)
        return
      }
      const copied = resourceClipboardRef.current
      if (!copied) { notify('Hover a source BOQ row number and press CC first.', 'warning'); return }
      if (copied.sourceCode === code) { notify('Choose a different destination BOQ item.', 'warning'); return }
      try {
        mutateSheet(sheet.id, (draft) => {
          const destinationRows = draft.rows.filter((row) => normalizeBoqCode(row.boqCode) === code)
          if (!destinationRows.length) throw new Error(`Destination BOQ ${code} is no longer available.`)
          const insertionIndex = draft.rows.findIndex((row) => normalizeBoqCode(row.boqCode) === code)
          draft.rows = draft.rows.filter((row) => normalizeBoqCode(row.boqCode) !== code)
          const replacements = copyResourcesToBoq(copied.rows, destinationRows, code, createId, { preserveDestinationCqbi: key === 'p' })
          draft.rows.splice(insertionIndex, 0, ...replacements)
        })
        notify(key === 'p'
          ? `Replaced resources for BOQ ${code}; preserved its existing CQBI.`
          : `Replaced resources for BOQ ${code} with ${copied.rows.length} copied resource${copied.rows.length === 1 ? '' : 's'}.`)
      } catch (reason) { notify(reason.message, 'error') }
    }
    window.addEventListener('keydown', onResourceShortcut, true)
    return () => {
      window.removeEventListener('keydown', onResourceShortcut, true)
      clearSequence()
    }
  }, [sheet.id, sheet.data.rows, mutateSheet])

  const visibleColumnDefinitions = useMemo(() => COLUMN_DEFINITIONS
    .filter((column) => !sheet.data.hiddenColumnKeys.includes(column.key)), [sheet.data.hiddenColumnKeys])
  const columns = useMemo(() => visibleColumnDefinitions
    .map((column) => ({
      ...column,
      size: resizePreview?.index === column.index ? resizePreview.width : sheet.data.columnWidths[column.index],
    })), [visibleColumnDefinitions, sheet.data.columnWidths, resizePreview])
  const filters = sheet.data.filters
  const visibleIds = useMemo(
    () => projectVisibleRowIds(sheet.data.rows, filters, sheet.data.sort),
    [sheet.data.rows, filters, sheet.data.sort],
  )
  const rowsById = useMemo(() => new Map(sheet.data.rows.map((row) => [row.id, row])), [sheet.data.rows])
  const boqItemCostSummaries = useMemo(() => summarizeBoqItemCosts(sheet.data.rows), [sheet.data.rows])
  const firstCqbiByCode = useMemo(() => firstCqbiByBoqCode(sheet.data.rows), [sheet.data.rows])
  const visibleRows = useMemo(() => visibleIds.map((id) => rowsById.get(id)).filter(Boolean), [visibleIds, rowsById])
  const lastVisibleIndexByCode = useMemo(() => indexLastVisibleRows(visibleRows), [visibleRows])
  const imageAttachmentsByCode = useMemo(() => groupImageAttachments(imageAttachments), [imageAttachments])
  const rowLayoutSignatures = useMemo(() => getRowLayoutSignatures(visibleRows, showImages, lastVisibleIndexByCode, imageAttachmentsByCode), [visibleRows, showImages, lastVisibleIndexByCode, imageAttachmentsByCode])
  const visibleBoqGroups = useMemo(() => groupVisibleBoqRows(visibleRows), [visibleRows])
  const tableColumns = useMemo(() => columns.map((column) => ({
    id: column.key,
    accessorFn: (row) => row[column.key],
    header: () => column.label,
    cell: ({ row }) => valueFor(row.original, column.key,preferences),
    meta: column,
  })), [columns,preferences])
  const table = useTable({ data: visibleRows, columns: tableColumns, features: coreFeatures, getRowId: (row) => row.id })
  const rowModel = table.getRowModel().rows
  const rowIndexById = useMemo(() => new Map(rowModel.map((row, index) => [row.id, index])), [rowModel])
  const gutterWidth = Math.max(32, String(Math.max(1, rowModel.length)).length * 8 + 14)
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds])
  const rowHeight=useUiStore((state)=>state.preferences?.density==='compact'?24:32)
  const previousRowLayoutRef = useRef(null)
  const previousRowHeightRef = useRef(rowHeight)
  const virtualizer = useVirtualizer({
    count: rowModel.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => rowModel[index]?.id ?? index,
    estimateSize: () => rowHeight,
    measureElement: (element, entry) => {
      const borderBox = entry?.borderBoxSize?.[0]
      return borderBox?.blockSize ?? element.getBoundingClientRect().height
    },
    overscan: 12,
  })
  const {
    activeCell: active,
    setActiveCell: setActive,
    setAnchorCell: setAnchor,
    setExtentCell: setExtent,
    selectionBounds,
    isSelected: selected,
    anchorCell: selectionAnchor,
    extentCell: selectionExtent,
  } = useGridInteraction(sheet.id, rowModel, columns, restorePosition)
  const selectionSnapshot = { active, anchor: selectionAnchor, extent: selectionExtent }
  const selectionSnapshotRef = useRef(selectionSnapshot)
  selectionSnapshotRef.current = selectionSnapshot
  useEffect(() => {
    if (!assemblyContextMenu) return undefined
    const focusFrame = window.requestAnimationFrame(() => assemblyContextMenuButtonRef.current?.focus())
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && event.target.closest?.('.assembly-context-menu')) return
      setAssemblyContextMenu(null)
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', close, true)
    return () => { window.cancelAnimationFrame(focusFrame); document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', close, true) }
  }, [assemblyContextMenu])
  const selectionSummary = useMemo(() => getSelectionSummary(selectedRowIds, selectionBounds, rowModel, columns), [selectedRowIds, selectionBounds, rowModel, columns])
  useEffect(() => { onSelectionSummary?.(selectionSummary) }, [onSelectionSummary, selectionSummary])
  const writeGridPosition = useCallback(() => {
    if (restorePendingRef.current) return
    const scroller = parentRef.current
    if (scroller) scrollPositionRef.current = { scrollTop: scroller.scrollTop, scrollLeft: scroller.scrollLeft }
    writeStoredGridPosition(window.sessionStorage, positionKey, {
      url: positionUrlRef.current,
      selection: selectionSnapshotRef.current,
      ...scrollPositionRef.current,
    })
  }, [positionKey])
  const scheduleGridPositionWrite = useCallback(() => {
    if (restorePendingRef.current || positionWriteFrameRef.current !== null) return
    positionWriteFrameRef.current = window.requestAnimationFrame(() => {
      positionWriteFrameRef.current = null
      writeGridPosition()
    })
  }, [writeGridPosition])
  useEffect(() => {
    if (!restorePosition) return undefined
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      virtualizer.measure()
      secondFrame = window.requestAnimationFrame(() => {
        const scroller = parentRef.current
        if (scroller) {
          scroller.scrollTop = Math.max(0, Number(restorePosition.scrollTop) || 0)
          scroller.scrollLeft = Math.max(0, Number(restorePosition.scrollLeft) || 0)
        }
        scrollPositionRef.current = {
          scrollTop: Math.max(0, Number(restorePosition.scrollTop) || 0),
          scrollLeft: Math.max(0, Number(restorePosition.scrollLeft) || 0),
        }
        restorePendingRef.current = false
        writeGridPosition()
      })
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)
    }
  }, [])
  useEffect(() => {
    if (!restorePendingRef.current) writeGridPosition()
  }, [writeGridPosition])
  useEffect(() => {
    const scroller = parentRef.current
    const saveLatestPosition = () => writeStoredGridPosition(window.sessionStorage, mountedPositionKeyRef.current, {
      url: positionUrlRef.current,
      selection: selectionSnapshotRef.current,
      ...scrollPositionRef.current,
    })
    const onPageHide = () => {
      if (scroller) scrollPositionRef.current = { scrollTop: scroller.scrollTop, scrollLeft: scroller.scrollLeft }
      saveLatestPosition()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      // Preserve the mounted worksheet URL and latest refs; route changes may already have changed location.
      if (scroller) scrollPositionRef.current = { scrollTop: scroller.scrollTop, scrollLeft: scroller.scrollLeft }
      saveLatestPosition()
    }
  }, [])
  useEffect(() => () => {
    if (positionWriteFrameRef.current !== null) window.cancelAnimationFrame(positionWriteFrameRef.current)
  }, [])
  fillLayoutRef.current = { rowModel, columns, data: sheet.data }
  const activeRowIndex = rowIndexById.get(active?.rowId) ?? -1
  const activeColumnIndex = columns.findIndex((column) => column.key === active?.columnKey)
  const fillHandleColumnIndex = selectionBounds
    ? columns.reduce((lastEditable, column, index) => index >= selectionBounds.left && index <= selectionBounds.right && column.editable ? index : lastEditable, -1)
    : -1
  const editorColumnKey = editor?.cell.columnKey
  const suggestionValues = useMemo(() => {
    if (!editor) return []
    if (editorColumnKey === 'unit') {
      const query = editor.text.trim().toLocaleLowerCase()
      return UNIT_SUGGESTIONS.filter((value) => !query || (value.toLocaleLowerCase().startsWith(query) && value.toLocaleLowerCase() !== query)).slice(0, 8)
    }
    if (!textFields.has(editorColumnKey) || editor.mode === 'select' || !editor.text.trim()) return []
    const query = editor.text.toLocaleLowerCase()
    return [...new Set(sheet.data.rows
      .filter((item) => item.id !== editor.cell.rowId)
      .map((item) => editText(item, editorColumnKey))
      .filter((value) => value && value.toLocaleLowerCase().startsWith(query) && value.toLocaleLowerCase() !== query))]
      .slice(0, 8)
  }, [editor, editorColumnKey, sheet.data.rows])
  const findMatches = useMemo(() => {
    return collectFindMatches(visibleRows, columns, findText, findMatchCase, findEntireCell, findSelectionOnly ? findScope : null, 500)
  }, [findText, findMatchCase, findEntireCell, findSelectionOnly, findScope, visibleRows, columns])
  const findMatchCount = useMemo(() => {
    if (!findText.trim()) return 0
    const query = findMatchCase ? findText : findText.toLocaleLowerCase()
    let count = 0
    const scope = findSelectionOnly ? findScope : null
    visibleRows.forEach((row) => {
      if (scope && !scope.rowIds.has(row.id)) return
      columns.forEach((column) => {
        if (scope && !scope.columnKeys.has(column.key)) return
        const raw = getProjectionValue(row, column.key)
        const value = raw === null || raw === undefined ? '' : String(raw)
        const searchable = findMatchCase ? value : value.toLocaleLowerCase()
        if (findEntireCell ? searchable === query : searchable.includes(query)) count++
      })
    })
    return count
  }, [findText, findMatchCase, findEntireCell, findSelectionOnly, findScope, visibleRows, columns])

  useEffect(() => {
    setFindScope(null)
    setFindSelectionCandidate(null)
    setFindSelectionOnly(false)
    setEditor(null)
    setError('')
    setOpenFilterKey(null)
    setSelectedRowIds([])
    setRowSelectionAnchorId(null)
    setActiveSelectedRowId(null)
  }, [sheet.id])
  useEffect(() => {
    let live=true
    const refresh=()=>listSheetAttachments(sheet.id).then((items)=>{if(live)setImageAttachments(items)}).catch((error)=>notify(`Could not load item images: ${error.message}`,'error'))
    const onUpdated=(event)=>{if(event.detail?.sheetId===sheet.id)refresh()}
    setImageAttachments([])
    refresh()
    window.addEventListener('boq-attachments-updated',onUpdated)
    return()=>{live=false;window.removeEventListener('boq-attachments-updated',onUpdated)}
  },[sheet.id])
  useEffect(() => {
    const validIds = new Set(sheet.data.rows.map((row) => row.id))
    setSelectedRowIds((current) => current.filter((id) => validIds.has(id)))
    if (rowSelectionAnchorId && !validIds.has(rowSelectionAnchorId)) setRowSelectionAnchorId(null)
    if (activeSelectedRowId && !validIds.has(activeSelectedRowId)) setActiveSelectedRowId(null)
  }, [sheet.id, sheet.data.rows, rowSelectionAnchorId, activeSelectedRowId])
  const captureSelectionScope = useCallback(() => {
    if (!selectionBounds || (selectionBounds.top === selectionBounds.bottom && selectionBounds.left === selectionBounds.right)) return null
    return {
      rowIds: new Set(rowModel.slice(selectionBounds.top, selectionBounds.bottom + 1).map((row) => row.id)),
      columnKeys: new Set(columns.slice(selectionBounds.left, selectionBounds.right + 1).map((column) => column.key)),
    }
  }, [selectionBounds, rowModel, columns])
  const openFind = useCallback((withReplace = false) => {
    const candidate = captureSelectionScope()
    setFindSelectionCandidate(candidate)
    setFindScope(null)
    setFindSelectionOnly(false)
    setFindOpen(true)
    setShowReplace(withReplace)
    setFindMessage('')
  }, [captureSelectionScope])

  useEffect(() => {
    const onFindShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !['f', 'h'].includes(event.key.toLowerCase())) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      openFind(event.key.toLowerCase() === 'h')
    }
    window.addEventListener('keydown', onFindShortcut)
    return () => window.removeEventListener('keydown', onFindShortcut)
  }, [openFind])
  useEffect(() => {
    const onHistoryShortcut = (event) => {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return

      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return

      event.preventDefault()
      if (key === 'y' || event.shiftKey) redoSheet(sheet.id)
      else undoSheet(sheet.id)
    }
    window.addEventListener('keydown', onHistoryShortcut)
    return () => window.removeEventListener('keydown', onHistoryShortcut)
  }, [sheet.id, undoSheet, redoSheet])
  useEffect(() => {
    if (!findOpen) return undefined
    const frame = window.requestAnimationFrame(() => {
      if (showReplace) replaceInputRef.current?.focus()
      else {
        findInputRef.current?.focus()
        findInputRef.current?.select()
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [findOpen, showReplace])
  useEffect(() => {
    const stopDragging = () => {
      dragSelectionRef.current = false
      setDragSelecting(false)
    }
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    return () => {
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [])
  useLayoutEffect(() => {
    const previous = previousRowLayoutRef.current
    previousRowLayoutRef.current = { sheetId: sheet.id, signatures: rowLayoutSignatures, rowCount: rowModel.length }
    if (!previous || previous.sheetId !== sheet.id) return

    const changedRowIds = new Set()
    if (previous.rowCount !== rowModel.length) {
      rowModel.forEach((row) => changedRowIds.add(row.id))
    }
    for (const [rowId, signature] of rowLayoutSignatures) {
      if (previous.signatures.get(rowId) !== signature) changedRowIds.add(rowId)
    }
    if (!changedRowIds.size) return

    parentRef.current?.querySelectorAll('[data-index]').forEach((element) => {
      const index = Number(element.dataset.index)
      const rowId = rowModel[index]?.id
      if (rowId && changedRowIds.has(rowId)) virtualizer.measureElement(element)
    })
  }, [sheet.id, rowLayoutSignatures, rowModel, virtualizer])
  useLayoutEffect(() => {
    if (previousRowHeightRef.current === rowHeight) return
    previousRowHeightRef.current = rowHeight
    virtualizer.measure()
    parentRef.current?.querySelectorAll('[data-index]').forEach((element) => virtualizer.measureElement(element))
  }, [rowHeight, virtualizer])
  useEffect(() => {
    if (editor && editor.source !== 'formula') {
      const element = editorRef.current
      element?.focus()
      if (editor.mode === 'select') element?.select()
      else if (editor.caretAtEnd && element) {
        const end = element.value.length
        element.setSelectionRange(end, end)
      } else if (editor.mode === 'replace') {
        const end = element.value.length
        element.setSelectionRange(end, end)
      }
    }
  }, [editor?.cell.rowId, editor?.cell.columnKey, editor?.mode, editor?.source])
  useLayoutEffect(() => {
    if (!['resource', 'remark'].includes(editorColumnKey) || !(editorRef.current instanceof HTMLTextAreaElement)) return
    const textarea = editorRef.current
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
    const rowElement = textarea.closest('[data-index]')
    if (rowElement) virtualizer.measureElement(rowElement)
  }, [editor?.text, editorColumnKey, virtualizer])
  useLayoutEffect(() => {
    setActiveSuggestion(-1)
    if (!editor || !suggestionValues.length || !editorRef.current) { setSuggestionPosition(null); return }
    const rect = editorRef.current.getBoundingClientRect()
    setSuggestionPosition({ left: rect.left, top: rect.bottom + 5, width: Math.max(rect.width, 220) })
  }, [editor?.text, editor?.cell.rowId, suggestionValues.length])
  useEffect(() => {
    const unregister = useWorkspaceStore.getState().registerNavigationGuard(() => commitRef.current())
    return unregister
  }, [])

  const scrollToCell = useCallback((rowId, columnKey) => {
    const rowIndex = rowIndexById.get(rowId) ?? -1
    const columnIndex = columns.findIndex((column) => column.key === columnKey)
    if (rowIndex < 0 || columnIndex < 0) return
    virtualizer.scrollToIndex(rowIndex, { align: 'auto' })
    const scroller = parentRef.current
    if (!scroller) return
    const left = columns.slice(0, columnIndex).reduce((sum, column) => sum + column.size, gutterWidth)
    const right = left + columns[columnIndex].size
    if (left < scroller.scrollLeft) scroller.scrollLeft = left
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth
  }, [rowIndexById, columns, virtualizer, gutterWidth])

  const select = useCallback((cell, extend = false) => {
    if (extend) {
      setExtent(cell)
      setActive(cell)
    } else {
      setActive(cell)
      setAnchor(cell)
      setExtent(cell)
    }
    const rowIndex = rowIndexById.get(cell.rowId)
    const column = columns.find((item) => item.key === cell.columnKey)
    if (rowIndex !== undefined && column) setStatus(`${column.label}, row ${rowIndex + 1}`)
    scrollToCell(cell.rowId, cell.columnKey)
  }, [setExtent, setActive, setAnchor, rowIndexById, columns, scrollToCell])
  const selectRef = useRef(select)
  selectRef.current = select
  const rowIndexByIdRef = useRef(rowIndexById)
  rowIndexByIdRef.current = rowIndexById
  const columnsRef = useRef(columns)
  columnsRef.current = columns

  const selectRowFromGutter = useCallback((event, rowId, rowIndex) => {
    event.preventDefault()
    event.stopPropagation()
    gridRef.current?.focus()
    const modifier = event.ctrlKey || event.metaKey
    const anchorIndex = rowIndexById.get(rowSelectionAnchorId)
    const validAnchorIndex = anchorIndex === undefined ? rowIndex : anchorIndex
    const start = Math.min(validAnchorIndex, rowIndex)
    const end = Math.max(validAnchorIndex, rowIndex)
    const rangeIds = rowModel.slice(start, end + 1).map((row) => row.id)

    if (event.shiftKey) {
      setSelectedRowIds((current) => modifier ? [...new Set([...current, ...rangeIds])] : rangeIds)
      if (!rowSelectionAnchorId || anchorIndex === undefined) setRowSelectionAnchorId(rowId)
    } else if (modifier) {
      setSelectedRowIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId])
      setRowSelectionAnchorId(rowId)
    } else {
      setSelectedRowIds([rowId])
      setRowSelectionAnchorId(rowId)
    }
    setActiveSelectedRowId(rowId)
    const columnKey = columns.some((column) => column.key === active?.columnKey)
      ? active.columnKey
      : columns.find((column) => column.editable)?.key
    if (columnKey) select({ rowId, columnKey })
  }, [rowIndexById, rowSelectionAnchorId, rowModel, active, columns, select])

  const beginFillDrag = useCallback((event) => {
    if (event.button !== 0 || !selectionBounds || editor) return
    const cornerColumn = columns[fillHandleColumnIndex]
    if (!cornerColumn?.editable) return
    event.preventDefault()
    event.stopPropagation()
    const sourceValues = rowModel.slice(selectionBounds.top, selectionBounds.bottom + 1).map((tableRow) => {
      const sourceRow = tableRow.original
      return Object.fromEntries(columns.slice(selectionBounds.left, selectionBounds.right + 1)
        .filter((column) => column.editable)
        .map((column) => [column.key, clipboardCellValue(sourceRow, column.key)]))
    })
    const start = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sourceBounds: { ...selectionBounds },
      sourceValues,
      targetRowIndex: null,
      targetColumnIndex: null,
      preview: null,
      axis: null,
      pointerX: event.clientX,
      pointerY: event.clientY,
    }
    fillDragRef.current = start
    setFillDrag(start)
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* Synthetic or unsupported pointer capture; window listeners still track the drag. */ }
  }, [selectionBounds, fillHandleColumnIndex, columns, rowModel, editor])

  useEffect(() => {
    let autoScrollFrame = null
    const getPreview = (drag, rowIndex, columnIndex) => {
      const { top, bottom, left, right } = drag.sourceBounds
      const rowOutside = rowIndex < top || rowIndex > bottom
      const columnOutside = columnIndex < left || columnIndex > right
      let axis
      if (rowOutside && !columnOutside) axis = 'vertical'
      else if (columnOutside && !rowOutside) axis = 'horizontal'
      else {
        const edgeRow = rowIndex < top ? top : bottom
        const lowRow = Math.min(rowIndex, edgeRow)
        const highRow = Math.max(rowIndex, edgeRow)
        const verticalDistance = rowOutside
          ? virtualizer.getMeasurements().slice(lowRow, highRow).reduce((sum, measurement) => sum + measurement.size, 0)
          : 0
        const columns = fillLayoutRef.current?.columns ?? []
        const horizontalDistance = columnOutside
          ? columns.slice(columnIndex < left ? columnIndex : right + 1, columnIndex < left ? left : columnIndex + 1).reduce((sum, column) => sum + column.size, 0)
          : 0
        axis = verticalDistance >= horizontalDistance ? 'vertical' : 'horizontal'
      }
      if (axis === 'vertical') {
        if (rowIndex >= top && rowIndex <= bottom) return { axis, preview: null }
        return { axis, preview: { top: Math.min(top, rowIndex), bottom: Math.max(bottom, rowIndex), left, right } }
      }
      if (columnIndex >= left && columnIndex <= right) return { axis, preview: null }
      return { axis, preview: { top, bottom, left: Math.min(left, columnIndex), right: Math.max(right, columnIndex) } }
    }
    const updateTarget = (pointerX, pointerY) => {
      const current = fillDragRef.current
      if (!current) return
      const target = document.elementFromPoint(pointerX, pointerY)?.closest('[data-grid-row-index][data-grid-column-index]')
      if (!target) return
      const rowIndex = Number(target.dataset.gridRowIndex)
      const columnIndex = Number(target.dataset.gridColumnIndex)
      if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return
      const { axis, preview } = getPreview(current, rowIndex, columnIndex)
      const next = { ...current, pointerX, pointerY, targetRowIndex: rowIndex, targetColumnIndex: columnIndex, axis, preview }
      fillDragRef.current = next
      setFillDrag((previous) => previous?.targetRowIndex === rowIndex
        && previous?.targetColumnIndex === columnIndex
        && previous?.axis === axis
        && JSON.stringify(previous?.preview) === JSON.stringify(preview) ? previous : next)
    }
    const autoScroll = () => {
      autoScrollFrame = null
      const current = fillDragRef.current
      const scroller = parentRef.current
      if (!current || !scroller) return
      const rect = scroller.getBoundingClientRect()
      const edge = 30
      let deltaX = 0
      let deltaY = 0
      if (current.pointerY < rect.top + edge) deltaY = -Math.max(4, Math.round((rect.top + edge - current.pointerY) / 3))
      else if (current.pointerY > rect.bottom - edge) deltaY = Math.max(4, Math.round((current.pointerY - (rect.bottom - edge)) / 3))
      if (current.pointerX < rect.left + edge) deltaX = -Math.max(4, Math.round((rect.left + edge - current.pointerX) / 3))
      else if (current.pointerX > rect.right - edge) deltaX = Math.max(4, Math.round((current.pointerX - (rect.right - edge)) / 3))
      if (!deltaX && !deltaY) return
      const beforeLeft = scroller.scrollLeft
      const beforeTop = scroller.scrollTop
      scroller.scrollBy(deltaX, deltaY)
      if (scroller.scrollLeft === beforeLeft && scroller.scrollTop === beforeTop) return
      updateTarget(current.pointerX, current.pointerY)
      autoScrollFrame = window.requestAnimationFrame(autoScroll)
    }
    const onPointerMove = (event) => {
      const current = fillDragRef.current
      if (!current || event.pointerId !== current.pointerId) return
      event.preventDefault()
      updateTarget(event.clientX, event.clientY)
      if (autoScrollFrame === null) autoScrollFrame = window.requestAnimationFrame(autoScroll)
    }
    const finishFill = (drag) => {
      if (!drag?.preview) return
      const layout = fillLayoutRef.current
      if (!layout) return
      const { rowModel: currentRows, columns: currentColumns } = layout
      const { sourceBounds, sourceValues, preview, axis, targetRowIndex, targetColumnIndex } = drag
      const sourceHeight = sourceBounds.bottom - sourceBounds.top + 1
      const sourceWidth = sourceBounds.right - sourceBounds.left + 1
      const fillArea = (preview.bottom - preview.top + 1) * (preview.right - preview.left + 1)
      if (fillArea > FILL_CELL_LIMIT) {
        notify(`A fill operation cannot exceed ${FILL_CELL_LIMIT.toLocaleString()} cells.`, 'warning')
        return
      }
      let filledCount = 0
      try {
        mutateSheet(sheet.id, (draft) => {
          for (let rowIndex = preview.top; rowIndex <= preview.bottom; rowIndex++) {
            for (let columnIndex = preview.left; columnIndex <= preview.right; columnIndex++) {
              if (rowIndex >= sourceBounds.top && rowIndex <= sourceBounds.bottom
                && columnIndex >= sourceBounds.left && columnIndex <= sourceBounds.right) continue
              const sourceRowOffset = ((rowIndex - sourceBounds.top) % sourceHeight + sourceHeight) % sourceHeight
              const sourceColumnOffset = ((columnIndex - sourceBounds.left) % sourceWidth + sourceWidth) % sourceWidth
              const sourceColumnIndex = axis === 'horizontal' ? sourceBounds.left + sourceColumnOffset : columnIndex
              const targetColumn = currentColumns[columnIndex]
              const sourceColumn = currentColumns[sourceColumnIndex]
              if (!targetColumn?.editable || !sourceColumn?.editable) continue
              const sourceValue = sourceValues[sourceRowOffset]?.[sourceColumn.key]
              const destinationRow = currentRows[rowIndex]
              if (!destinationRow) continue
              updateEditableCell(draft, {
                rowId: destinationRow.id,
                columnKey: targetColumn.key,
                columnLabel: targetColumn.label,
              }, sourceValue)
              filledCount++
            }
          }
        })
        if (filledCount) {
          const anchor = { rowId: currentRows[preview.top]?.id, columnKey: currentColumns[preview.left]?.key }
          const extent = { rowId: currentRows[preview.bottom]?.id, columnKey: currentColumns[preview.right]?.key }
          const activeCell = axis === 'vertical'
            ? { rowId: currentRows[targetRowIndex]?.id, columnKey: currentColumns[sourceBounds.right]?.key }
            : { rowId: currentRows[sourceBounds.bottom]?.id, columnKey: currentColumns[targetColumnIndex]?.key }
          if (anchor.rowId && extent.rowId && activeCell.rowId) {
            setAnchor(anchor)
            setExtent(extent)
            setActive(activeCell)
          }
          setStatus(`Filled ${filledCount} cell${filledCount === 1 ? '' : 's'}`)
          notify(`Filled ${filledCount} cell${filledCount === 1 ? '' : 's'}.`)
        }
      } catch (reason) {
        notify(reason.message, 'error')
      }
    }
    const stopDrag = (event, shouldFill) => {
      const current = fillDragRef.current
      if (!current || (event && event.pointerId !== current.pointerId)) return
      if (shouldFill && event) updateTarget(event.clientX, event.clientY)
      const finished = fillDragRef.current
      fillDragRef.current = null
      setFillDrag(null)
      if (autoScrollFrame !== null) window.cancelAnimationFrame(autoScrollFrame)
      autoScrollFrame = null
      if (shouldFill) finishFill(finished)
    }
    const onPointerUp = (event) => stopDrag(event, true)
    const onPointerCancel = (event) => stopDrag(event, false)
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      if (autoScrollFrame !== null) window.cancelAnimationFrame(autoScrollFrame)
    }
  }, [sheet.id, mutateSheet, setActive, setAnchor, setExtent, virtualizer])

  const closeFind = useCallback(() => setFindOpen(false), [])
  const setFindSelectionScope = useCallback((enabled) => {
    if (!enabled) {
      setFindSelectionOnly(false)
      setFindScope(null)
      setCurrentFindIndex(-1)
      return
    }
    if (!findSelectionCandidate) return
    setFindScope(findSelectionCandidate)
    setFindSelectionOnly(true)
    setCurrentFindIndex(-1)
  }, [findSelectionCandidate])

  useEffect(() => {
    if (!findOpen || !findText.trim() || !findMatches.length) {
      setCurrentFindIndex(-1)
      return
    }
    setCurrentFindIndex(0)
    const first = findMatches[0]
    if (rowIndexByIdRef.current.has(first.rowId) && columnsRef.current.some((column) => column.key === first.columnKey)) {
      selectRef.current({ rowId: first.rowId, columnKey: first.columnKey })
    }
  }, [findOpen, findText, findMatches])

  const goToFindMatch = useCallback((direction) => {
    if (!findMatches.length) { setFindMessage(findText.trim() ? 'No matches found.' : 'Enter text to find.'); return }
    const nextIndex = currentFindIndex < 0
      ? (direction > 0 ? 0 : findMatches.length - 1)
      : (currentFindIndex + direction + findMatches.length) % findMatches.length
    const match = findMatches[nextIndex]
    setCurrentFindIndex(nextIndex)
    setFindMessage('')
    select({ rowId: match.rowId, columnKey: match.columnKey })
  }, [findMatches, findText, currentFindIndex, select])

  const replaceCurrentMatch = useCallback(() => {
    if (!findMatches.length) { setFindMessage(findText.trim() ? 'No matches found.' : 'Enter text to find.'); return }
    const matchIndex = currentFindIndex < 0 ? 0 : currentFindIndex
    const match = findMatches[matchIndex]
    if (!COLUMN_DEFINITIONS.find((column) => column.key === match.columnKey)?.editable) { setFindMessage('This calculated cell is read-only.'); return }
    const value = replaceText(match.value, findText, replaceWith, findMatchCase, findEntireCell)
    try {
      mutateSheet(sheet.id, (draft) => updateEditableCell(draft, match, value))
      setCurrentFindIndex(-1)
      setFindMessage('Match replaced.')
    } catch (reason) { setFindMessage(reason.message) }
  }, [findMatches, findText, replaceWith, findMatchCase, findEntireCell, currentFindIndex, mutateSheet, sheet.id])

  const replaceAllMatches = useCallback(() => {
    if (!findMatches.length) { setFindMessage(findText.trim() ? 'No matches found.' : 'Enter text to find.'); return }
    const allMatches = collectFindMatches(visibleRows, columns, findText, findMatchCase, findEntireCell, findSelectionOnly ? findScope : null)
    const editableMatches = allMatches.filter((match) => COLUMN_DEFINITIONS.find((column) => column.key === match.columnKey)?.editable)
    if (!editableMatches.length) { setFindMessage('There are no editable matches to replace.'); return }
    try {
      mutateSheet(sheet.id, (draft) => {
        editableMatches.forEach((match) => updateEditableCell(draft, match, replaceText(match.value, findText, replaceWith, findMatchCase, findEntireCell)))
      })
      setFindMessage(`${editableMatches.length} ${editableMatches.length === 1 ? 'match' : 'matches'} replaced.`)
      setCurrentFindIndex(-1)
    } catch (reason) { setFindMessage(reason.message) }
  }, [findMatches, findText, replaceWith, findMatchCase, findEntireCell, findSelectionOnly, findScope, visibleRows, columns, mutateSheet, sheet.id])

  const clearSelectedCells = useCallback(() => {
    if (!selectionBounds) return false
    const selectedCellCount = (selectionBounds.bottom - selectionBounds.top + 1) * (selectionBounds.right - selectionBounds.left + 1)
    if (selectedCellCount > FILL_CELL_LIMIT) { setError(`A clear operation cannot exceed ${FILL_CELL_LIMIT.toLocaleString()} cells.`); return false }
    const cells = []
    for (let rowIndex = selectionBounds.top; rowIndex <= selectionBounds.bottom; rowIndex++) {
      const row = rowModel[rowIndex]
      if (!row) continue
      for (let columnIndex = selectionBounds.left; columnIndex <= selectionBounds.right; columnIndex++) {
        const column = columns[columnIndex]
        if (column?.editable) cells.push({ rowId: row.id, columnKey: column.key, columnLabel: column.label })
      }
    }
    if (!cells.length) return false
    try {
      mutateSheet(sheet.id, (draft) => {
        for (const cell of cells) updateEditableCell(draft, cell, '')
      })
      setError('')
      setStatus(`Cleared ${cells.length} cell${cells.length === 1 ? '' : 's'}`)
      return true
    } catch (reason) {
      setError(reason.message)
      return false
    }
  }, [selectionBounds, rowModel, columns, mutateSheet, sheet.id])

  const getCellClipboardMatrix = useCallback(() => buildCellClipboardMatrix(rowModel, columns, selectionBounds), [selectionBounds, rowModel, columns])

  const attachImageFile = useCallback(async (file, boqCode) => {
    try {
      const target=typeof boqCode==='object'?boqCode:{rowId:null,code:boqCode}
      const code=normalizeAttachmentCode(target.code)
      const validateTarget=()=>{
        const latest=useWorkspaceStore.getState().sheets.find((item)=>item.id===sheet.id)
        return Boolean(latest&&isImageTargetCurrent(latest.data.rows,target.rowId,code))
      }
      const prepared=await prepareImageAttachment(file)
      if(!validateTarget())throw new Error('The selected BQ item changed while the image was being prepared. Select the intended item and try again.')
      await useWorkspaceStore.getState().flushProject(projectId)
      if(!validateTarget())throw new Error('The selected BQ item changed before the image could be saved. Select the intended item and try again.')
      await addImageAttachment({projectId,sheetId:sheet.id,rowId:target.rowId,boqCode:code,validateTarget,...prepared})
      notify(`Image attached to BQ item ${code}.`)
    } catch(error) { notify(error.message,'error') }
  },[projectId,sheet.id])

  const openImagePicker = useCallback((boqCode,rowId=null) => {
    try {
      const code=normalizeAttachmentCode(boqCode)
      const targetRow=rowId?rowsById.get(rowId):sheet.data.rows.find((row)=>normalizeBoqCode(row.boqCode)===code)
      if(!targetRow||normalizeBoqCode(targetRow.boqCode)!==code)throw new Error('Select a cell belonging to the target BQ item first.')
      pendingImageCodeRef.current={rowId:targetRow.id,code}
      imageFileInputRef.current?.click()
    } catch(error) { notify(error.message,'warning') }
  },[rowsById,sheet.data.rows])

  const onImageFileChange = useCallback((event) => {
    const file=event.target.files?.[0]
    event.target.value=''
    const target=pendingImageCodeRef.current
    pendingImageCodeRef.current=null
    if(file&&target)void attachImageFile(file,target)
  },[attachImageFile])

  const onDeleteImage = useCallback(async (imageId) => {
    try { await deleteImageAttachment(imageId); notify('Image deleted.'); return true }
    catch(error) { notify(`Could not delete image: ${error.message}`,'error'); return false }
  },[])

  const openImagePreview = useCallback((attachment) => setImagePreview(attachment), [])

  const onGridCopy = useCallback((event) => {
    if (selectedRowIds.length) {
      const selectedRows = rowModel.filter((row) => selectedRowIdSet.has(row.id))
      const copiedRows = selectedRows.map((tableRow) => tableRow.original)
      rowClipboardRef.current = { rows: copiedRows.map((row) => ({ ...row })) }
      const matrix = buildRowClipboardMatrix(copiedRows, columns)
      if (!matrix.length) return
      event.preventDefault()
      event.clipboardData.setData('text/plain', serializeClipboardMatrix(matrix))
      return
    }
    const matrix = getCellClipboardMatrix()
    if (!matrix.length) return
    if (matrix.length * matrix[0].length > FILL_CELL_LIMIT) {
      notify(`A copy operation cannot exceed ${FILL_CELL_LIMIT.toLocaleString()} cells.`, 'warning')
      return
    }
    cellClipboardRef.current = matrix
    event.preventDefault()
    event.clipboardData.setData('text/plain', serializeClipboardMatrix(matrix))
    setStatus(`Copied ${matrix.length} row${matrix.length === 1 ? '' : 's'} × ${matrix[0].length} column${matrix[0].length === 1 ? '' : 's'}`)
  }, [selectedRowIds.length, selectedRowIdSet, rowModel, columns, getCellClipboardMatrix])

  const onGridCut = useCallback((event) => {
    if (selectedRowIds.length) {
      const selectedRows = rowModel.filter((row) => selectedRowIdSet.has(row.id)).map((tableRow) => tableRow.original)
      if (!selectedRows.length) return
      if (selectedRows.length * columns.length > FILL_CELL_LIMIT) { event.preventDefault(); notify(`A cut operation cannot exceed ${FILL_CELL_LIMIT.toLocaleString()} cells.`, 'warning'); return }
      const matrix = buildRowClipboardMatrix(selectedRows, columns)
      event.preventDefault()
      rowClipboardRef.current = { rows: selectedRows.map((row) => ({ ...row })) }
      event.clipboardData.setData('text/plain', serializeClipboardMatrix(matrix))
      const ids = new Set(selectedRows.map((row) => row.id))
      mutateSheet(sheet.id, (draft) => { draft.rows = draft.rows.filter((row) => !ids.has(row.id)) })
      setSelectedRowIds([])
      setRowSelectionAnchorId(null)
      setActiveSelectedRowId(null)
      return
    }
    const matrix = getCellClipboardMatrix()
    if (!matrix.length) return
    if (matrix.length * matrix[0].length > FILL_CELL_LIMIT) {
      event.preventDefault()
      notify(`A cut operation cannot exceed ${FILL_CELL_LIMIT.toLocaleString()} cells.`, 'warning')
      return
    }
    event.preventDefault()
    cellClipboardRef.current = matrix
    event.clipboardData.setData('text/plain', serializeClipboardMatrix(matrix))
    clearSelectedCells()
  }, [selectedRowIds.length, selectedRowIdSet, rowModel, columns, mutateSheet, sheet.id, getCellClipboardMatrix, clearSelectedCells])

  const onGridPaste = useCallback((event) => {
    const target=event.target
    if(target instanceof HTMLElement&&target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return
    const clipboard = classifyClipboardPaste(event.clipboardData)
    if(clipboard.type==='image'){
      event.preventDefault()
      const file=clipboard.imageItem.getAsFile()
      const row=active?rowsById.get(active.rowId):null
      if(!file){notify('The clipboard image could not be read.','error');return}
      if(!row?.boqCode?.trim()){notify('Select a cell in a coded BQ item before pasting an image.','warning');return}
      void attachImageFile(file,{rowId:row.id,code:row.boqCode})
      return
    }
    if (selectedRowIds.length) return
    const clipboardText = clipboard.text
    event.preventDefault()
    try {
      const matrix = clipboard.source === 'empty' && cellClipboardRef.current
        ? cellClipboardRef.current
        : parseClipboardText(clipboardText)
      cellClipboardRef.current = matrix
      const targets = getPasteTargets(matrix, selectionBounds, columns.length, Boolean(selectionBounds && (selectionBounds.top !== selectionBounds.bottom || selectionBounds.left !== selectionBounds.right)))
      const hasProjection = Boolean(sheet.data.sort || Object.values(filters).some(activeFilter))
      const writes = []
      let requiredRowCount = sheet.data.rows.length
      for (const targetRow of targets) {
        for (const cell of targetRow) {
          const column = columns[cell.columnIndex]
          if (!column?.editable) continue
          let targetRowId = rowModel[cell.rowIndex]?.id
          if (!targetRowId) {
            if (hasProjection) throw new Error('Paste into new rows is unavailable while filters or sorting are active. Clear them and try again.')
            requiredRowCount = Math.max(requiredRowCount, cell.rowIndex + 1)
          }
          const parsed = parseEdit(column.key, cell.value)
          if (parsed.error) throw new Error(`${column.label}, row ${cell.rowIndex + 1}: ${parsed.error}`)
          writes.push({ rowId: targetRowId, rowIndex: cell.rowIndex, columnKey: column.key, value: parsed.value, expression: parsed.expression })
        }
      }
      if (requiredRowCount > ROW_LIMIT) throw new Error(`A worksheet cannot contain more than ${ROW_LIMIT.toLocaleString()} rows.`)
      mutateSheet(sheet.id, (draft) => {
        while (draft.rows.length < requiredRowCount) draft.rows.push(createBlankRow())
        for (const write of writes) {
          const row = write.rowId ? draft.rows.find((item) => item.id === write.rowId) : draft.rows[write.rowIndex]
          if (!row) throw new Error(`Worksheet row ${write.rowIndex + 1} is no longer available.`)
          if (write.columnKey === 'rate') updateWorksheetRowRate(draft, row.id, write.value)
          applyParsedEdit(row, write.columnKey, write)
        }
      })
      setError('')
      setStatus(`Pasted ${writes.length} editable cell${writes.length === 1 ? '' : 's'}`)
      notify(`Pasted ${writes.length} cell${writes.length === 1 ? '' : 's'}.`)
    } catch (reason) {
      setError(reason.message)
      notify(reason.message, 'error')
    }
  }, [selectedRowIds.length, selectionBounds, rowModel, columns, sheet.data.sort, sheet.data.rows.length, filters, mutateSheet, sheet.id, active, rowsById, attachImageFile])

  const startEdit = useCallback((mode = 'existing', initial = '', targetCell = active) => {
    if (!targetCell) return
    const column = columns.find((item) => item.key === targetCell.columnKey)
    if (!column?.editable) return
    const row = rowsById.get(targetCell.rowId)
    if (!row) return
    setEditor({ cell: targetCell, mode, text: mode === 'replace' ? initial : editCellText(row, column.key), caretAtEnd: mode === 'append' })
    setError('')
  }, [active, columns, rowsById])

  const commit = useCallback((move = 0, tab = false, columnDelta = 0, allowReadOnlyTarget = false) => {
    if (!editor) return true
    const column = columns.find((item) => item.key === editor.cell.columnKey)
    const parsed = parseEdit(column.key, editor.text)
    if (parsed.error) { setError(parsed.error); return false }
    try {
      if (column.key === 'rate') {
        mutateSheet(sheet.id, (draft) => {
          updateWorksheetRowRate(draft, editor.cell.rowId, parsed.value)
          const row = draft.rows.find((item) => item.id === editor.cell.rowId)
          applyParsedEdit(row, column.key, parsed)
        })
      } else mutateSheet(sheet.id, (draft) => {
        const row = draft.rows.find((item) => item.id === editor.cell.rowId)
        if (!row) throw new Error('The edited row is no longer available.')
        applyParsedEdit(row, column.key, parsed)
      })
      setEditor(null)
      setError('')
      if (move || columnDelta) {
        let columnIndex = columns.findIndex((item) => item.key === editor.cell.columnKey)
        let rowIndex = rowIndexById.get(editor.cell.rowId) ?? -1
        if (tab) {
          let attempts = 0
          do {
            columnIndex += move
            if (columnIndex < 0) { columnIndex = columns.length - 1; rowIndex-- }
            if (columnIndex >= columns.length) { columnIndex = 0; rowIndex++ }
            attempts++
          } while (rowIndex >= 0 && rowIndex < rowModel.length && !columns[columnIndex].editable && attempts < columns.length * rowModel.length)
        } else if (columnDelta) columnIndex += columnDelta
        else rowIndex += move
        if (rowIndex >= 0 && rowIndex < rowModel.length && columnIndex >= 0 && columnIndex < columns.length && (columns[columnIndex].editable || allowReadOnlyTarget)) {
          select({ rowId: rowModel[rowIndex].id, columnKey: columns[columnIndex].key })
        }
      }
      window.requestAnimationFrame(() => gridRef.current?.focus())
      return true
    } catch (reason) {
      setError(reason.message)
      return false
    }
  }, [editor, columns, mutateSheet, sheet.id, rowIndexById, rowModel, select])
  commitRef.current = () => !editor || commit()

  const move = useCallback((rowDelta, columnDelta, extend = false) => {
    if (activeRowIndex < 0 || activeColumnIndex < 0) return
    const rowIndex = Math.max(0, Math.min(rowModel.length - 1, activeRowIndex + rowDelta))
    const columnIndex = Math.max(0, Math.min(columns.length - 1, activeColumnIndex + columnDelta))
    select({ rowId: rowModel[rowIndex].id, columnKey: columns[columnIndex].key }, extend)
  }, [activeRowIndex, activeColumnIndex, rowModel, columns, select])

  const jumpToEdge = useCallback((rowDelta, columnDelta, extend = false) => {
    if (activeRowIndex < 0 || activeColumnIndex < 0) return
    let rowIndex = activeRowIndex
    let columnIndex = activeColumnIndex

    if (rowDelta) {
      const column = columns[activeColumnIndex]
      rowIndex = findDirectionalEdge(activeRowIndex, rowDelta, rowModel.length, (index) =>
        isBlankCell(getProjectionValue(rowModel[index].original, column.key)))
    } else if (columnDelta) {
      const row = rowModel[activeRowIndex]
      columnIndex = findDirectionalEdge(activeColumnIndex, columnDelta, columns.length, (index) =>
        isBlankCell(getProjectionValue(row.original, columns[index].key)))
    }

    select({ rowId: rowModel[rowIndex].id, columnKey: columns[columnIndex].key }, extend)
  }, [activeRowIndex, activeColumnIndex, rowModel, columns, select])

  const moveTab = useCallback((direction) => {
    let rowIndex = activeRowIndex
    let columnIndex = activeColumnIndex
    for (let attempts = 0; attempts < rowModel.length * columns.length; attempts++) {
      columnIndex += direction
      if (columnIndex < 0) { rowIndex--; columnIndex = columns.length - 1 }
      if (columnIndex >= columns.length) { rowIndex++; columnIndex = 0 }
      if (rowIndex < 0 || rowIndex >= rowModel.length) return
      if (columns[columnIndex].editable) {
        select({ rowId: rowModel[rowIndex].id, columnKey: columns[columnIndex].key })
        return
      }
    }
  }, [activeRowIndex, activeColumnIndex, rowModel, columns, select])

  const onGridKeyDown = (event) => {
    const modifier = event.ctrlKey || event.metaKey
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault(); event.stopPropagation()
      if (editor && !commit()) return
      useWorkspaceStore.getState().flushProject(projectId).then(() => notify('Workbook saved.')).catch((reason) => notify(`Save failed: ${reason.message}`, 'error'))
      return
    }
    const addRowShortcut = event.key === '+' || (event.key === '=' && event.shiftKey) || event.code === 'NumpadAdd'
    const deleteRowShortcut = event.key === '-' || (event.key === '_' && event.shiftKey) || event.code === 'NumpadSubtract'
    if (modifier && (addRowShortcut || deleteRowShortcut)) {
      event.preventDefault()
      event.stopPropagation()
      if (editor && !commit()) return
      if (addRowShortcut) insertAboveActiveRow()
      else deleteActiveRow()
      return
    }
    if (event.target === editorRef.current) {
      if (['resource', 'remark'].includes(editorColumnKey) && event.key === 'Enter' && event.altKey) {
        event.stopPropagation()
        return
      }
      if (suggestionValues.length && (event.ctrlKey || event.metaKey) && !event.altKey && event.key === 'ArrowDown') {
        event.preventDefault(); setActiveSuggestion((current) => Math.min(current + 1, suggestionValues.length - 1)); return
      }
      if (suggestionValues.length && (event.ctrlKey || event.metaKey) && !event.altKey && event.key === 'ArrowUp' && activeSuggestion >= 0) {
        event.preventDefault(); setActiveSuggestion((current) => Math.max(current - 1, 0)); return
      }
      if (activeSuggestion >= 0 && event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation()
        setEditor((current) => current ? { ...current, text: suggestionValues[activeSuggestion] } : current)
        setActiveSuggestion(-1)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault(); setEditor(null); setError('')
        window.requestAnimationFrame(() => gridRef.current?.focus())
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        const deltas = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
        const [rowDelta, columnDelta] = deltas[event.key]
        commit(rowDelta, false, columnDelta, true)
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault(); commit(event.shiftKey ? -1 : 1, event.key === 'Tab')
      }
      return
    }
    if (event.target !== gridRef.current) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      const cleared = clearSelectedCells()
      if (event.key === 'Backspace' && cleared && active && columns.find((column) => column.key === active.columnKey)?.editable) {
        setEditor({ cell: active, mode: 'replace', text: '' })
      }
      return
    }
    if (modifier && event.key.toLowerCase() === 'c' && selectedRowIds.length) return
    if (modifier && event.key.toLowerCase() === 'v' && selectedRowIds.length) {
      event.preventDefault()
      event.stopPropagation()
      if (!rowClipboardRef.current?.rows?.length) {
        notify('Copy worksheet rows first, then select destination rows and paste.', 'warning')
        return
      }
      const copied = rowClipboardRef.current
      const newRows = copied.rows.map((row) => ({ ...row, id: createId() }))
      const activeIndex = active ? sheet.data.rows.findIndex((row) => row.id === active.rowId) : -1
      const insertionIndex = activeIndex < 0 ? sheet.data.rows.length : activeIndex
      try {
        mutateSheet(sheet.id, (draft) => {
          draft.rows.splice(insertionIndex, 0, ...newRows)
        })
        const newIds = newRows.map((row) => row.id)
        setSelectedRowIds(newIds)
        setRowSelectionAnchorId(newIds[0])
        setActiveSelectedRowId(newIds.at(-1))
        setFocusAfterInsertId(newIds[0])
        notify(`Pasted ${newRows.length} row${newRows.length === 1 ? '' : 's'}.`)
      } catch (reason) { notify(reason.message, 'error') }
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.shiftKey ? redoSheet(sheet.id) : undoSheet(sheet.id); return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redoSheet(sheet.id); return }
    if (event.key === 'F2') { event.preventDefault(); startEdit('select'); return }
    if (event.key === 'Enter') { event.preventDefault(); move(event.shiftKey ? -1 : 1, 0); return }
    if (event.key === 'Tab') { event.preventDefault(); moveTab(event.shiftKey ? -1 : 1); return }
    if (event.key === 'Home') {
      event.preventDefault()
      if (modifier) select({ rowId: rowModel[0]?.id, columnKey: columns[0]?.key })
      else if (active) select({ rowId: active.rowId, columnKey: columns[0]?.key })
      return
    }
    if (event.key === 'End' && modifier) { event.preventDefault(); select({ rowId: rowModel.at(-1)?.id, columnKey: columns.at(-1)?.key }); return }
    const offsets = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (offsets[event.key]) {
      event.preventDefault()
      if (modifier) jumpToEdge(...offsets[event.key], event.shiftKey)
      else move(...offsets[event.key], event.shiftKey)
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && columns.find((item) => item.key === active?.columnKey)?.editable) {
      event.preventDefault(); startEdit('replace', event.key)
    }
  }

  const applyFilter = useCallback((columnKey, nextFilter) => {
    mutateSheet(sheet.id, (draft) => { draft.filters[columnKey] = nextFilter })
  }, [mutateSheet, sheet.id])

  const setSort = useCallback((columnIndex, direction) => {
    mutateSheet(sheet.id, (draft) => { draft.sort = direction ? { col: columnIndex, direction } : null })
    setOpenFilterKey(null)
  }, [mutateSheet, sheet.id])

  const setColumnWidth = useCallback((columnIndex, width) => {
    const bounded = Math.round(Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, width)))
    mutateSheet(sheet.id, (draft) => { draft.columnWidths[columnIndex] = bounded })
  }, [mutateSheet, sheet.id])

  const insertRow = useCallback((afterActive) => {
    if (sheet.data.rows.length >= ROW_LIMIT) { notify(`A worksheet cannot contain more than ${ROW_LIMIT.toLocaleString()} rows.`, 'warning'); return }
    const row = createBlankRow()
    const hasActiveFilters = Object.values(filters).some(activeFilter)
    let contextRow = (active && rowModel.find((item) => item.id === active.rowId)) ?? rowModel[0]
    if (hasActiveFilters) {
      if (!contextRow) { notify('No visible row is available as a source, so the row was not added.', 'warning'); return }
      const insertion = getInsertionValuesFromRow(contextRow.original, filters)
      if (!insertion.suitable) { notify(insertion.reason, 'warning'); return }
      Object.assign(row, insertion.values)
    }
    if (afterActive) {
      contextRow = rowModel.find((item) => item.id === active?.rowId) ?? contextRow
      if (contextRow) {
      row.boqCode = normalizeBoqCode(contextRow?.original.boqCode)
        row.boqQty = contextRow.original.boqQty
      }
    }
    const originalIndex = afterActive ? sheet.data.rows.findIndex((item) => item.id === active?.rowId) : -1
    const insertionIndex = originalIndex < 0 ? sheet.data.rows.length : originalIndex + 1
    let clearedSort = false
    try {
      mutateSheet(sheet.id, (draft) => {
        draft.rows.splice(insertionIndex, 0, row)
        if (afterActive && draft.sort) { draft.sort = null; clearedSort = true }
        if (hasActiveFilters) {
          const visible = projectVisibleRowIds(draft.rows, draft.filters, draft.sort)
          if (!visible.includes(row.id)) throw new Error('The new row would not match the active filters, so it was not added.')
        }
      })
      if (clearedSort) notify('Sorting was cleared so the row stays directly below the active row.', 'warning')
      setFocusAfterInsertId(row.id)
    } catch (reason) {
      notify(reason.message, 'error')
    }
  }, [sheet.data.rows, sheet.data.filters, sheet.id, active, rowModel, filters, mutateSheet])

  const insertAboveActiveRow = useCallback(() => {
    if (!active) { notify('Select a worksheet row before inserting above it.', 'warning'); return }
    if (sheet.data.rows.length >= ROW_LIMIT) { notify(`A worksheet cannot contain more than ${ROW_LIMIT.toLocaleString()} rows.`, 'warning'); return }
    const row = createBlankRow()
    const contextRow = rowModel.find((item) => item.id === active.rowId)
    const hasActiveFilters = Object.values(filters).some(activeFilter)
    if (hasActiveFilters) {
      if (!contextRow) { notify('No visible row is available as a source, so the row was not added.', 'warning'); return }
      const insertion = getInsertionValuesFromRow(contextRow.original, filters)
      if (!insertion.suitable) { notify(insertion.reason, 'warning'); return }
      Object.assign(row, insertion.values)
    }
    row.boqCode = normalizeBoqCode(contextRow?.original.boqCode)
    row.boqQty = contextRow?.original.boqQty ?? null
    const originalIndex = sheet.data.rows.findIndex((item) => item.id === active.rowId)
    if (originalIndex < 0) { notify('The selected row is no longer available.', 'warning'); return }
    let clearedSort = false
    try {
      mutateSheet(sheet.id, (draft) => {
        draft.rows.splice(originalIndex, 0, row)
        if (draft.sort) { draft.sort = null; clearedSort = true }
        if (hasActiveFilters && !projectVisibleRowIds(draft.rows, draft.filters, draft.sort).includes(row.id)) {
          throw new Error('The new row would not match the active filters, so it was not added.')
        }
      })
      if (clearedSort) notify('Sorting was cleared so the new row appears above the selected row.', 'warning')
      setFocusAfterInsertId(row.id)
    } catch (reason) { notify(reason.message, 'error') }
  }, [sheet.data.rows, sheet.data.filters, sheet.id, active, rowModel, filters, mutateSheet])

  const deleteActiveRow = useCallback(() => {
    const idsToDelete = selectedRowIds.length ? selectedRowIds : active ? [active.rowId] : []
    if (!idsToDelete.length) { notify('Select a worksheet row before deleting it.', 'warning'); return }
    if (idsToDelete.length > sheet.data.rows.length) { notify('The selected rows are no longer available.', 'warning'); return }
    const deleting = new Set(idsToDelete)
    const firstVisibleIndex = rowModel.findIndex((row) => deleting.has(row.id))
    const nextVisibleRowId = rowModel.slice(Math.max(0, firstVisibleIndex)).find((row) => !deleting.has(row.id))?.id
      ?? [...rowModel.slice(0, Math.max(0, firstVisibleIndex))].reverse().find((row) => !deleting.has(row.id))?.id
      ?? null
    try {
      mutateSheet(sheet.id, (draft) => {
        const beforeCount = draft.rows.length
        draft.rows = draft.rows.filter((item) => !deleting.has(item.id))
        if (draft.rows.length === beforeCount) throw new Error('The selected rows are no longer available.')
      })
      setSelectedRowIds([])
      setRowSelectionAnchorId(null)
      setActiveSelectedRowId(null)
      setFocusAfterInsertId(nextVisibleRowId)
      window.requestAnimationFrame(() => gridRef.current?.focus())
    } catch (reason) { notify(reason.message, 'error') }
  }, [selectedRowIds, active, rowModel, sheet.data.rows.length, sheet.id, mutateSheet])

  const addRow = useCallback(() => insertRow(false), [insertRow])
  const insertBelow = useCallback(() => insertRow(true), [insertRow])
  const addImage = useCallback(() => {
    const row=active?rowsById.get(active.rowId):null
    openImagePicker(row?.boqCode,row?.id)
  },[active,rowsById,openImagePicker])
  useEffect(() => {
    if (!actionsRef) return undefined
    actionsRef.current = { addRow, insertBelow, openFind, addImage }
    return () => { if (actionsRef.current?.addRow === addRow) actionsRef.current = null }
  }, [actionsRef, addRow, insertBelow, openFind, addImage])

  useEffect(() => {
    if (!focusAfterInsertId) return
    const rowIndex = rowIndexById.get(focusAfterInsertId)
    if (rowIndex === undefined) {
      if (sheet.data.rows.some((row) => row.id === focusAfterInsertId)) {
        setFocusAfterInsertId(null)
        window.requestAnimationFrame(() => gridRef.current?.focus())
      }
      return
    }
    const nextCell = { rowId: focusAfterInsertId, columnKey: columns.find((column) => column.editable)?.key }
    setActive(nextCell); setAnchor(nextCell); setExtent(nextCell)
    virtualizer.scrollToIndex(rowIndex, { align: 'auto' })
    window.requestAnimationFrame(() => gridRef.current?.focus())
    setFocusAfterInsertId(null)
  }, [focusAfterInsertId, rowIndexById, sheet.data.rows, columns, virtualizer, setActive, setAnchor, setExtent])

  useEffect(() => {
    if (!resizePreview) return undefined
    const onMove = (event) => {
      if (event.pointerId !== resizePreview.pointerId) return
      setResizePreview((current) => current ? { ...current, width: Math.round(Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, current.startWidth + event.clientX - current.startX))) } : null)
    }
    const onUp = (event) => {
      if (event.pointerId !== resizePreview.pointerId) return
      const width = Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, resizePreview.width))
      if (width !== resizePreview.startWidth) setColumnWidth(resizePreview.index, width)
      setResizePreview(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [resizePreview, setColumnWidth])

  const beginResize = (event, column) => {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus()
    setResizePreview({ index: column.index, pointerId: event.pointerId, startX: event.clientX, startWidth: column.size, width: column.size })
  }

  const keyboardResize = (event, column) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    setColumnWidth(column.index, column.size + (event.key === 'ArrowRight' ? 10 : -10))
  }

  const activeFilterCount = Object.values(filters).filter(activeFilter).length
  const activeRow = active ? rowsById.get(active.rowId) : null
  const formulaValue = editor && editor.cell.rowId === active?.rowId && editor.cell.columnKey === active?.columnKey
    ? editor.text
    : activeRow && ['cqbi', 'cr', 'rate', 'override', 'boqQty'].includes(active.columnKey)
      ? activeRow.expressions?.[active.columnKey] ?? formatNumber(activeRow[active.columnKey], {
        decimals: active.columnKey === 'boqQty' ? preferences?.quantityDecimals : INPUT_NUMBER_DISPLAY_DECIMALS,
        useGrouping: preferences?.useGrouping,
      })
      : active ? editCellText(activeRow, active.columnKey) : ''
  const formulaEditorProps = {
    'aria-label': 'Formula bar',
    value: formulaValue,
    disabled: !active || !columns[activeColumnIndex]?.editable,
    onChange: (event) => {
      if (!editor) startEdit('existing')
      setEditor((current) => current ? { ...current, source: 'formula', text: event.target.value } : { cell: active, mode: 'existing', source: 'formula', text: event.target.value })
      setError('')
    },
    onBlur: () => { if (editor) commit() },
    onKeyDown: (event) => {
      if (['resource', 'remark'].includes(active?.columnKey) && event.key === 'Enter' && event.altKey) { event.stopPropagation(); return }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        const deltas = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
        const [rowDelta, columnDelta] = deltas[event.key]
        commit(rowDelta, false, columnDelta, true)
      } else if (event.key === 'Enter') { event.preventDefault(); commit(event.shiftKey ? -1 : 1) }
      if (event.key === 'Escape') { setEditor(null); setError('') }
    },
  }

  return <div className="grid-shell">
    <input ref={imageFileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={onImageFileChange} aria-label="Choose image to attach to BQ item" />
    <div className="formula-bar">
      <label>Name box<input aria-label="Active cell address" readOnly value={active ? `${columns[activeColumnIndex]?.letter ?? ''}${activeRowIndex + 1}` : ''} /></label>
      {['resource', 'remark'].includes(active?.columnKey)
        ? <textarea className="formula-resource-editor" title="Alt+Enter inserts a line break · Enter commits" rows={Math.min(4, Math.max(1, formulaValue.split('\n').length))} {...formulaEditorProps} />
        : <input {...formulaEditorProps} />}
      {error && <span role="alert">{error}</span>}
      {showHistoryControls && <><button type="button" aria-label="Undo" onClick={() => undoSheet(sheet.id)}>Undo</button><button type="button" aria-label="Redo" onClick={() => redoSheet(sheet.id)}>Redo</button></>}
      <span className="grid-filter-summary" aria-live="polite">{activeFilterCount ? `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active · ${rowModel.length} of ${sheet.data.rows.length} rows` : ''}</span>
    </div>
    <div className="grid-header" ref={headerRef} style={{ gridTemplateColumns: `${gutterWidth}px ${columns.map((column) => `${column.size}px`).join(' ')}` }}>
      <div className="grid-header-gutter">#</div>
      {table.getHeaderGroups().flatMap((group) => group.headers.map((header) => {
        const column = header.column.columnDef.meta
        const filter = filters[column.key] ?? DEFAULT_FILTER
        const isFiltered = activeFilter(filter)
        const sortDirection = sheet.data.sort?.col === column.index ? sheet.data.sort.direction : null
        return <div className={`column-header${isFiltered ? ' has-filter' : ''}`} key={header.id}>
          <span className="column-heading-text" title={column.label}><small>{column.letter}</small><b>{column.label}</b></span>
          <button
            type="button"
            className="column-filter-trigger"
            ref={(node) => { filterButtonRefs.current[column.key] = node }}
            aria-label={`Filter ${column.label}${isFiltered ? ', filter active' : ''}`}
            aria-expanded={openFilterKey === column.key}
            title={`Filter ${column.label}`}
            onClick={() => setOpenFilterKey((current) => current === column.key ? null : column.key)}
          >{sortDirection ? (sortDirection === 'asc' ? <ArrowUpAZ /> : <ArrowDownAZ />) : <Filter />}</button>
          <div
            className="column-resize-handle"
            role="separator"
            aria-label={`Resize ${column.label} column`}
            aria-orientation="vertical"
            aria-valuemin={COLUMN_WIDTH_MIN}
            aria-valuemax={COLUMN_WIDTH_MAX}
            aria-valuenow={column.size}
            aria-valuetext={`${column.size} pixels`}
            tabIndex={0}
            onPointerDown={(event) => beginResize(event, column)}
            onKeyDown={(event) => keyboardResize(event, column)}
            onDoubleClick={() => setColumnWidth(column.index, COLUMN_DEFINITIONS[column.index].defaultWidth)}
          />
          {openFilterKey === column.key && <FilterMenu
            key={column.key}
            column={column}
            rows={sheet.data.rows}
            currentFilter={filter}
            sortDirection={sortDirection}
            hasSort={Boolean(sheet.data.sort)}
            onApply={(next) => { applyFilter(column.key, next); setOpenFilterKey(null) }}
            onClear={() => { applyFilter(column.key, { ...DEFAULT_FILTER }); setOpenFilterKey(null) }}
            onSort={(direction) => setSort(column.index, direction)}
            onClose={() => setOpenFilterKey(null)}
            triggerElement={filterButtonRefs.current[column.key]}
          />}
        </div>
      }))}
    </div>
    <div className="grid-scroll" ref={parentRef} onScroll={(event) => {
      scrollPositionRef.current = { scrollTop: event.currentTarget.scrollTop, scrollLeft: event.currentTarget.scrollLeft }
      setAssemblyContextMenu(null)
      hoveredBoqCodeRef.current = ''
      if (resourceShortcutSequenceRef.current?.timeout) clearTimeout(resourceShortcutSequenceRef.current.timeout)
      resourceShortcutSequenceRef.current = null
      setCostSummaryTooltip(null)
      if (headerRef.current) headerRef.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`
      scheduleGridPositionWrite()
    }}>
     <div className={`grid-spacer${dragSelecting ? ' is-drag-selecting' : ''}${fillDrag ? ' is-fill-dragging' : ''}`} ref={gridRef} role="grid" tabIndex={0} aria-label="Cost worksheet" aria-rowcount={rowModel.length} aria-colcount={columns.length} style={{ height: `${virtualizer.getTotalSize()}px` }} onKeyDown={onGridKeyDown} onCopy={onGridCopy} onCut={onGridCut} onPaste={onGridPaste} onFocus={() => setStatus(active ? `${columns[activeColumnIndex]?.label}, row ${activeRowIndex + 1}` : 'Worksheet grid')}>
         {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rowModel[virtualRow.index]
            // The row model can shrink during PP replacement before the virtualizer
            // has discarded its previous range. Ignore any now-stale indexes.
            if (!row) return null
            const code = normalizeBoqCode(row.original.boqCode)
           const group = visibleBoqGroups.get(row.id)
          const isFillCornerRow = selectionBounds?.bottom === virtualRow.index
          return <div
            role="row"
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            aria-rowindex={virtualRow.index + 1}
             className={`grid-row${group ? ` has-boq-group boq-group-tone-${group.tone}${group.startsGroup ? ' boq-group-start' : ''}` : ''}${selectedRowIdSet.has(row.id) ? ' is-row-selected' : ''}${activeSelectedRowId === row.id ? ' is-active-row' : ''}`}
               key={row.id}
                style={{ transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: `${gutterWidth}px ${columns.map((column) => `${column.size}px`).join(' ')}` }}
                 onContextMenu={(event) => {
                 if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return
                 event.preventDefault()
                 setAssemblyContextMenu({ x: event.clientX, y: event.clientY, boqCode: code })
               }}
           >
            <span
              className="row-gutter"
              role="button"
              tabIndex={0}
              aria-label={`Select row ${virtualRow.index + 1}`}
              aria-pressed={selectedRowIdSet.has(row.id)}
               title="Click to select row · Shift-click for range · Ctrl-click to toggle"
               onPointerEnter={() => { hoveredBoqCodeRef.current = code }}
               onPointerLeave={() => {
                 if (hoveredBoqCodeRef.current === code) hoveredBoqCodeRef.current = ''
                 const sequence = resourceShortcutSequenceRef.current
                 if (sequence?.timeout) clearTimeout(sequence.timeout)
                 resourceShortcutSequenceRef.current = null
               }}
               onClick={(event) => selectRowFromGutter(event, row.id, virtualRow.index)}
               onKeyDown={(event) => {
                 if (event.key === 'Enter' || event.key === ' ') selectRowFromGutter(event, row.id, virtualRow.index)
                 if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                   event.preventDefault()
                   const rect = event.currentTarget.getBoundingClientRect()
                   setAssemblyContextMenu({ x: rect.left, y: rect.bottom, boqCode: code })
                 }
               }}
             >{virtualRow.index + 1}</span>
            {row.getAllCells().map((cell, visibleColumnIndex) => {
              const column = cell.column.columnDef.meta
              const isActive = active?.rowId === row.id && active?.columnKey === column.key
              const isFindMatch = findOpen && findMatches.some((match) => match.rowId === row.id && match.columnKey === column.key)
              const isCurrentFindMatch = isFindMatch && currentFindIndex >= 0 && findMatches[currentFindIndex]?.rowId === row.id && findMatches[currentFindIndex]?.columnKey === column.key
              const isFillHandleCell = !selectedRowIds.length && !editor && isFillCornerRow
                && fillHandleColumnIndex === visibleColumnIndex && column.editable
              const previewSourceColumnIndex = fillDrag?.axis === 'horizontal' && fillDrag.preview
                ? fillDrag.sourceBounds.left + ((visibleColumnIndex - fillDrag.sourceBounds.left) % (fillDrag.sourceBounds.right - fillDrag.sourceBounds.left + 1))
                : visibleColumnIndex
              const inFillPreview = Boolean(fillDrag?.preview
                && virtualRow.index >= fillDrag.preview.top && virtualRow.index <= fillDrag.preview.bottom
                && visibleColumnIndex >= fillDrag.preview.left && visibleColumnIndex <= fillDrag.preview.right
                && column.editable && columns[previewSourceColumnIndex]?.editable
                && !(virtualRow.index >= fillDrag.sourceBounds.top && virtualRow.index <= fillDrag.sourceBounds.bottom
                  && visibleColumnIndex >= fillDrag.sourceBounds.left && visibleColumnIndex <= fillDrag.sourceBounds.right))
              return <span
                role="gridcell"
                aria-selected={selected(row.id, column.key)}
                key={cell.id}
                data-grid-row-index={virtualRow.index}
                data-grid-column-index={visibleColumnIndex}
                   className={`${column.derived ? 'derived-cell ' : ''}${['resource', 'remark'].includes(column.key) ? 'multiline-cell ' : ''}${isActive ? 'active-cell ' : ''}${selected(row.id, column.key) ? 'selected-cell ' : ''}${isFindMatch ? 'find-hit ' : ''}${isCurrentFindMatch ? 'find-hit-current ' : ''}${inFillPreview ? 'fill-preview-cell ' : ''}${column.key === 'boqCode' && group ? 'boq-code-cell' : ''}`}
                  title={column.key === 'totalCost' ? 'Hover for BQ item cost summary' : column.derived ? 'Calculated value' : undefined}
                  onPointerMove={(event) => {
                   if (column.key !== 'totalCost' || !costSummaryTooltip) return
                   setCostSummaryTooltip((current) => current ? {
                     ...current,
                     left: Math.max(8, Math.min(event.clientX + 14, window.innerWidth - 248)),
                      top: Math.max(8, Math.min(event.clientY + 14, window.innerHeight - 160)),
                   } : current)
                 }}
                 onPointerLeave={() => { if (column.key === 'totalCost') setCostSummaryTooltip(null) }}
                 onClick={(event) => {
                   if (event.target === editorRef.current) return
                   setSelectedRowIds([])
                  setRowSelectionAnchorId(null)
                  setActiveSelectedRowId(null)
                  gridRef.current?.focus()
                  select({ rowId: row.id, columnKey: column.key }, event.shiftKey)
                }}
                 onPointerDown={(event) => {
                   if (event.target === editorRef.current) return
                   if (event.button !== 0 || event.shiftKey) return
                  setSelectedRowIds([])
                  setRowSelectionAnchorId(null)
                  setActiveSelectedRowId(null)
                  dragSelectionRef.current = true
                  setDragSelecting(true)
                  select({ rowId: row.id, columnKey: column.key })
                  gridRef.current?.focus()
                }}
                 onPointerEnter={(event) => {
                   if (column.key === 'totalCost') {
                     const code = normalizeBoqCode(row.original.boqCode)
                     const summary = boqItemCostSummaries.get(code)
                     if (summary) {
                       const left = Math.max(8, Math.min(event.clientX + 14, window.innerWidth - 248))
                        const top = Math.max(8, Math.min(event.clientY + 14, window.innerHeight - 160))
                      setCostSummaryTooltip({
                        ...summary,
                        unitCostPerCqbi: unitCostPerCqbi(summary.unitCost, firstCqbiByCode.get(code)),
                        left,
                        top,
                      })
                     }
                   }
                   if (!dragSelectionRef.current || event.buttons !== 1) return
                  select({ rowId: row.id, columnKey: column.key }, true)
                }}
                 onDoubleClick={(event) => {
                   if (event.target === editorRef.current) return
                    gridRef.current?.focus()
                  const cell = { rowId: row.id, columnKey: column.key }
                  select(cell)
                   if (column.editable) startEdit('append', '', cell)
                }}
              >
                {editor?.cell.rowId === row.id && editor?.cell.columnKey === column.key
                  ? <>
                     {['resource', 'remark'].includes(column.key)
                       ? <textarea ref={editorRef} className="cell-editor multiline-cell-editor" title="Alt+Enter inserts a line break · Enter commits" rows={Math.max(1, editor.text.split('\n').length)} aria-label={`Edit ${column.label}, row ${virtualRow.index + 1}`} aria-invalid={Boolean(error)} aria-describedby={error ? 'grid-edit-error' : undefined} value={editor.text} onChange={(event) => { setEditor({ ...editor, text: event.target.value }); setError(''); setActiveSuggestion(-1) }} onBlur={() => commit()} onKeyDown={onGridKeyDown} />
                       : <input ref={editorRef} className="cell-editor" autoComplete="off" aria-autocomplete={suggestionValues.length ? 'list' : undefined} aria-controls={suggestionValues.length ? 'cell-suggestion-list' : undefined} aria-expanded={Boolean(suggestionValues.length)} aria-label={`Edit ${column.label}, row ${virtualRow.index + 1}`} aria-invalid={Boolean(error)} aria-describedby={error ? 'grid-edit-error' : undefined} value={editor.text} onChange={(event) => { setEditor({ ...editor, text: event.target.value }); setError(''); setActiveSuggestion(-1) }} onBlur={() => commit()} onKeyDown={onGridKeyDown} />}
                  </>
                    : <>{valueFor(row.original, column.key,preferences)}{column.key === 'usedCost' && row.original.override !== null && <small> overridden</small>}</>}
                 {isFillHandleCell && <span className="fill-handle" aria-hidden="true" title="Drag to fill cells" onPointerDown={beginFillDrag} />}
               </span>
             })}
             {showImages&&lastVisibleIndexByCode.get(code)===virtualRow.index&&imageAttachmentsByCode.get(code)?.length>0&&<div className="boq-image-gallery-row" style={{gridColumn:'1 / -1'}}>
                <BoqImageGallery attachments={imageAttachmentsByCode.get(code)} showImages={showImages} onPreview={openImagePreview} onDeleteRequest={setImageDeleteTarget} onAddImage={()=>openImagePicker(code)} onImageLoad={(event)=>{const element=event.currentTarget.closest('[data-index]');if(element)virtualizer.measureElement(element)}} />
             </div>}
           </div>
        })}
      </div>
      {!sheet.data.rows.length && <div className="cost-grid-empty" role="status"><strong>No BOQ items yet</strong><span>Add a row or import an Excel Cost Load to get started.</span></div>}
      </div>
      {imagePreview&&<BoqImagePreview
        attachment={imagePreview}
        attachments={imageAttachmentsByCode.get(imagePreview.boqCode) ?? [imagePreview]}
        onClose={()=>setImagePreview(null)}
        onDeleteRequest={(attachment)=>{setImageDeleteTarget(attachment);setImagePreview(null)}}
      />}
      {imageDeleteTarget&&<ConfirmDialog title="Delete attached image?" danger confirmLabel="Delete image" onClose={()=>setImageDeleteTarget(null)} onConfirm={async()=>{if(await onDeleteImage(imageDeleteTarget.id))setImageDeleteTarget(null)}}>This removes the image from BQ item <strong>{imageDeleteTarget.boqCode}</strong>.</ConfirmDialog>}
    {costSummaryTooltip && createPortal(<div className="boq-cost-summary-tooltip" role="tooltip" style={{ left: costSummaryTooltip.left, top: costSummaryTooltip.top }}>
      <strong className="boq-cost-summary-code">{costSummaryTooltip.code}</strong>
      <span><small>Unit Cost</small><b>{formatNumber(costSummaryTooltip.unitCost, { decimals: preferences?.costDecimals, useGrouping: preferences?.useGrouping }) || '—'}{preferences?.currencyLabel ? ` ${preferences.currencyLabel}` : ''}</b></span>
      <span><small>Total Cost</small><b>{formatNumber(costSummaryTooltip.totalCost, { decimals: preferences?.costDecimals, useGrouping: preferences?.useGrouping }) || '—'}{preferences?.currencyLabel ? ` ${preferences.currencyLabel}` : ''}</b></span>
      <span><small>Unit Cost / CQBI</small><b>{formatNumber(costSummaryTooltip.unitCostPerCqbi, { decimals: preferences?.costDecimals, useGrouping: preferences?.useGrouping }) || '—'}{preferences?.currencyLabel ? ` ${preferences.currencyLabel}` : ''}</b></span>
     </div>, document.body)}
     {assemblyContextMenu && createPortal(<div className="assembly-context-menu" role="menu" style={{ left: Math.min(assemblyContextMenu.x, window.innerWidth - 250), top: Math.min(assemblyContextMenu.y, window.innerHeight - 70) }}>
       <button ref={assemblyContextMenuButtonRef} type="button" role="menuitem" disabled={!assemblyContextMenu.boqCode || !onRequestSaveAssembly} onClick={() => { const request = { sheetId: sheet.id, boqCode: assemblyContextMenu.boqCode }; setAssemblyContextMenu(null); onRequestSaveAssembly?.(request) }}>Save BOQ item as assembly</button>
     </div>, document.body)}
     {suggestionPosition && suggestionValues.length > 0 && createPortal(<div className="cell-suggestion-popup" style={suggestionPosition}>
      <div className="cell-suggestion-heading">{editorColumnKey === 'unit' ? 'Suggested units' : 'Suggestions'} <span>{suggestionValues.length}</span></div>
      <div id="cell-suggestion-list" role="listbox" aria-label={editorColumnKey === 'unit' ? 'Common unit suggestions' : 'Previous cell values'}>
        {suggestionValues.map((value, index) => <button type="button" role="option" aria-selected={activeSuggestion === index} className={activeSuggestion === index ? 'is-active' : ''} key={value} onPointerDown={(event) => event.preventDefault()} onClick={() => { setEditor((current) => current ? { ...current, text: value } : current); setActiveSuggestion(-1); editorRef.current?.focus() }}>
          <span className="cell-suggestion-mark">↳</span><span>{value}</span><kbd>{index + 1}</kbd>
        </button>)}
      </div>
      <div className="cell-suggestion-hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate <span>·</span> <kbd>Enter</kbd> Use suggestion</div>
    </div>, document.body)}
     {findOpen && <FindReplaceDialog
       onClose={closeFind} findInputRef={findInputRef} replaceInputRef={replaceInputRef}
       findText={findText} onFindTextChange={(event) => { setFindText(event.target.value); setCurrentFindIndex(-1); setFindMessage('') }}
       currentFindIndex={currentFindIndex} findMatches={findMatches} goToFindMatch={goToFindMatch}
       showReplace={showReplace} replaceWith={replaceWith} onReplaceWithChange={(event) => setReplaceWith(event.target.value)}
       replaceCurrentMatch={replaceCurrentMatch} replaceAllMatches={replaceAllMatches} findMatchCount={findMatchCount}
       findSelectionOnly={findSelectionOnly} findMatchCase={findMatchCase} onMatchCaseChange={(event) => { setFindMatchCase(event.target.checked); setCurrentFindIndex(-1) }}
       findEntireCell={findEntireCell} onEntireCellChange={(event) => { setFindEntireCell(event.target.checked); setCurrentFindIndex(-1) }}
       findSelectionCandidate={findSelectionCandidate} setFindSelectionScope={setFindSelectionScope}
       onToggleReplace={() => setShowReplace((visible) => !visible)} findMessage={findMessage}
     />}
    <div id="grid-edit-error" className="grid-status" aria-live="polite">{error || status || `${rowModel.length.toLocaleString()} rows`}</div>
  </div>
}
