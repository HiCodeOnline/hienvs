// 主进程侧服务：激活后的环境同步、系统工具探测
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import type { InstalledStore } from '../core/installed-store'
import { logger } from '../core/logger'

/** 激活完成后同步主进程与后续子进程的 PATH/JAVA_HOME 等（即时生效） */
export function patchProcessEnv(installed: InstalledStore, activeEnvVars: { name: string; value: string }[], managedPathEntries: string[]): void {
  for (const v of activeEnvVars) {
    process.env[v.name] = v.value
  }
  if (managedPathEntries.length > 0) {
    const cur = process.env.PATH ?? ''
    const parts = cur.split(path.delimiter).filter((p) => !managedPathEntries.includes(p))
    process.env.PATH = [...managedPathEntries, ...parts].join(path.delimiter)
  }
  logger.info(`[activator] 已同步进程环境: ${activeEnvVars.map((v) => v.name).join(', ') || '(仅 PATH)'}`)
}

export interface SystemToolInfoResult {
  toolId: string
  found: boolean
  path?: string
  managedByHienvs?: boolean
}

const TOOL_BINARIES: Record<string, string[]> = {
  jdk: ['java'],
  java: ['java'],
  maven: ['mvn'],
  go: ['go'],
  node: ['node']
}

/** 探测系统 PATH 中已有的工具（排除 hienvs 托管目录） */
export function detectSystemTool(toolId: string, platform: string): SystemToolInfoResult {
  const binNames = TOOL_BINARIES[toolId] ?? []
  if (binNames.length === 0) return { toolId, found: false }
  const exts = platform === 'windows' ? ['.exe', '.cmd', '.bat', ''] : ['']
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)

  for (const dir of dirs) {
    const managed = /[\\/]\.hienvs([\\/]|$)/i.test(dir)
    for (const base of binNames) {
      for (const ext of exts) {
        const candidate = path.join(dir, base + ext)
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return { toolId, found: true, path: candidate, managedByHienvs: managed }
          }
        } catch { /* 跳过 */ }
      }
    }
  }
  return { toolId, found: false }
}

/** 运行 `<currentDir>/bin/<bin>` 获取版本输出（健康检查用） */
export function runVersionCommand(toolId: string, currentDir: string, platform: string): string | null {
  const bins: Record<string, string[]> = { jdk: ['java', '-version'], java: ['java', '-version'], maven: ['mvn', '-version'], go: ['go', 'version'], node: ['node', '--version'] }
  const spec = bins[toolId]
  if (!spec) return null
  try {
    const binDir = path.join(currentDir, 'bin')
    const exe = platform === 'windows' ? `${spec[0]}.exe` : spec[0]
    const full = path.join(binDir, exe)
    if (!fs.existsSync(full) && platform === 'windows') {
      // mvn 是 .cmd
      const cmd = path.join(binDir, `${spec[0]}.cmd`)
      if (!fs.existsSync(cmd)) return null
      const out = execSync(`"${cmd}" ${spec.slice(1).join(' ')}`, { encoding: 'utf-8', timeout: 30000, windowsHide: true })
      return out.split('\n')[0]?.trim() ?? null
    }
    const out = execSync(`"${full}" ${spec.slice(1).join(' ')}`, { encoding: 'utf-8', timeout: 30000, windowsHide: true })
    return out.split('\n')[0]?.trim() ?? null
  } catch {
    return null
  }
}
