// 注册表模块内部类型
import type { ParsedToolManifest } from './schema'

export interface LoadedTool {
  toolId: string
  manifest: ParsedToolManifest
  sourceId: string
  /** 系统无关工具（源 index.systemAgnostic=true 透传）：跳过当前平台校验，任意平台均可下载 */
  systemAgnostic?: boolean
  /** 图标链接地址（来自清单源 index.json 条目） */
  icon?: string
}
