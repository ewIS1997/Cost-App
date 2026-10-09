export const GRID_POSITION_PREFIX = 'cost-grid-position-v1'

export function gridPositionKey(projectId, sheetId) {
  return `${GRID_POSITION_PREFIX}:${projectId}:${sheetId}`
}

export function readGridPosition(storage, key, url) {
  if (!storage || !key || !url) return null
  try {
    const value = JSON.parse(storage.getItem(key) || 'null')
    return value?.url === url ? value : null
  } catch {
    return null
  }
}

export function writeGridPosition(storage, key, position) {
  if (!storage || !key || !position?.url || !position.selection) return
  try {
    storage.setItem(key, JSON.stringify({
      url: position.url,
      active: position.selection.active,
      anchor: position.selection.anchor,
      extent: position.selection.extent,
      scrollTop: position.scrollTop,
      scrollLeft: position.scrollLeft,
    }))
  } catch {
    // Session storage can be unavailable or full; grid interaction should still work.
  }
}
