// 已安装工具状态库（state/installed.json）
import fs from 'node:fs'
import path from 'node:path'
import type { InstalledStoreData, InstalledToolInfo } from '@shared/tool-types'

function emptyData(): InstalledStoreData {
  return { version: 1, envScope: 'user', tools: {} }
}

export class InstalledStore {
  private file: string
  private data: InstalledStoreData = emptyData()

  constructor(installedFile: string) {
    this.file = installedFile
    this.load()
  }

  reload(installedFile: string): void {
    this.file = installedFile
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.file)) {
        this.data = { ...emptyData(), ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) }
      } else {
        this.data = emptyData()
      }
    } catch {
      this.data = emptyData()
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (e) {
      console.error('[installed-store] 保存失败:', e)
    }
  }

  getAll(): InstalledStoreData {
    return JSON.parse(JSON.stringify(this.data))
  }

  getTool(toolId: string): InstalledToolInfo {
    return this.data.tools[toolId] ?? { versions: {}, activeVersion: null, envApplied: false }
  }

  /** 当前生效的环境变量写入作用域（由激活操作指定） */
  getEnvScope(): 'user' | 'system' {
    return this.data.envScope
  }

  setEnvScope(scope: 'user' | 'system'): void {
    this.data.envScope = scope
    this.save()
  }

  recordInstalled(toolId: string, version: string, sourceId: string): void {
    const t = this.getTool(toolId)
    t.versions[version] = { installedAt: Date.now(), sourceId }
    this.data.tools[toolId] = t
    this.save()
  }

  recordActive(toolId: string, version: string | null, envApplied: boolean): void {
    const t = this.getTool(toolId)
    t.activeVersion = version
    t.envApplied = envApplied
    this.data.tools[toolId] = t
    this.save()
  }

  recordEnvApplied(toolId: string, envApplied: boolean): void {
    const t = this.getTool(toolId)
    t.envApplied = envApplied
    this.data.tools[toolId] = t
    this.save()
  }

  recordUninstalled(toolId: string, version?: string): void {
    if (!version) {
      delete this.data.tools[toolId]
    } else {
      const t = this.getTool(toolId)
      delete t.versions[version]
      if (t.activeVersion === version) t.activeVersion = null
      if (Object.keys(t.versions).length === 0) delete this.data.tools[toolId]
      else this.data.tools[toolId] = t
    }
    this.save()
  }

  activeTools(): { toolId: string; version: string }[] {
    const out: { toolId: string; version: string }[] = []
    for (const [toolId, info] of Object.entries(this.data.tools)) {
      if (info.activeVersion) out.push({ toolId, version: info.activeVersion })
    }
    return out
  }
}
