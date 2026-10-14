// 计划解析器：(工具清单, 版本键, 平台) → 可执行的任务计划（模板已渲染）
import path from 'node:path'
import type { LoadedTool } from './types'
import { mergeWorkflow, stepTitle } from './merge'
import { renderDeep, safeVersionSegment, splitVersionKey, makeVersionKey } from '@shared/template'
import type { ManifestStep, AssetDef, PlatformDef, ToolEnvDef } from '@shared/registry-types'
import type { TaskContext, ResolvedStep } from '../engine/types'
import { buildEnvPlan, type ActiveToolRef } from '../services/env/planner'
import type { HienvsPaths } from '../core/paths'

export interface ResolverDeps {
  paths: HienvsPaths
  mirrorPolicy: 'auto' | 'mainland-first' | 'official-first'
  proxy?: string
  platform: 'windows' | 'darwin' | 'linux'
  arch: string
  platformKey: string
  osSeparator: string
  exeExt: string
}

export class ResolveError extends Error {}

function inferArchive(url: string): 'zip' | 'tar.gz' | 'tar.xz' {
  const u = url.toLowerCase()
  if (u.endsWith('.zip')) return 'zip'
  if (u.endsWith('.tar.xz') || u.endsWith('.txz')) return 'tar.xz'
  return 'tar.gz'
}

function assetFileName(asset: AssetDef): string {
  if (asset.fileName) return asset.fileName
  try {
    const u = new URL(asset.url)
    return decodeURIComponent(u.pathname.split('/').pop() ?? 'download.bin')
  } catch {
    return asset.url.split('/').pop() ?? 'download.bin'
  }
}

/** 清单中发行商定义（zod 推断类型） */
type ManifestDist = NonNullable<LoadedTool['manifest']['distributions']>[string]

export class PlanResolver {
  constructor(private deps: ResolverDeps) {}

  /** 工具的发行商定义列表；无 distributions 时返回单元素 [undefined] */
  private distributionsOf(tool: LoadedTool): { id?: string; def?: ManifestDist }[] {
    const dists = tool.manifest.distributions
    if (dists && Object.keys(dists).length > 0) {
      return Object.entries(dists).map(([id, def]) => ({ id, def }))
    }
    return [{ id: undefined, def: undefined }]
  }

  /** 发行商工具解析 dist → 定义；未知发行商抛错 */
  private resolveDist(tool: LoadedTool, dist?: string): ManifestDist | undefined {
    const dists = tool.manifest.distributions
    if (!dists || Object.keys(dists).length === 0) return undefined
    if (!dist) throw new ResolveError(`工具 ${tool.toolId} 需要指定发行商（可选: ${Object.keys(dists).join(', ')}）`)
    const def = dists[dist]
    if (!def) throw new ResolveError(`工具 ${tool.toolId} 没有发行商 ${dist}（可选: ${Object.keys(dists).join(', ')}）`)
    return def
  }

  private platformsOf(tool: LoadedTool, dist?: string): Record<string, PlatformDef> {
    const def = this.resolveDist(tool, dist)
    return (def?.platforms ?? tool.manifest.platforms ?? {}) as Record<string, PlatformDef>
  }

  /** 版本目录：多发行商工具含发行商层级 <toolId>/<dist>/v<version> */
  private versionDirOf(toolId: string, dist: string | undefined, version: string): string {
    const seg = 'v' + safeVersionSegment(version)
    return dist
      ? path.join(this.deps.paths.toolsDir, toolId, dist, seg)
      : path.join(this.deps.paths.toolsDir, toolId, seg)
  }

  /** 当前平台可用的平台定义与资产；versionKey 为 dist@version 或裸版本；返回 null 表示平台不可安装 */
  resolvePlatform(tool: LoadedTool, versionKey: string): { platform: PlatformDef; asset: AssetDef; archive: string; dist?: string; version: string } | null {
    const { dist, version } = splitVersionKey(versionKey)
    this.resolveDist(tool, dist)
    const platforms = this.platformsOf(tool, dist)
    const plat = platforms[this.deps.platformKey] ?? platforms[this.deps.platform]
    if (!plat) return null
    const asset = plat.assets?.[version]
    if (!asset) return null
    const archive = plat.archive ?? inferArchive(asset.url)
    return { platform: plat, asset, archive, dist, version }
  }

