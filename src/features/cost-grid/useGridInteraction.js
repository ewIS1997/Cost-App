import { useMemo, useState } from 'react'

const firstCell=(rows,columns)=>rows.length&&columns.length?{rowId:rows[0].id,columnKey:(columns.find((column)=>column.editable)||columns[0]).key}:null
export function useGridInteraction(_sheetId,rows,columns,initialSelection=null) {
  const initial=firstCell(rows,columns)
  const validInitialCell=(cell)=>cell&&rows.some((row)=>row.id===cell.rowId)&&columns.some((column)=>column.key===cell.columnKey)?cell:null
  const active=validInitialCell(initialSelection?.active)||initial
  const anchor=validInitialCell(initialSelection?.anchor)||active
  const extent=validInitialCell(initialSelection?.extent)||active
  const [selection,setSelection]=useState(()=>({sheetId:_sheetId,active,anchor,extent}))
  const current=selection.sheetId===_sheetId?selection:{sheetId:_sheetId,active:initial,anchor:initial,extent:initial}
  const activeCell=current.active,anchorCell=current.anchor,extentCell=current.extent
  const setActiveCell=(cell)=>setSelection((state)=>({...state,sheetId:_sheetId,active:cell}))
  const setAnchorCell=(cell)=>setSelection((state)=>({...state,sheetId:_sheetId,anchor:cell}))
  const setExtentCell=(cell)=>setSelection((state)=>({...state,sheetId:_sheetId,extent:cell}))
  const activeValid=activeCell&&rows.some((row)=>row.id===activeCell.rowId)&&columns.some((column)=>column.key===activeCell.columnKey)
  const anchorValid=anchorCell&&rows.some((row)=>row.id===anchorCell.rowId)&&columns.some((column)=>column.key===anchorCell.columnKey)
  const extentValid=extentCell&&rows.some((row)=>row.id===extentCell.rowId)&&columns.some((column)=>column.key===extentCell.columnKey)
  const repairedActive=activeValid?activeCell:firstCell(rows,columns)
  const repairedAnchor=anchorValid?anchorCell:repairedActive
  const repairedExtent=extentValid?extentCell:repairedActive
  const bounds=useMemo(()=>{
    if(!repairedAnchor||!repairedExtent)return null
    const a=rows.findIndex((row)=>row.id===repairedAnchor.rowId),b=rows.findIndex((row)=>row.id===repairedExtent.rowId)
    const c=columns.findIndex((column)=>column.key===repairedAnchor.columnKey),d=columns.findIndex((column)=>column.key===repairedExtent.columnKey)
    return {top:Math.min(a,b),bottom:Math.max(a,b),left:Math.min(c,d),right:Math.max(c,d)}
  },[rows,columns,repairedAnchor,repairedExtent])
  const rowIndexById=useMemo(()=>new Map(rows.map((row,index)=>[row.id,index])),[rows])
  const columnIndexByKey=useMemo(()=>new Map(columns.map((column,index)=>[column.key,index])),[columns])
  const isSelected=(rowId,key)=>{if(!bounds)return false;const row=rowIndexById.get(rowId)??-1,column=columnIndexByKey.get(key)??-1;return row>=bounds.top&&row<=bounds.bottom&&column>=bounds.left&&column<=bounds.right}
   return {activeCell:repairedActive,setActiveCell,anchorCell:repairedAnchor,setAnchorCell,extentCell:repairedExtent,setExtentCell,selectionBounds:bounds,isSelected}
}
