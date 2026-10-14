// ToolDetail 类型（主进程 toolDetail 返回值）
import type { VersionInfo, ToolCategory } from '../shared/registry-types'

export interface ToolDetail {
  id: string
  name: string
  description?: string
  category?: ToolCategory
  homepage?: string
  /** 本地图标 data URL（无则展示首字母） */
  icon?: string
  /** 默认版本键（多发行商工具为首个发行商的默认版本键） */
  defaultVersion?: string
  /** 发行商列表（多发行商工具，如 jdk；普通工具为空数组） */
  distributions: { id: string; name: string; defaultVersion?: string; homepage?: string }[]
  versions: VersionInfo[]
  installedVersions: string[]
  activeVersion: string | null
  envApplied: boolean
  health: string | null
  platformKey: string
}