  /** 当前平台可安装的版本键列表（多发行商工具为所有发行商版本的并集） */
  availableVersions(tool: LoadedTool): string[] {
    const out: string[] = []
    for (const { id: distId } of this.distributionsOf(tool)) {
      const platforms = this.platformsOf(tool, distId)
      const plat = platforms[this.deps.platformKey] ?? platforms[this.deps.platform]
      for (const v of Object.keys(plat?.assets ?? {})) out.push(makeVersionKey(distId, v))
    }
    return out
  }

  /** 内置默认安装工作流（清单未提供 workflows.install 时） */
  private defaultInstallSteps(asset: AssetDef, stripComponents: number): ManifestStep[] {
    return [
      {
        id: 'download',
        type: 'download',
        url: '{{asset.url}}',
        fileName: '{{asset.fileName}}',
        sha256: '{{asset.sha256}}',
        mirrors: asset.mirrors ?? [],
        retry: { attempts: 3, backoffMs: 2000, factor: 2 }
      },
      {
        id: 'extract',
        type: 'extract',
        archive: '{{asset.archive}}',
        stripComponents,
        to: '{{versionDir}}'
      }
    ]
  }

  /** 版本级工作流覆盖层（发行商级优先，工具级兜底） */
  private versionLayer(tool: LoadedTool, dist: string | undefined, version: string): WorkflowLayer | undefined {
    const distDef = dist ? tool.manifest.distributions?.[dist] : undefined
    const vo = distDef?.versionOverrides?.[version] ?? tool.manifest.versionOverrides?.[version]
    if (!vo) return undefined
    return { install: vo.workflowOverrides?.install ?? undefined }
  }

  private buildInstallSteps(tool: LoadedTool, dist: string | undefined, version: string, plat: PlatformDef, asset: AssetDef): { steps: ManifestStep[]; warnings: string[] } {
    const strip = (plat as { stripComponents?: number }).stripComponents ?? 1
    const base = tool.manifest.workflows?.install ?? this.defaultInstallSteps(asset, strip)
    const { steps, warnings } = mergeWorkflow(base, [plat.workflowOverrides, this.versionLayer(tool, dist, version)])
    // 自动追加 env.apply（存在 env 声明且工作流中没有显式 env.apply 时）
    if (tool.manifest.env && !steps.some((s) => s.type === 'env.apply')) {
      const verifyIdx = steps.findIndex((s) => s.type === 'verify')
      const envApply: ManifestStep = { id: 'env.apply', type: 'env.apply' }
      if (verifyIdx >= 0) steps.splice(verifyIdx, 0, envApply)
      else steps.push(envApply)
    }
    return { steps, warnings }
  }

  private templateVars(tool: LoadedTool, dist: string | undefined, version: string, asset: AssetDef, archive: string, taskId: string): Record<string, string> {
    const d = this.deps
    const sep = d.osSeparator
    const versionDir = this.versionDirOf(tool.toolId, dist, version)
    const currentDir = path.join(d.paths.toolsDir, tool.toolId, 'current')
    return {
      toolId: tool.toolId,
      name: tool.manifest.name,
      version,
      dist: dist ?? '',
      versionDir,
      currentDir,
      toolsDir: d.paths.toolsDir,
      hienvsHome: d.paths.home,
      tmpDir: path.join(d.paths.tmpDir, `task-${taskId}`),
      cacheDir: dist
        ? path.join(d.paths.downloadsDir, tool.toolId, dist, safeVersionSegment(version))
        : path.join(d.paths.downloadsDir, tool.toolId, safeVersionSegment(version)),
      downloadsDir: d.paths.downloadsDir,
      os: d.platform,
      arch: d.arch,
      platform: d.platformKey,
      sep,
      ext: d.exeExt,
      'asset.url': asset.url,
      'asset.sha256': asset.sha256 ?? '',
      'asset.fileName': assetFileName(asset),
      'asset.size': asset.size !== undefined ? String(asset.size) : '',
      'asset.archive': archive
    }
  }

