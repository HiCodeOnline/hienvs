// 平台键归一化与架构感知匹配（主进程共享，纯函数）
// 清单平台键格式：`${os}`（架构无关，如 Maven 的通用 zip）或 `${os}-${arch}`
// 匹配优先级：`${os}-${arch}` 精确命中 → `${os}` 通用兜底；绝不跨架构回退（严格适配）
import type { PlatformDef } from '@shared/registry-types'

export type OsName = 'windows' | 'darwin' | 'linux'
/** 支持的架构：x64 / arm64 / x86（32 位）/ arm（32 位 ARM） */
export type ArchName = 'x64' | 'arm64' | 'x86' | 'arm'

const OS_ALIASES: Record<string, OsName> = {
  windows: 'windows',
  win: 'windows',
  win32: 'windows',
  win64: 'windows',
  darwin: 'darwin',
  mac: 'darwin',
  macos: 'darwin',
  osx: 'darwin',
  linux: 'linux'
}

const ARCH_ALIASES: Record<string, ArchName> = {
  x64: 'x64',
  x86_64: 'x64',
  'x86-64': 'x64',
  amd64: 'x64',
  arm64: 'arm64',
  aarch64: 'arm64',
  x86: 'x86',
  ia32: 'x86',
  i386: 'x86',
  i686: 'x86',
  arm: 'arm',
  armv7l: 'arm',
  armhf: 'arm'
}

/** 运行时架构归一化：Electron process.arch → 标准架构名；未知架构原样小写透传（如 loong64） */
export function normalizeArch(raw: string): string {
  return ARCH_ALIASES[raw.toLowerCase()] ?? raw.toLowerCase()
}

/** 清单平台键解析：`windows-x64` / `mac` / `darwin-arm64` …；非法键返回 null */
export function parsePlatformKey(key: string): { os: OsName; arch?: string } | null {
  const parts = key.toLowerCase().split('-')
  const os = OS_ALIASES[parts[0]]
  if (!os) return null
  if (parts.length === 1) return { os }
  if (parts.length === 2) {
    const arch = ARCH_ALIASES[parts[1]] ?? parts[1]
    return { os, arch }
  }
  return null
}

/**
 * 架构感知的平台匹配：
 * 1. 精确键 `${os}-${arch}`（如 windows-x64 / linux-arm64）
 * 2. 通用键 `${os}`（架构无关资产）
 * 不做跨架构回退：x64 机器不会拿到 x86 资产，arm64 机器不会拿到 x64 资产。
 */
export function matchPlatform(
  platforms: Record<string, PlatformDef> | undefined,
  os: OsName,
  arch: string
): PlatformDef | undefined {
  if (!platforms) return undefined
  const index = new Map<string, PlatformDef>()
  for (const [key, def] of Object.entries(platforms)) {
    const parsed = parsePlatformKey(key)
    if (!parsed) continue
    index.set(parsed.arch ? `${parsed.os}-${parsed.arch}` : parsed.os, def)
  }
  return index.get(`${os}-${arch}`) ?? index.get(os)
}
