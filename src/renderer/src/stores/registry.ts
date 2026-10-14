// 注册表状态
import { create } from 'zustand'
import type { RegistrySnapshot } from '@shared/registry-types'

interface RegistryState {
  snapshot: RegistrySnapshot | null
  loading: boolean
  error: string | null
  load(): Promise<void>
  refresh(): Promise<void>
  refreshIcons(): Promise<void>
}

export const useRegistryStore = create<RegistryState>((set) => ({
  snapshot: null,
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null })
    try {
      const snapshot = await window.api.registryList()
      set({ snapshot, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async refresh() {
    set({ loading: true, error: null })
    try {
      const snapshot = await window.api.registryRefresh()
      set({ snapshot, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  async refreshIcons() {
    set({ loading: true, error: null })
    try {
      const snapshot = await window.api.registryRefreshIcons()
      set({ snapshot, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
}))
