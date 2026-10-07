export function getCost(row) {
  const values = [row.cqbi,row.cr,row.rate]
  if (!values.every((value)=>typeof value==='number' && Number.isFinite(value))) return null
  const result = values.reduce((product,value)=>product*value,1)
  return Number.isFinite(result) ? result : null
}
export const getUsedCost = (row) => row.override !== null ? row.override : getCost(row)
export const getResolvedBoqQuantity = (row) => row.boqQty
export function getTotalCost(row) {
  const cost = getUsedCost(row); const quantity = getResolvedBoqQuantity(row)
  return typeof cost==='number' && Number.isFinite(cost) && typeof quantity==='number' && Number.isFinite(quantity) && Number.isFinite(cost*quantity) ? cost*quantity : null
}
export const formatNumber = (value, options = {}) => value === null || !Number.isFinite(value) ? '' : new Intl.NumberFormat(undefined,{useGrouping:options.useGrouping??true,minimumFractionDigits:0,maximumFractionDigits:options.decimals??6}).format(value)
export function getRowDerivedValues(row) {
  return { cost:getCost(row), usedCost:getUsedCost(row), boqQty:getResolvedBoqQuantity(row), totalCost:getTotalCost(row) }
}
