// 软件源清单的类型定义与纯函数（客户端可安全引用；不含任何 node: 内置模块）。
// 与客户端 src/shared/registry-types.ts 同构，此处仅声明站点用到的子集。

export interface MirrorSource {
  name: string
  url: string
  size?: number
}

export interface AssetDef {
  url: string
  sha256?: string
  size?: number
  fileName?: string
  mirrors?: (MirrorSource | string)[]
  installArgs?: string[]
  elevate?: boolean
}

export interface PlatformDef {
  archive?: string
  assets: Record<string, AssetDef>
}

export interface DistributionDef {
  name: string
  description?: string
  homepage?: string
  defaultVersion?: string
  platforms: Record<string, PlatformDef>
}

export interface RegistryIndexTool {
  id: string
  name: string
  description?: string
  category?: string
  homepage?: string
  icon?: string
  manifest: string
}

export interface RegistryIndex {
  schemaVersion: number
  name: string
  updatedAt?: string
  tools: RegistryIndexTool[]
}

export interface ToolManifest {
  schemaVersion: number
  id: string
  name: string
  description?: string
  category?: string
  homepage?: string
  defaultVersion?: string
  platforms?: Record<string, PlatformDef>
  distributions?: Record<string, DistributionDef>
}

/** 下载源：official 为官方源，否则为具名镜像源 */
export interface SourceEntry {
  name: string
  url: string
  size?: number
  official: boolean
}

export interface VersionRow {
  /** 复合版本键：dist@version（无发行商时与 version 相同） */
  key: string
  version: string
  dist?: string
  distName?: string
  /** 该版本存在的平台键 */
  platforms: string[]
  size?: number
  sha256?: string
  sources: SourceEntry[]
}

export interface DistributionView {
  id?: string
  name: string
  description?: string
  homepage?: string
  defaultVersion?: string
  platforms: string[]
  versions: VersionRow[]
}

export interface ToolView {
  id: string
  name: string
  description?: string
  category?: string
  homepage?: string
  icon?: string
  manifestPath: string
  /** 全部平台键（含各发行商） */
  platforms: string[]
  distributions: DistributionView[]
  /** 版本行总数（跨发行商） */
  versionCount: number
}

const CATEGORY_KEYS: Record<string, string> = {
  language: 'category.language',
  'build-tool': 'category.buildTool',
  runtime: 'category.runtime',
  sdk: 'category.sdk',
  vcs: 'category.vcs'
}

/** 清单分类值 -> i18n 文案键（复用客户端 category.* 字典） */
export function categoryKey(category?: string): string | undefined {
  return category ? CATEGORY_KEYS[category] : undefined
}

/** 人类可读体积（与客户端展示一致） */
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 || Number.isInteger(value) ? 0 : 1)} ${units[i]}`
}
