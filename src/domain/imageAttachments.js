import { normalizeBoqCode } from './normalization.js'

export const IMAGE_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024
export const IMAGE_ATTACHMENT_MAX_DIMENSION = 2400
export const IMAGE_ATTACHMENT_MAX_PIXELS = 16_000_000
export const IMAGE_ATTACHMENT_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp'])

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The image could not be prepared for storage.')), type, quality))
}

export async function prepareImageAttachment(file) {
  if (!file || !IMAGE_ATTACHMENT_TYPES.includes(file.type?.toLocaleLowerCase())) {
    throw new Error('Choose a PNG, JPEG, or WebP image.')
  }
  if (file.size > IMAGE_ATTACHMENT_MAX_BYTES * 4) throw new Error('The source image is too large to attach (maximum 32 MB).')
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot prepare image attachments.')

  let bitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('The selected image could not be opened.') }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > IMAGE_ATTACHMENT_MAX_PIXELS) {
      throw new Error('The image dimensions are too large to attach.')
    }
    const scale = Math.min(1, IMAGE_ATTACHMENT_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The image could not be prepared for storage.')
    context.drawImage(bitmap, 0, 0, width, height)
    const type = file.type.toLocaleLowerCase() === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    let blob = await canvasBlob(canvas, type, type === 'image/jpeg' ? 0.88 : undefined)
    if (blob.size > IMAGE_ATTACHMENT_MAX_BYTES && type === 'image/png') {
      blob = await canvasBlob(canvas, 'image/jpeg', 0.82)
    }
    if (blob.size > IMAGE_ATTACHMENT_MAX_BYTES) throw new Error('The prepared image is larger than the 8 MB attachment limit.')
    return { blob, mimeType: blob.type, width, height }
  } finally {
    bitmap.close?.()
  }
}

export function normalizeAttachmentCode(code) {
  const normalized = normalizeBoqCode(code)
  if (!normalized) throw new Error('Select a cell belonging to a coded BQ item first.')
  return normalized
}

export function isImageTargetCurrent(rows,rowId,boqCode) {
  const code=normalizeBoqCode(boqCode)
  return Boolean(code&&rowId&&rows.some((row)=>row.id===rowId&&normalizeBoqCode(row.boqCode)===code))
}

export function rekeyAttachmentRecords(records, moves) {
  const destinations = new Map()
  for (const [from, to] of moves) {
    const source = normalizeBoqCode(from)
    const destination = normalizeBoqCode(to)
    if (source && destination && source !== destination) destinations.set(source, destination)
  }
  return records.map((record) => destinations.has(normalizeBoqCode(record.boqCode))
    ? { ...record, boqCode: destinations.get(normalizeBoqCode(record.boqCode)) }
    : record)
}
