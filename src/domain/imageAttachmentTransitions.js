import { normalizeBoqCode } from './normalization.js'

/** Compute attachment key moves from a committed worksheet row transition. */
export function transitionItemAttachments(attachments, beforeRows, afterRows) {
  const beforeById=new Map(beforeRows.map((row)=>[row.id,row]))
  const afterById=new Map(afterRows.map((row)=>[row.id,row]))
  const beforeByCode=new Map(),afterByCode=new Map()
  for(const row of beforeRows){const code=normalizeBoqCode(row.boqCode);if(code){const rows=beforeByCode.get(code)??[];rows.push(row);beforeByCode.set(code,rows)}}
  for(const row of afterRows){const code=normalizeBoqCode(row.boqCode);if(code){const rows=afterByCode.get(code)??[];rows.push(row);afterByCode.set(code,rows)}}

  const moves=new Map()
  for(const [from,rows] of beforeByCode){
    if(afterByCode.has(from))continue
    const destinations=new Set(rows.map((row)=>normalizeBoqCode(afterById.get(row.id)?.boqCode)).filter(Boolean))
    if(rows.every((row)=>afterById.has(row.id))&&destinations.size===1)moves.set(from,[...destinations][0])
  }

  const originals=new Map(attachments.map((attachment)=>[attachment.id,attachment]))
  const next=attachments.map((attachment)=>{
    const current=normalizeBoqCode(attachment.boqCode)
    let destination=moves.get(current)
    const origin=normalizeBoqCode(attachment.originCode)
    if(origin&&origin!==current){
      const itemRowIds=Array.isArray(attachment.itemRowIds)?attachment.itemRowIds:[]
      const survivingOwnerRows=itemRowIds.map((id)=>({before:beforeById.get(id),after:afterById.get(id)})).filter(({after})=>after)
      const originRowsRestored=survivingOwnerRows.length>0&&survivingOwnerRows.every(({before,after})=>
        normalizeBoqCode(before?.boqCode)===current&&normalizeBoqCode(after.boqCode)===origin)
      if(originRowsRestored)destination=origin
    }
    return destination&&destination!==current?{...attachment,boqCode:destination}:attachment
  })

  const affectedCodes=new Set([...moves.keys(),...moves.values()])
  next.forEach((attachment)=>{
    const current=normalizeBoqCode(attachment.boqCode)
    const beforeCode=normalizeBoqCode(originals.get(attachment.id)?.boqCode)
    if(beforeCode!==current){affectedCodes.add(current);affectedCodes.add(beforeCode)}
  })
  const changed=[]
  for(const code of affectedCodes){
    const group=next.filter((attachment)=>normalizeBoqCode(attachment.boqCode)===code)
    group.sort((a,b)=>{
      const aWasThere=normalizeBoqCode(originals.get(a.id)?.boqCode)===code
      const bWasThere=normalizeBoqCode(originals.get(b.id)?.boqCode)===code
      return Number(bWasThere)-Number(aWasThere)||(a.position??0)-(b.position??0)||String(a.createdAt??'').localeCompare(String(b.createdAt??''))
    })
    group.forEach((attachment,position)=>{
      const original=originals.get(attachment.id)
      if(original&&(original.boqCode!==attachment.boqCode||original.position!==position))changed.push({...attachment,position})
    })
  }
  return changed
}
