/** Resolve the inherited BOQ quantity represented by a set of resource rows.
 * The most frequent non-null value is the shared item quantity; ties use the
 * first value encountered so worksheet order remains deterministic.
 */
function getInheritedNumericValue(rows, key) {
  const counts = new Map()
  let firstValue = null
  for (const row of rows) {
    const value = row[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (!counts.has(value)) counts.set(value, 0)
    counts.set(value, counts.get(value) + 1)
    if (firstValue === null) firstValue = value
  }
  if (firstValue === null) return null
  let inherited = firstValue
  let maxCount = counts.get(firstValue)
  for (const [value, count] of counts) {
    if (count > maxCount) { inherited = value; maxCount = count }
  }
  return inherited
}

export function getInheritedBoqQuantity(rows) {
  return getInheritedNumericValue(rows, 'boqQty')
}

/** Resolve the most frequent non-null CQBI value; ties follow worksheet order. */
export function getInheritedCqbi(rows) {
  return getInheritedNumericValue(rows, 'cqbi')
}

/** Copy resource data while resolving normal quantities from the destination item. */
export function copyResourcesToBoq(sourceRows, destinationRows, destinationCode, createRowId, { preserveDestinationCqbi = false } = {}) {
  const sourceQuantity = getInheritedBoqQuantity(sourceRows)
  const destinationQuantity = getInheritedBoqQuantity(destinationRows)
  const destinationCqbi = preserveDestinationCqbi ? getInheritedCqbi(destinationRows) : null
  return sourceRows.map((row) => ({
    ...row,
    id: createRowId(),
    boqCode: destinationCode,
    ...(preserveDestinationCqbi ? { cqbi: destinationCqbi } : {}),
    boqQty: row.boqQty !== null && row.boqQty !== sourceQuantity
      ? row.boqQty
      : destinationQuantity,
  }))
}
