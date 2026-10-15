// Registry（清单）v1 类型定义。
// 运行时校验由 src/main/registry/schema.ts 中的 zod schema 完成，两者保持同步。

export type OsName = 'windows' | 'darwin' | 'linux'
export type ArchName = 'x64' | 'arm64'
export type PlatformKey =
  | 'windows-x64'
  | 'windows-arm64'
  | 'darwin-x64'
  | 'darwin-arm64'
  | 'linux-x64'
  | 'linux-arm64'
  | 'windows'
  | 'darwin'
  | 'linux'

/** 工具分类编码：源自定义后为任意字符串（内置 5 类仅作为回退文案） */
export type ToolCategory = string

/** 步骤通用字段 */
export interface StepBase {
  id?: string
  type: string
  retry?: { attempts: number; backoffMs?: number; factor?: number }
  timeoutSec?: number
  onFailure?: 'rollback' | 'keep'
  /** 平台/版本级覆盖：显式禁用某步骤 */
  remove?: boolean
  insertBefore?: string
  insertAfter?: string
  [key: string]: unknown
}

/** 清单中的步骤（params 平铺在步骤对象上） */
export type ManifestStep = StepBase

export interface WorkflowDef {
  install?: ManifestStep[]
  activate?: ManifestStep[]
  uninstall?: ManifestStep[]
}

/** 具名下载源（官方源或镜像源），安装时可选择指定源下载 */
export interface MirrorSource {
  name: string
  url: string
  /** 文件字节数（可选）；展示与下载进度优先取所选源的 size */
  size?: number
}

/**
 * 分发格式：压缩包（下载后解压配置）或安装包（下载后执行安装流程）或单文件
 * - 压缩包: zip / tar.gz / tar.xz
 * - Windows 安装包: exe（NSIS/Inno 等静默安装）、msi、msix
 * - macOS 安装包: dmg、pkg
 * - Linux 包: rpm、deb
 * - 单文件: appimage（Linux 便携可执行）、raw（单个可执行/脚本文件）
 */
export type AssetFormat =
  | 'zip'
  | 'tar.gz'
  | 'tar.xz'
  | 'exe'
  | 'msi'
  | 'msix'
  | 'dmg'
  | 'pkg'
  | 'rpm'
  | 'deb'
  | 'appimage'
  | 'raw'

/** 版本级资产：某个版本在某平台的下载物 */
export interface AssetDef {
  url: string
  /** 下载文件校验和（可选）：配置了哪种就校验哪种，至少配置一种时下载完成后强制校验 */
  sha256?: string
  md5?: string
  sha1?: string
  size?: number
  fileName?: string
  /** 备用镜像源（具名），官方 url 由顶层 url 提供 */
  mirrors?: MirrorSource[]
  /** 安装包静默安装参数（仅安装包格式生效），如 exe 的 ["/S"]、msi 追加参数 */
  installArgs?: string[]
  /** 安装时是否需要管理员权限（msi/pkg/rpm/deb 默认 true，exe/dmg 默认 false） */
  elevate?: boolean
  /** 安装完成后可启动的可执行文件（安装器类工具）：相对版本目录或绝对路径；配置后仪表盘展示「打开」 */
  launch?: string
}

/** 版本级覆盖（工作流步骤按 id 合并 + 资产级覆盖） */
export interface VersionOverride {
  steps?: Record<string, Partial<ManifestStep> & Pick<ManifestStep, 'type'>> & {
    __insertions__?: ManifestStep[]
  }
  workflowOverrides?: {
    insertions?: ManifestStep[]
  }
  [key: string]: unknown
}

export interface PlatformDef {
  /** 分发格式；缺省时按下载 URL 后缀推断 */
  archive?: AssetFormat
  assets: Record<string, AssetDef>
  workflowOverrides?: WorkflowDef
}

export interface EnvVarDef {
  name: string
  value: string
  /** Windows 上是否以 REG_EXPAND_SZ 写入 */
  expand?: boolean
}

export interface ToolEnvDef {
  vars?: EnvVarDef[]
  /** 相对 current 的目录，激活时加入 PATH */
  pathDirs?: string[]
}

/** 发行商定义：同一工具的不同厂商构建（如 Temurin / Corretto / Zulu） */
export interface DistributionDef {
  name: string
  description?: string
  homepage?: string
  defaultVersion?: string
  platforms: Record<string, PlatformDef>
  /** 版本级覆盖：key 为版本号 */
  versionOverrides?: Record<string, VersionOverride>
}

export interface ToolManifest {
  schemaVersion: number
  id: string
  name: string
  description?: string
  category?: ToolCategory
  homepage?: string
  defaultVersion?: string
  env?: ToolEnvDef
  workflows?: WorkflowDef
  /** 单发行商工具直接声明 platforms；与 distributions 二选一 */
  platforms?: Record<string, PlatformDef>
  /** 多发行商工具（如 JDK）：key 为发行商 id */
  distributions?: Record<string, DistributionDef>
  /** 版本级覆盖：key 为版本号 */
  versionOverrides?: Record<string, VersionOverride>
}

export interface RegistryIndexTool {
  id: string
  name: string
  description?: string
  category?: ToolCategory
  homepage?: string
  /** 图标链接地址（刷新清单源时下载到本地缓存并展示） */
  icon?: string
  manifest: string
  manifestSha256?: string
}

export interface RegistryIndex {
  schemaVersion: number
  updatedAt?: string
  name: string
  tools: RegistryIndexTool[]
}

/** 解析后的版本信息（面向 UI） */
export interface VersionInfo {
  /** 复合版本键：dist@version（无发行商时与 version 相同），安装/激活等操作的入参 */
  key: string
  version: string
  /** 发行商 id 与显示名（多发行商工具） */
  dist?: string
  distName?: string
  isDefault?: boolean
  /** 当前平台是否有资产 */
  available: boolean
  size?: number
  sha256?: string
  /** 可选下载源：首个为官方源，其余为具名镜像源 */
  sources?: MirrorSource[]
}

/** 注册表快照（registry:list 返回） */
export interface RegistrySnapshot {
  tools: ToolSummary[]
  sources: RegistrySourceStatus[]
  updatedAt: string
}

export interface ToolSummary {
  id: string
  name: string
  description?: string
  category?: ToolCategory
  homepage?: string
  sourceId: string
  /** 本地图标 data URL（清单源配置 icon 且下载成功后存在），无则展示首字母 */
  icon?: string
  /** 当前平台是否可安装 */
  available: boolean
  versions: VersionInfo[]
  defaultVersion?: string
  installedVersions: string[]
  activeVersion: string | null
  /** 工具是否健康（激活版本的 verify 通过） */
  healthy?: boolean
  /** 激活版本配置的可启动入口（asset.launch），存在时仪表盘展示「打开」按钮 */
  launch?: string
}

export type RegistrySourceType = 'remote' | 'local'

export interface RegistrySource {
  id: string
  type: RegistrySourceType
  name: string
  /** remote: URL；local: 文件夹路径 */
  location?: string
  /** 仅远程源有效：开启后每 10 分钟自动拉取一次远程内容 */
  autoUpdate?: boolean
}

/** 源配置的工具分类（index.json 中与 tools 平级的 categories） */
export interface RegistryCategory {
  code: string
  name: string
}

export interface RegistrySourceStatus {
  id: string
  name: string
  type: RegistrySourceType
  status: 'ok' | 'error' | 'cached'
  toolCount: number
  /** 源配置的分类列表，工具箱据此渲染过滤 tab */
  categories?: RegistryCategory[]
  error?: string
  updatedAt?: string
}
