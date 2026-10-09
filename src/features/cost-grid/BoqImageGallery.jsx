import { useEffect, useState } from 'react'
import { getImageAttachment } from '../../database/repositories.js'

export function BoqImageGallery({ attachments, onPreview, onDeleteRequest, onAddImage, onImageLoad, showImages }) {
  const signature=attachments.map((attachment)=>attachment.id).join('|')
  const [loadedUrls, setLoadedUrls] = useState({ signature: '', urls: {} })
  const urls=loadedUrls.signature===signature?loadedUrls.urls:{}

  useEffect(() => {
    let live = true
    const created = []
    Promise.all(attachments.map(async (attachment) => {
      const record = await getImageAttachment(attachment.id)
      return record?.blob ? [attachment.id, URL.createObjectURL(record.blob)] : null
    })).then((entries) => {
      if (!live) { entries.filter(Boolean).forEach(([, url]) => URL.revokeObjectURL(url)); return }
      const next = Object.fromEntries(entries.filter(Boolean))
      created.push(...Object.values(next))
      setLoadedUrls({signature,urls:next})
    }).catch(() => {})
    return () => { live = false; created.forEach((url) => URL.revokeObjectURL(url)) }
  }, [attachments,signature])

  if (!showImages || !attachments.length) return null

  return <div className="boq-image-gallery" role="group" aria-label={`Images for ${attachments[0].boqCode}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {attachments.map((attachment) => <div className="boq-image-thumbnail" key={attachment.id}>
        <button type="button" className="boq-image-open" title={`Double-click to view image ${attachment.position + 1}`} aria-label={`View image ${attachment.position + 1} for ${attachment.boqCode}`} disabled={!urls[attachment.id]}
          onClick={(event) => {
            const touchInput = window.matchMedia?.('(pointer: coarse)').matches
            if (event.detail === 0 || touchInput) onPreview(attachment)
          }}
          onDoubleClick={() => onPreview(attachment)}>
          {urls[attachment.id] ? <img src={urls[attachment.id]} alt={`Detail image ${attachment.position + 1} for ${attachment.boqCode}`} loading="lazy" onLoad={onImageLoad} /> : <span>Loading image…</span>}
        </button>
        <button type="button" className="boq-image-delete" title="Delete image" aria-label={`Delete image ${attachment.position + 1} for ${attachment.boqCode}`} onClick={() => onDeleteRequest(attachment)}>×</button>
      </div>)}
      <button type="button" className="boq-image-add-more" onClick={onAddImage}>＋ Add image</button>
  </div>
}
