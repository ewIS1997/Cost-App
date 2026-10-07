export function updateWorksheetRowRate(data, rowId, rate) {
  const row = data.rows.find((item) => item.id === rowId)
  if (!row) throw new Error('The edited row is no longer available.')
  row.rate = rate
  if (row.expressions?.rate) {
    const expressions = { ...row.expressions }
    delete expressions.rate
    if (Object.keys(expressions).length) row.expressions = expressions
    else delete row.expressions
  }
}
