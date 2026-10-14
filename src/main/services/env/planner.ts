// 环境变量计划生成：根据激活中的工具列表计算目标 EnvPlan（纯函数，可测试）
import os from 'node:os'
import path from 'node:path'
import type { EnvPlan } from '@shared/task-types'
import { renderTemplate, safeVersionSegment } from '@shared/template'
import type { ToolEnvDef } from '@shared/registry-types'

export interface ActiveToolRef {
  toolId: string
  version: string
  /** 发行商 id（多发行商工具，如 jdk 的 temurin） */
  dist?: string
  env?: ToolEnvDef
}

export interface PlannerInput {
  activeTools: ActiveToolRef[]
  scope: 'user' | 'system'
  platform: 'windows' | 'darwin' | 'linux'
  /** 工具安装目录（内含 <toolId>/<version> 与 current 链接） */
  toolsDir: string
}

/**
 * 计算所有激活工具合并后的环境变量目标状态。
 * Windows 的 PATH 条目在安装目录位于用户目录下时使用 %USERPROFILE% 引用（REG_EXPAND_SZ 展开），否则用绝对路径。
 */
export function buildEnvPlan(input: PlannerInput): EnvPlan {
  const vars: EnvPlan['vars'] = []
  const pathEntries: string[] = []
  const { platform, toolsDir, activeTools, scope } = input
  const userHome = os.homedir()

  for (const tool of activeTools) {
    if (!tool.env) continue
    const versionDir = tool.dist
      ? path.join(toolsDir, tool.toolId, tool.dist, 'v' + safeVersionSegment(tool.version))
      : path.join(toolsDir, tool.toolId, 'v' + safeVersionSegment(tool.version))
    const currentDir = path.join(toolsDir, tool.toolId, 'current')
    const toolVars: Record<string, string> = {
      version: tool.version,
      dist: tool.dist ?? '',
      versionDir,
      currentDir,
      hienvsHome: toolsDir,
      toolsDir
    }
    for (const v of tool.env.vars ?? []) {
      vars.push({ name: v.name, value: renderTemplate(v.value, toolVars), expand: v.expand })
    }
    for (const dir of tool.env.pathDirs ?? []) {
      const rel = renderTemplate(dir, toolVars)
      const abs = path.join(currentDir, rel)
      if (platform === 'windows' && abs.toLowerCase().startsWith(userHome.toLowerCase() + path.sep)) {
        // %USERPROFILE% 形式保证 REG_EXPAND_SZ 展开且与用户名无关
        const relFromHome = path.relative(userHome, abs)
        pathEntries.push('%USERPROFILE%\\' + relFromHome.split(path.sep).join('\\'))
      } else {
        pathEntries.push(abs)
      }
    }
  }

  const rcFiles = platform === 'windows' ? [] : rcFilesFor(platform)
  return { scope, platform, vars, pathEntries, rcFiles }
}

function rcFilesFor(platform: 'darwin' | 'linux'): string[] {
  const home = process.env.HOME ?? ''
  if (platform === 'darwin') {
    return [path.join(home, '.zshrc'), path.join(home, '.zprofile')]
  }
  const shell = process.env.SHELL ?? '/bin/bash'
  if (shell.includes('zsh')) {
    return [path.join(home, '.zshrc'), path.join(home, '.zprofile')]
  }
  return [path.join(home, '.bashrc'), path.join(home, '.profile')]
}

/** 托管块标记 */
export const BLOCK_BEGIN = '# >>> hienvs managed block v1 (do not edit) >>>'
export const BLOCK_END = '# <<< hienvs managed block v1 <<<'

/** 生成 shell 托管块内容 */
export function renderManagedBlock(plan: EnvPlan): string {
  if (plan.vars.length === 0 && plan.pathEntries.length === 0) return ''
  const lines: string[] = [BLOCK_BEGIN]
  lines.push(`export HIENVS_HOME="$HOME/.hienvs"`)
  for (const v of plan.vars) {
    lines.push(`export ${v.name}="${v.value}"`)
  }
  if (plan.pathEntries.length > 0) {
    const joined = plan.pathEntries.map((p) => `"${p}"`).join(':')
    lines.push(`export PATH=${joined}:$PATH`)
  }
  lines.push(BLOCK_END)
  return lines.join('\n')
}

/**
 * PATH 托管策略（纯函数）：从现有 PATH 中剔除全部托管条目，再把托管条目按顺序插回原托管块位置（无则最前）。
 * Windows 下比较时大小写不敏感、忽略引号与 %VAR% 形式差异。
 */
export function rebuildPath(currentPath: string, managedEntries: string[], delimiter: string, caseInsensitive: boolean): string {
  const norm = (s: string): string => {
    let v = s.trim().replace(/^"|"$/g, '')
    if (caseInsensitive) v = v.toLowerCase()
    return v
  }
  const managedNorm = managedEntries.map((e) => norm(e))
  const isManaged = (entry: string): boolean => {
    const n = norm(entry)
    if (managedNorm.includes(n)) return true
    // %USERPROFILE% 与实际路径的等价处理
    if (/^%userprofile%/i.test(entry)) return true
    // hienvs 托管条目必含 current 链接段（任意安装目录下均成立）
    if (/[/\\]current([/\\]|$)/i.test(entry)) return true
    if (/[/\\]\.hienvs([/\\]|$)/i.test(entry) && /[/\\](current|tools)([/\\]|$)/i.test(entry)) return true
    return false
  }

  const parts = currentPath.split(delimiter).filter((p) => p.length > 0)
  const kept: string[] = []
  let insertAt = 0
  for (const p of parts) {
    if (isManaged(p)) continue
    kept.push(p)
  }
  // 原托管块位置：第一个 hienvs 相关条目的位置（剔除后近似为原位置）
  const firstManagedIdx = parts.findIndex((p) => isManaged(p))
  if (firstManagedIdx > 0) {
    const nonManagedBefore = parts.slice(0, firstManagedIdx).filter((p) => !isManaged(p)).length
    insertAt = Math.min(nonManagedBefore, kept.length)
  }
  const out = [...kept]
  out.splice(insertAt, 0, ...managedEntries)
  return out.join(delimiter)
}

/** 提取 PATH 中属于 hienvs 托管的条目 */
export function extractManagedEntries(currentPath: string, delimiter: string): string[] {
  return currentPath
    .split(delimiter)
    .filter((p) => /[/\\]current[/\\]/i.test(p) || /[/\\]\.hienvs[/\\]tools[/\\]/i.test(p) || /^%USERPROFILE%\\/i.test(p))
}
