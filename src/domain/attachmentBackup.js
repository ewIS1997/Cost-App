export async function encodeAttachmentForBackup(attachment) {
  const bytes = new Uint8Array(await attachment.blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  const metadata={...attachment}
  delete metadata.blob
  return { ...metadata, data: btoa(binary) }
}

export function decodeAttachmentFromBackup(attachment) {
  if (typeof attachment?.data !== 'string') throw new Error('Backup image data is missing.')
  let binary
  try { binary = atob(attachment.data) } catch { throw new Error('Backup image data is not valid base64.') }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const metadata={...attachment}
  delete metadata.data
  return { ...metadata, blob: new Blob([bytes], { type: attachment.mimeType }) }
}
