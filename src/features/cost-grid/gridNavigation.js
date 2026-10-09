export const isBlankCell = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

export function findDirectionalEdge(start, direction, count, isBlank) {
  if (count <= 0 || start < 0 || start >= count) return start
  const next = start + direction
  if (next < 0 || next >= count) return start

  const currentIsBlank = isBlank(start)
  const nextIsBlank = isBlank(next)
  let index = next

  if (currentIsBlank || nextIsBlank) {
    while (index >= 0 && index < count && isBlank(index)) index += direction
    return index >= 0 && index < count ? index : direction > 0 ? count - 1 : 0
  }

  while (index + direction >= 0 && index + direction < count && !isBlank(index + direction)) index += direction
  return index
}
