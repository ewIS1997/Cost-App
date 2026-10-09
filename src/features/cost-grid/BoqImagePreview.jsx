import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { Modal } from '../../components/Modal.jsx'
import { getImageAttachment } from '../../database/repositories.js'

const MIN_ZOOM = 1
const MAX_ZOOM = 4

export function BoqImagePreview({ attachment, attachments, onClose, onDeleteRequest }) {
  const orderedAttachments = useMemo(() => [...attachments].sort((a, b) => a.position - b.position), [attachments])
  const [activeId, setActiveId] = useState(attachment.id)
  const [image, setImage] = useState(null)
  const [zoom, setZoom] = useState(1)
  const activeIndex = Math.max(0, orderedAttachments.findIndex((item) => item.id === activeId))
  const activeAttachment = orderedAttachments[activeIndex] ?? attachment

  const selectImage = useCallback((index) => {
    const next = orderedAttachments[index]
    if (!next) return
    setActiveId(next.id)
    setZoom(1)
  }, [orderedAttachments])

  useEffect(() => {
    let live = true
    let url
    getImageAttachment(activeId).then((record) => {
      if (!record?.blob) throw new Error('The image is no longer available.')
      url = URL.createObjectURL(record.blob)
      if (live) setImage({ id: activeId, url })
      else URL.revokeObjectURL(url)
    }).catch(() => {
      if (live) setImage({ id: activeId, error: 'This image is no longer available.' })
    })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [activeId])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); selectImage(Math.max(0, activeIndex - 1)) }
      if (event.key === 'ArrowRight') { event.preventDefault(); selectImage(Math.min(orderedAttachments.length - 1, activeIndex + 1)) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, orderedAttachments.length, selectImage])

  const changeZoom = useCallback((amount) => {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * amount)))
  }, [])

  const onWheel = useCallback((event) => {
    event.preventDefault()
    changeZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12)
  }, [changeZoom])

  return <Modal title={`${activeAttachment.boqCode} · Image ${activeIndex + 1} of ${orderedAttachments.length}`} onClose={onClose} size="wide">
    <div className="boq-image-preview-shell">
      <button type="button" className="boq-image-nav boq-image-nav-previous" aria-label="Previous image" title="Previous image" disabled={activeIndex === 0} onClick={() => selectImage(activeIndex - 1)}><ChevronLeft /></button>
      <div className="boq-image-preview" onWheel={onWheel} aria-label="Image preview; use the mouse wheel to zoom">
        {image?.id === activeId && image.url
          ? <img src={image.url} alt={`Detail image ${activeIndex + 1} for ${activeAttachment.boqCode}`} style={{ transform: `scale(${zoom})` }} />
          : <span role="status">{image?.error ?? 'Loading image…'}</span>}
      </div>
      <button type="button" className="boq-image-nav boq-image-nav-next" aria-label="Next image" title="Next image" disabled={activeIndex >= orderedAttachments.length - 1} onClick={() => selectImage(activeIndex + 1)}><ChevronRight /></button>
    </div>
    <div className="boq-image-preview-toolbar" aria-label="Image zoom controls">
      <button type="button" className="secondary-button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(1 / 1.2)}><ZoomOut /></button>
      <span aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button type="button" className="secondary-button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(1.2)}><ZoomIn /></button>
      <button type="button" className="secondary-button" onClick={() => setZoom(1)}>Reset zoom</button>
    </div>
    <footer className="modal-actions">
      <button type="button" className="danger-button" onClick={() => onDeleteRequest(activeAttachment)}>Delete image</button>
      <button type="button" className="secondary-button" onClick={onClose}>Close</button>
    </footer>
  </Modal>
}
