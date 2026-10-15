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
  /** 代理认证用户名（与 proxy 成对使用；两者都为空表示代理无需认证） */
  proxyUsername?: string
  /** 代理认证密码 */
  proxyPassword?: string
  autoRefreshRegistry: boolean
  /** 仪表盘安全提示是否已被用户关闭（关闭后不再展示） */
  securityNoticeDismissed: boolean
  /** 界面语言偏好：auto 表示跟随系统语言，其余为具体语言代码 */
  language: import('./i18n').LanguagePreference
  /** dev 环境是否已注入 webui 本地开发源（打包版无此逻辑） */
  devSourceSeeded?: boolean
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
  /** 操作系统展示名称，如 Windows 11 / macOS 14 / Linux */
  osLabel: string
  /** 系统语言区域，如 zh-CN / en-US，用于「跟随系统」匹配界面语言 */
  systemLocale: string
  home: string
  installDir: string
  downloadDir: string
  isPackaged: boolean
}

/** 目录所在磁盘的空间占用（字节） */
export interface DiskUsage {
  total: number
  free: number
}
