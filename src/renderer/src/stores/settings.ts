// 设置状态
import { create } from 'zustand'
import type { AppSettings } from '@shared/tool-types'

interface SettingsState {
  settings: AppSettings | null
  load(): Promise<void>
  update(patch: Partial<AppSettings>): Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  async load() {
    try {
      const settings = await window.api.settingsGet()
      set({ settings })
    } catch {
      /* 静默 */
    }
  },
  async update(patch) {
    const next = await window.api.settingsSet(patch)
    set({ settings: next })
    void get()
  }
}))