  private toResolvedSteps(steps: ManifestStep[], vars: Record<string, string>): ResolvedStep[] {
    return steps.map((s) => {
      const { id, type, retry, timeoutSec, onFailure, ...params } = s
      const rendered = renderDeep(params, vars) as Record<string, unknown>
      // 空字符串模板参数还原为 undefined（如无 sha256）
      for (const [k, v] of Object.entries(rendered)) {
        if (v === '') delete rendered[k]
      }
      return {
        id: id ?? `${type}#x`,
        type,
        title: stepTitle(s),
        params: rendered,
        retry: retry as ResolvedStep['retry'],
        timeoutSec: timeoutSec as number | undefined,
        onFailure: onFailure as 'rollback' | 'keep' | undefined
      }
    })
  }

  buildInstallTask(tool: LoadedTool, versionKey: string, taskId: string, completedStepIds: string[] = [], scope: 'user' | 'system' = 'user', preferredUrl?: string): TaskContext {
    const resolved = this.resolvePlatform(tool, versionKey)
    if (!resolved) throw new ResolveError(`工具 ${tool.toolId} 在当前平台(${this.deps.platformKey})没有 ${versionKey} 的资产`)
    const { platform, asset, archive, dist, version } = resolved
    const { steps, warnings } = this.buildInstallSteps(tool, dist, version, platform, asset)
    for (const w of warnings) console.warn(`[resolver] ${tool.toolId}: ${w}`)

    const vars = this.templateVars(tool, dist, version, asset, archive, taskId)
    const d = this.deps

    const envPlan = tool.manifest.env
      ? buildEnvPlan({
          activeTools: [{ toolId: tool.toolId, version, dist, env: tool.manifest.env }],
          scope,
          platform: d.platform,
          toolsDir: d.paths.toolsDir
        })
      : undefined

    return {
      taskId,
      kind: completedStepIds.length ? 'resume-install' : 'install',
      toolId: tool.toolId,
      toolName: tool.manifest.name,
      version: versionKey,
      paths: {
        hienvsHome: d.paths.home,
        toolsDir: d.paths.toolsDir,
        versionDir: vars.versionDir,
        currentDir: vars.currentDir,
        tmpDir: vars.tmpDir,
        cacheDir: vars.cacheDir,
        downloadsDir: d.paths.downloadsDir
      },
      platform: d.platform,
      arch: d.arch,
      mirrorPolicy: d.mirrorPolicy,
      proxy: d.proxy,
      preferredUrl,
      envScope: scope,
      envPlan,
      steps: this.toResolvedSteps(steps, vars),
      completedStepIds
    }
  }

  /** 组合所有激活工具（含将要激活的）构建完整 EnvPlan */
  buildFullEnvPlan(activeTools: ActiveToolRef[], scope: 'user' | 'system'): ReturnType<typeof buildEnvPlan> {
    return buildEnvPlan({
      activeTools,
      scope,
      platform: this.deps.platform,
      toolsDir: this.deps.paths.toolsDir
    })
  }

  buildActivateTask(tool: LoadedTool, versionKey: string, taskId: string, allActive: ActiveToolRef[], scope: 'user' | 'system'): TaskContext {
    const d = this.deps
    const { dist, version } = splitVersionKey(versionKey)
    this.resolveDist(tool, dist)
    const envPlan = this.buildFullEnvPlan(allActive, scope)
    const versionDir = this.versionDirOf(tool.toolId, dist, version)
    const currentDir = path.join(d.paths.toolsDir, tool.toolId, 'current')
    const vars = { versionDir, currentDir, sep: d.osSeparator, ext: d.exeExt }
    const steps = this.toResolvedSteps(
      [
        { id: 'link-current', type: 'builtin.link-current', target: '{{versionDir}}', link: '{{currentDir}}' },
        { id: 'env.apply', type: 'env.apply' }
      ],
      vars
    )
    return {
      taskId,
      kind: 'activate',
      toolId: tool.toolId,
      toolName: tool.manifest.name,
      version: versionKey,
      paths: {
        hienvsHome: d.paths.home,
        toolsDir: d.paths.toolsDir,
        versionDir,
        currentDir,
        tmpDir: path.join(d.paths.tmpDir, `task-${taskId}`),
        cacheDir: d.paths.downloadsDir,
        downloadsDir: d.paths.downloadsDir
      },
      platform: d.platform,
      arch: d.arch,
      mirrorPolicy: d.mirrorPolicy,
      proxy: d.proxy,
      envScope: scope,
      envPlan,
      steps,
      completedStepIds: []
    }
  }

