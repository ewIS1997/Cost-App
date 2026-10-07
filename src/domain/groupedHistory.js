export function pruneGroupedOperations(operations, deletedSheetId) {
  return operations
    .map((operation) => ({ ...operation, changes: operation.changes.filter((change) => change.sheetId !== deletedSheetId) }))
    .filter((operation) => operation.changes.length > 0)
}
