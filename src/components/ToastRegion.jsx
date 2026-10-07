import { useUiStore } from '../stores/uiStore.js'

export function ToastRegion() {
  const { toasts, dismissToast } = useUiStore()
  return <div className="toast-region" aria-live="polite" aria-label="Notifications">
    {toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
      <span>{toast.message}</span><button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">x</button>
    </div>)}
  </div>
}
