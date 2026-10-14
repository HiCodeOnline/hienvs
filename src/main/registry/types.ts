// 注册表模块内部类型
import type { ParsedToolManifest } from './schema'

export interface LoadedTool {
  toolId: string
  manifest: ParsedToolManifest
  sourceId: string
  /** 图标链接地址（来自清单源 index.json 条目） */
  icon?: string
}
