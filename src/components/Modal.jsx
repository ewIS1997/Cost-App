import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ title, children, onClose }) {
  const dialogRef = useRef(null)
  const restoreRef = useRef(null)
  useEffect(() => {
    restoreRef.current = document.activeElement
    const dialog = dialogRef.current
    const focusable = () => [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.disabled)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const items = focusable(); if (!items.length) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
    }
    dialog.addEventListener('keydown', onKeyDown); (dialog.querySelector('[autofocus]') ?? focusable()[0])?.focus()
    return () => { dialog.removeEventListener('keydown', onKeyDown); restoreRef.current?.focus?.() }
  }, [onClose])
  return createPortal(<div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
       <header><h2 id="modal-title">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}
    </section>
  </div>, document.body)
}

export function ConfirmDialog({ title, children, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }) {
  return <Modal title={title} onClose={onClose}><div className="modal-body">{children}</div><footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className={danger ? 'danger-button' : 'primary-button'} type="button" onClick={onConfirm}>{confirmLabel}</button></footer></Modal>
}