  /** 被移除工具的环境变量以空值并入计划 → Windows 上删除该变量，Unix 托管块重写后自然消失 */
  private withRemovedToolVars(envPlan: ReturnType<typeof buildEnvPlan>, tool: LoadedTool): void {
    if (!tool.manifest.env) return
    const remaining = new Set(envPlan.vars.map((v) => v.name))
    for (const v of tool.manifest.env.vars ?? []) {
      if (!remaining.has(v.name)) envPlan.vars.push({ name: v.name, value: '', expand: v.expand })
    }
  }

  /** 取消激活：清理环境变量与 current 链接，保留已安装版本 */
  buildDeactivateTask(tool: LoadedTool, versionKey: string, taskId: string, remainingActive: ActiveToolRef[], scope: 'user' | 'system'): TaskContext {
    const d = this.deps
    const { dist, version } = splitVersionKey(versionKey)
    if (dist) this.resolveDist(tool, dist)
    const envPlan = this.buildFullEnvPlan(remainingActive, scope)
    this.withRemovedToolVars(envPlan, tool)
    const versionDir = this.versionDirOf(tool.toolId, dist, version)
    const currentDir = path.join(d.paths.toolsDir, tool.toolId, 'current')
    const vars = { versionDir, currentDir, sep: d.osSeparator, ext: d.exeExt }
    const steps = this.toResolvedSteps(
      [
        { id: 'env.remove', type: 'env.apply' },
        { id: 'unlink', type: 'builtin.unlink-current', link: '{{currentDir}}' }
      ],
      vars
    )
    return {
      taskId,
      kind: 'deactivate',
      toolId: tool.toolId,
      toolName: tool.manifest.name,
      version: versionKey,
      paths: {
        hienvsHome: d.paths.home,
        toolsDir: d.paths.toolsDir,
        versionDir,
        currentDir,
        tmpDir: path.join(d.paths.tmpDir, `task-${taskId}`),
        cacheDir: d.paths.downloadsDir,
        downloadsDir: d.paths.downloadsDir
      },
      platform: d.platform,
      arch: d.arch,
      mirrorPolicy: d.mirrorPolicy,
      proxy: d.proxy,
      envScope: scope,
      envPlan,
      steps,
      completedStepIds: []
    }
  }

  buildUninstallTask(tool: LoadedTool, versionKey: string | undefined, taskId: string, remainingActive: ActiveToolRef[], activeVersion: string | null, scope: 'user' | 'system'): TaskContext {
    const d = this.deps
    const { dist, version } = versionKey ? splitVersionKey(versionKey) : { dist: undefined, version: undefined }
    if (dist) this.resolveDist(tool, dist)
    const envPlan = this.buildFullEnvPlan(remainingActive, scope)
    this.withRemovedToolVars(envPlan, tool)
    const versionDir = version
      ? this.versionDirOf(tool.toolId, dist, version)
      : path.join(d.paths.toolsDir, tool.toolId)
    const currentDir = path.join(d.paths.toolsDir, tool.toolId, 'current')
    const vars = { versionDir, currentDir, sep: d.osSeparator, ext: d.exeExt }
    const steps = this.toResolvedSteps(
      [
        { id: 'env.remove', type: 'env.apply' },
        ...(activeVersion ? [{ id: 'unlink', type: 'builtin.unlink-current', link: '{{currentDir}}' }] : []),
        { id: 'delete', type: 'fs.delete', path: '{{versionDir}}', recursive: true }
      ],
      vars
    )
    return {
      taskId,
      kind: 'uninstall',
      toolId: tool.toolId,
      toolName: tool.manifest.name,
      version: versionKey,
      paths: {
        hienvsHome: d.paths.home,
        toolsDir: d.paths.toolsDir,
        versionDir,
        currentDir,
        tmpDir: path.join(d.paths.tmpDir, `task-${taskId}`),
        cacheDir: d.paths.downloadsDir,
        downloadsDir: d.paths.downloadsDir
      },
      platform: d.platform,
      arch: d.arch,
      mirrorPolicy: d.mirrorPolicy,
      proxy: d.proxy,
      envScope: scope,
      envPlan,
      steps,
      completedStepIds: []
    }
  }
}

interface WorkflowLayer {
  install?: ManifestStep[]
}
