import { create } from 'zustand'

type ToastVariant = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

// BeforeInstallPromptEvent is not in the standard TS lib
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt(): Promise<void>
}

interface UiState {
  toasts: Toast[]
  showToast: (message: string, variant?: ToastVariant) => void
  removeToast: (id: string) => void

  deferredInstallPrompt: BeforeInstallPromptEvent | null
  setDeferredInstallPrompt: (e: BeforeInstallPromptEvent | null) => void
  isInstalled: boolean
  setInstalled: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  showToast: (message, variant = 'info') => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  deferredInstallPrompt: null,
  setDeferredInstallPrompt: (e) => set({ deferredInstallPrompt: e }),
  isInstalled: false,
  setInstalled: (v) => set({ isInstalled: v }),
}))
