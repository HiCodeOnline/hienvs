// 注册表状态
import { create } from 'zustand'
import type { RegistrySnapshot } from '@shared/registry-types'

interface RegistryState {
  snapshot: RegistrySnapshot | null
  loading: boolean
  error: string | null
  /** 工具箱选中的源 id（跨页面导航保持，组件重挂载不丢失） */
  activeSourceId: string | null
  /** 工具箱选中的分类过滤（'all' 表示不过滤） */
  activeCategory: string
  setActiveSourceId(id: string | null): void
  setActiveCategory(code: string): void
  load(): Promise<void>
  refresh(): Promise<void>
}

export const useRegistryStore = create<RegistryState>((set) => ({
  snapshot: null,
  loading: false,
  error: null,
  activeSourceId: null,
  activeCategory: 'all',
  setActiveSourceId(id) {
    set({ activeSourceId: id })
  },
  setActiveCategory(code) {
    set({ activeCategory: code })
  },
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
  }
}))
