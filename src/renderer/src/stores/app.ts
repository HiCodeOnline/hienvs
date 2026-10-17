// 全局应用状态：导航 / Toast / 主题
import { create } from 'zustand'

export type Page = 'tools' | 'tool-detail' | 'tasks' | 'settings'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

interface AppState {
  page: Page
  detailToolId: string | null
  dark: boolean
  toasts: Toast[]
  navigate(page: Page, toolId?: string): void
  toggleDark(): void
  pushToast(kind: Toast['kind'], message: string): void
  dismissToast(id: number): void
}

let toastSeq = 1

export const useAppStore = create<AppState>((set, get) => ({
  page: 'tools',
  detailToolId: null,
  dark: false,
  toasts: [],
  navigate(page, toolId) {
    set({ page, detailToolId: toolId ?? null })
  },
  toggleDark() {
    const dark = !get().dark
    document.documentElement.classList.toggle('dark', dark)
    set({ dark })
  },
  pushToast(kind, message) {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => get().dismissToast(id), 5000)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
}))
