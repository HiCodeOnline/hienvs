// 已安装工具与应用设置类型

export interface InstalledVersionInfo {
  installedAt: number
  /** 来源清单源 id */
  sourceId: string
}

export interface InstalledToolInfo {
  versions: Record<string, InstalledVersionInfo>
  activeVersion: string | null
  /** 环境变量是否已应用（激活后） */
  envApplied: boolean
}

export interface InstalledStoreData {
  version: 1
  /** 环境变量当前生效的写入作用域（由激活操作指定，非全局配置） */
  envScope: 'user' | 'system'
  tools: Record<string, InstalledToolInfo>
}

export interface AppSettings {
  /** 工具安装目录（版本目录与 current 链接所在），默认 ~/.hienvs/tools */
  installDir: string
  /** 下载缓存目录（安装包存放），默认 ~/.hienvs/downloads */
  downloadDir: string
  registries: import('./registry-types').RegistrySource[]
  mirrorPolicy: 'auto' | 'mainland-first' | 'official-first'
  taskConcurrency: number
  proxy?: string
  autoRefreshRegistry: boolean
}

export interface SystemToolInfo {
  toolId: string
  found: boolean
  path?: string
  managedByHienvs?: boolean
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
  arch: string
  home: string
  installDir: string
  downloadDir: string
  isPackaged: boolean
}
