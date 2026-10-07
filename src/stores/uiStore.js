import { create } from 'zustand'

let nextToastId = 1

export const useUiStore = create((set) => ({
  toasts: [],
  preferences: null,
  setPreferences(preferences) { set({ preferences }) },
  addToast(message, type = 'success') {
    const id = nextToastId++
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    window.setTimeout(() => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })), 5000)
  },
  dismissToast(id) { set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })) },
}))

export const notify = (message, type) => useUiStore.getState().addToast(message, type)
