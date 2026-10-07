export function serializeBackupWithinLimit(backup, limitBytes) {
  const json = JSON.stringify(backup, null, 2)
  const sizeBytes = new TextEncoder().encode(json).byteLength
  if (sizeBytes > limitBytes) {
    throw new Error(`Backup is ${sizeBytes.toLocaleString()} bytes; the maximum supported size is ${limitBytes.toLocaleString()} bytes.`)
  }
  return json
}
