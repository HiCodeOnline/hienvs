// 应用设置读写（settings.json）
import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '@shared/tool-types'
import { defaultHienvsHome, buildPaths } from './paths'
import { randomUUID } from 'node:crypto'

export function defaultSettings(): AppSettings {
  const home = defaultHienvsHome()
  return {
    installDir: path.join(home, 'tools'),
    downloadDir: path.join(home, 'downloads'),
    registries: [],
    mirrorPolicy: 'auto',
    taskConcurrency: 2,
    autoRefreshRegistry: true,
    securityNoticeDismissed: false
  }
}

export class SettingsStore {
  private file: string
  private data: AppSettings

  constructor() {
    // 设置文件固定在 ~/.hienvs/state/settings.json，不支持迁移
    this.file = buildPaths({
      home: defaultHienvsHome(),
      installDir: '',
      downloadDir: ''
    }).appStateFile
    this.data = defaultSettings()
  }

  load(): AppSettings {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'))
        this.data = { ...defaultSettings(), ...raw }
      }
    } catch (e) {
      this.data = defaultSettings()
      console.warn('[settings] 加载失败，使用默认值:', e)
    }
    return { ...this.data }
  }

  get(): AppSettings {
    return { ...this.data }
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...patch }
    if (!this.data.taskConcurrency || this.data.taskConcurrency < 1) this.data.taskConcurrency = 1
    if (this.data.taskConcurrency > 5) this.data.taskConcurrency = 5
    this.save()
    return { ...this.data }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp-' + randomUUID()
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
      fs.renameSync(tmp, this.file)
    } catch (e) {
      console.error('[settings] 保存失败:', e)
    }
  }
}

export const settingsStore = new SettingsStore()
