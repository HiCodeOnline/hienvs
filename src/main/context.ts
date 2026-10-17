// 应用上下文：装配设置/路径/清单/解析器/任务管理器，对外提供领域操作
import { app, session, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildPaths, defaultHienvsHome, type HienvsPaths } from './core/paths'
import { settingsStore } from './core/settings'
import { InstalledStore } from './core/installed-store'
import { logger } from './core/logger'
import { removeLink } from './core/links'
import { TaskManager } from './tasks/manager'
import { loadRegistries, initRegistryEnv, validateSource } from './registry/sources'
import type { LoadedTool } from './registry/sources'
import { fetchIcon, readCachedIcon, writeIcon } from './registry/icons'
import { PlanResolver, ResolveError } from './registry/resolver'
import { compareVersions, currentOsName, makeVersionKey, safeVersionSegment, splitVersionKey } from '@shared/template'
import { matchPlatform, normalizeArch } from './registry/platform-match'
import type { RegistrySnapshot, ToolSummary, VersionInfo, RegistrySource, RegistrySourceStatus, MirrorSource } from '@shared/registry-types'
import type { EnvPlan, EnvPreview, EnvSnapshotData, TaskSnapshot } from '@shared/task-types'
import type { AppInfo, AppSettings, DiskUsage, SystemToolInfo } from '@shared/tool-types'
import { buildEnvPlan, renderManagedBlock, type ActiveToolRef } from './services/env/planner'
import { previewEnvPlan, applyEnvPlan, readWindowsUserPath, readManagedBlock, parseBlockVars, parseBlockPathEntries, unixManagedBlockFiles } from './services/env/apply'
import { readWindowsVar } from './services/env/apply-windows'
import { patchProcessEnv, detectSystemTool, runVersionCommand } from './services/activator'
import type { TaskContext, StepRunHelpers } from './engine/types'

/** 重置防护：拒绝清理盘符根目录、用户主目录以及包含应用自身安装位置的目录 */
function isSafeToWipe(dir: string, appBase: string): boolean {
  if (path.parse(dir).root === dir) return false
  if (path.resolve(dir) === path.resolve(os.homedir())) return false
  const norm = (p: string) => path.resolve(p).toLowerCase() + path.sep
  if (norm(appBase).startsWith(norm(dir))) return false
  return true
}

/** 操作系统展示名称：Windows 按内核构建号区分 10/11，macOS 由 Darwin 内核版本换算 */
function currentOsLabel(): string {
  const release = os.release()
  if (process.platform === 'win32') {
    const build = Number(release.split('.')[2] ?? 0)
    return `Windows ${build >= 22000 ? '11' : '10'}`
  }
  if (process.platform === 'darwin') {
    const major = Number(release.split('.')[0] ?? 0)
    return major >= 20 ? `macOS ${major - 9}` : `macOS 10.${Math.max(major - 4, 0)}`
  }
  return 'Linux'
}

/** 某资产的可选下载源列表：官方源在前，具名镜像源在后（含各自可选 size） */
function assetSources(asset: { url: string; size?: number; mirrors?: MirrorSource[] }): MirrorSource[] {
  return [{ name: '官方源', url: asset.url, size: asset.size }, ...((asset.mirrors ?? []) as MirrorSource[]).map((m) => (m.size !== undefined ? m : { name: m.name, url: m.url }))]
}

/** 展示用大小：优先资产级 size，未配置时回退第一个带 size 的镜像源 */
function assetDisplaySize(asset: { size?: number; mirrors?: MirrorSource[] }): number | undefined {
  return asset.size ?? ((asset.mirrors ?? []) as MirrorSource[]).find((m) => m.size !== undefined)?.size
}

export class AppContext {
  paths: HienvsPaths
  installed: InstalledStore
  manager: TaskManager
  private registryTools: LoadedTool[] = []
  private registryStatuses: RegistrySourceStatus[] = []
  private registryLoading: Promise<void> | null = null
  /** 工具图标：toolId -> 本地 data URL（清单源配置 icon 时下载） */
  private icons = new Map<string, string>()
  resolver: PlanResolver
  readonly osName: 'windows' | 'darwin' | 'linux'
  readonly arch: string
  readonly platformKey: string
  readonly sep: string
  readonly exeExt: string

  /**
   * dev 环境自动注入 webui 本地开发源（仅首次，标记持久化后不再重复）：
   * 指向本地静态服务的 zh-CN 源（npm run webui:serve / serve out），打包版无此逻辑
   */
  private seedDevSource(settings: AppSettings): void {
    if (app.isPackaged || settings.devSourceSeeded) return
    const seeded: RegistrySource = {
      id: 'dev-webui',
      type: 'remote',
      name: 'hienvs 官方软件源',
      location: 'http://127.0.0.1:4173/zh-CN/index.json',
      autoUpdate: true
    }
    const next = { ...settings, registries: [...settings.registries, seeded], devSourceSeeded: true }
    settingsStore.set(next)
    logger.info('[registry] dev 环境已注入 webui 本地开发源: ' + seeded.location)
  }

  constructor(private notify: (channel: string, payload: unknown) => void) {
    const settings = settingsStore.load()
    this.paths = buildPaths({ home: defaultHienvsHome(), installDir: settings.installDir, downloadDir: settings.downloadDir })
    initRegistryEnv({
      cacheDir: path.join(this.paths.cacheDir, 'registry')
    })
    this.installed = new InstalledStore(this.paths.installedFile)
    this.manager = new TaskManager(this.paths.tasksDir, this.paths.logsDir, (ch, payload) => notify(ch, payload), (snap) =>
      this.onTaskFinished(snap)
    )
    this.osName = currentOsName(process.platform)
    // 严格架构识别：ia32→x86（32 位 Windows）、arm→arm（32 位 ARM），不再把 32 位误判为 x64
    this.arch = normalizeArch(process.arch)
    this.platformKey = `${this.osName}-${this.arch}`
    this.sep = path.sep
    this.exeExt = this.osName === 'windows' ? '.exe' : ''
    this.resolver = new PlanResolver({
      paths: this.paths,
      mirrorPolicy: settings.mirrorPolicy,
      proxy: settings.proxy,
      proxyAuth: this.proxyAuthOf(settings),
      platform: this.osName,
      arch: this.arch,
      platformKey: this.platformKey,
      osSeparator: path.sep,
      exeExt: this.exeExt
    })
    this.manager.restore()
    this.seedDevSource(settings)
    this.applyProxy(settings)
    // 旧版 java 工具数据迁移（jdk 发行商机制引入前的存量安装）
    this.migrateLegacyJava()
    // 启动时同步已激活工具到进程环境
    this.patchEnvFromStore()
  }

  /** 旧版 java 工具 → jdk(temurin) 迁移：目录移动 + 安装记录重写 + current 链接重建 */
  private migrateLegacyJava(): void {
    const legacy = this.installed.getTool('java')
    const keys = Object.keys(legacy.versions)
    if (keys.length === 0) return
    const javaRoot = path.join(this.paths.toolsDir, 'java')
    const temurinRoot = path.join(this.paths.toolsDir, 'jdk', 'temurin')
    for (const v of keys) {
      const seg = 'v' + safeVersionSegment(v)
      const from = path.join(javaRoot, seg)
      const to = path.join(temurinRoot, seg)
      try {
        if (fs.existsSync(from) && !fs.existsSync(to)) {
          fs.mkdirSync(path.dirname(to), { recursive: true })
          fs.renameSync(from, to)
        }
        this.installed.recordInstalled('jdk', `temurin@${v}`, legacy.versions[v].sourceId)
      } catch (e) {
        logger.warn(`[migrate] java ${v} 迁移失败: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (legacy.activeVersion) {
      const target = path.join(temurinRoot, 'v' + safeVersionSegment(legacy.activeVersion))
      const cur = path.join(this.paths.toolsDir, 'jdk', 'current')
      try {
        removeLink(cur)
        fs.symlinkSync(target, cur, 'junction')
      } catch (e) {
        logger.warn(`[migrate] current 链接重建失败: ${e instanceof Error ? e.message : String(e)}`)
      }
      this.installed.recordActive('jdk', `temurin@${legacy.activeVersion}`, legacy.envApplied)
    }
    try {
      fs.rmSync(javaRoot, { recursive: true, force: true })
    } catch { /* 忽略 */ }
    this.installed.recordUninstalled('java')
    logger.info('[migrate] 旧版 java 已迁移至 jdk (temurin)')
  }

  /** 将代理配置应用到 Electron 默认会话（影响 net.fetch 拉取远程清单） */
  private applyProxy(s: Pick<AppSettings, 'proxy' | 'proxyUsername' | 'proxyPassword'>): void {
    const ses = session.defaultSession
    if (!ses) return
    const proxy = s.proxy?.trim()
    if (proxy) {
      void ses.setProxy({ proxyRules: proxy })
    } else {
      void ses.setProxy({ mode: 'direct' })
    }
    // 代理认证：配置了用户名时通过 login 事件响应 407 质询；未配置则恢复默认（无需认证）。
    // Session 类型未声明 'login' 事件（运行时支持），通过 EventEmitter 接口注册
    const emitter = ses as unknown as NodeJS.EventEmitter
    emitter.removeAllListeners('login')
    const username = s.proxyUsername?.trim()
    if (proxy && username) {
      const password = s.proxyPassword ?? ''
      emitter.on('login', (_event: unknown, _details: unknown, _authInfo: unknown, callback: (u?: string, p?: string) => void) =>
        callback(username, password)
      )
    }
  }

  /** 下载链路（undici ProxyAgent）使用的代理认证凭据：仅配置了代理与用户名时生效 */
  private proxyAuthOf(s: Pick<AppSettings, 'proxy' | 'proxyUsername' | 'proxyPassword'>): { username: string; password: string } | undefined {
    const username = s.proxyUsername?.trim()
    if (!s.proxy?.trim() || !username) return undefined
    return { username, password: s.proxyPassword ?? '' }
  }

  private patchEnvFromStore(): void {
    const refs = this.activeToolRefs()
    if (refs.length === 0) return
    const plan = buildEnvPlan({ activeTools: refs, scope: this.installed.getEnvScope(), platform: this.osName, toolsDir: this.paths.toolsDir })
    patchProcessEnv(this.installed, plan.vars, plan.pathEntries)
  }

  get settings() {
    return settingsStore.get()
  }

  updateSettings(patch: Parameters<typeof settingsStore.set>[0]) {
    const prevSources = JSON.stringify(settingsStore.get().registries)
    const next = settingsStore.set(patch)
    if (patch.installDir || patch.downloadDir) {
      this.paths = buildPaths({ home: defaultHienvsHome(), installDir: next.installDir, downloadDir: next.downloadDir })
    }
    this.manager.setConcurrency(next.taskConcurrency)
    this.applyProxy(next)
    this.resolver = new PlanResolver({
      paths: this.paths,
      mirrorPolicy: next.mirrorPolicy,
      proxy: next.proxy,
      proxyAuth: this.proxyAuthOf(next),
      platform: this.osName,
      arch: this.arch,
      platformKey: this.platformKey,
      osSeparator: path.sep,
      exeExt: this.exeExt
    })
    // 清单源配置变更后需重新加载清单，否则工具列表与状态栏仍显示旧源
    if (patch.registries && JSON.stringify(next.registries) !== prevSources) {
      void this.refreshRegistry(true).catch((e) =>
        logger.warn(`[registry] 清单源配置变更后加载失败: ${e instanceof Error ? e.message : String(e)}`)
      )
    }
    return next
  }

  // ---------------- 注册表 ----------------
  async refreshRegistry(force = false, opts: { autoOnly?: boolean; fetchSourceId?: string } = {}): Promise<RegistrySnapshot> {
    if (this.registryLoading) {
      // 定时自动更新不与进行中的加载并发；手动调用则等待当前加载完成后继续
      if (opts.autoOnly) await this.registryLoading.catch(() => undefined)
      else if (!force) {
        await this.registryLoading
        return this.snapshot()
      } else {
        await this.registryLoading.catch(() => undefined)
      }
    }
    const s = this.settings
    this.registryLoading = (async () => {
      const res = await loadRegistries(s.registries, {
        autoOnly: opts.autoOnly,
        fetchSourceId: opts.fetchSourceId
      })
      this.registryTools = res.tools
      this.registryStatuses = res.statuses
      logger.info(`[registry] 加载完成: ${res.tools.length} 个工具`)
      for (const st of res.statuses) {
        const suffix = st.error ? ` - ${st.error.slice(0, 200)}` : ''
        logger.info(`[registry] 源 ${st.name}: ${st.status}, ${st.toolCount} 个工具${suffix}`)
      }
      // 清单数据就绪即刻推送快照（状态栏、源列表随之更新），不等图标下载
      this.notify('registry:updated', { snapshot: this.snapshot() })
      // 图标增量同步放到后台，避免阻塞清单返回；完成后再次推送以刷新图标
      void this.syncIcons(res.tools).then(() => {
        this.notify('registry:updated', { snapshot: this.snapshot() })
      })
    })()
    try {
      await this.registryLoading
    } finally {
      this.registryLoading = null
    }
    return this.snapshot()
  }

  /** 图标缓存目录（固定于 ~/.hienvs/cache/icons） */
  private get iconsDir(): string {
    return path.join(this.paths.cacheDir, 'icons')
  }

  /** 图标元数据文件：toolId -> 上次下载的图标 URL，用于增量校验避免重复下载 */
  private get iconsMetaFile(): string {
    return path.join(this.iconsDir, 'icons.json')
  }

  private readIconsMeta(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this.iconsMetaFile, 'utf-8')) as Record<string, string>
    } catch {
      return {}
    }
  }

  private writeIconsMeta(meta: Record<string, string>): void {
    try {
      fs.mkdirSync(this.iconsDir, { recursive: true })
      fs.writeFileSync(this.iconsMetaFile, JSON.stringify(meta, null, 2), 'utf-8')
    } catch (e) {
      logger.warn(`[icon] 写入元数据失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * 同步清单工具图标：增量校验（URL 未变且本地缓存存在则跳过下载），
   * force 时全部重新下载；失败回退本地缓存，仍无则由渲染层展示首字母。
   */
  private async syncIcons(tools: LoadedTool[], force = false): Promise<void> {
    const dir = this.iconsDir
    const meta = force ? {} : this.readIconsMeta()
    const nextMeta: Record<string, string> = {}
    const next = new Map<string, string>()
    await Promise.all(
      tools.map(async (t) => {
        if (!t.icon) return
        nextMeta[t.toolId] = t.icon
        if (!force && meta[t.toolId] === t.icon) {
          const cached = readCachedIcon(dir, t.toolId)
          if (cached) {
            next.set(t.toolId, cached)
            return
          }
        }
        try {
          const res = await fetchIcon(t.icon)
          writeIcon(dir, t.toolId, res.ext, res.buffer)
          next.set(t.toolId, res.dataUrl)
        } catch (e) {
          const cached = readCachedIcon(dir, t.toolId)
          if (cached) next.set(t.toolId, cached)
          logger.warn(`[icon] ${t.toolId} 图标下载失败: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
    )
    this.icons = next
    // 清理已移除/不再配置图标的工具的缓存文件
    try {
      for (const name of fs.readdirSync(dir)) {
        if (name === 'icons.json') continue
        const toolId = name.slice(0, -path.extname(name).length)
        if (!(toolId in nextMeta)) fs.rmSync(path.join(dir, name), { force: true })
      }
    } catch {
      /* 目录不存在等 */
    }
    this.writeIconsMeta(nextMeta)
  }

  /** 手动更新单个远程源：重新拉取该源内容到本地缓存并重建快照（其余远程源用缓存） */
  async updateRegistrySource(sourceId: string): Promise<RegistrySnapshot> {
    const src = this.settings.registries.find((r) => r.id === sourceId)
    if (!src) throw new Error(`清单源不存在: ${sourceId}`)
    if (src.type !== 'remote') throw new Error('仅远程源支持更新')
    return this.refreshRegistry(true, { fetchSourceId: sourceId })
  }

  /** 添加源前的有效性校验（远程可达 + 索引结构合法），失败抛出具体原因 */
  async validateRegistrySource(type: 'remote' | 'local', location: string): Promise<{ name?: string }> {
    return validateSource(type, location)
  }

  /** 清单源自动更新定时器：每 10 分钟拉取一次开启 autoUpdate 的远程源 */
  startRegistryAutoUpdate(): void {
    const INTERVAL_MS = 10 * 60 * 1000
    setInterval(() => {
      const hasAuto = this.settings.registries.some((r) => r.type === 'remote' && r.autoUpdate)
      if (!hasAuto) return
      void this.refreshRegistry(true, { autoOnly: true })
        .then(() => logger.info('[registry] 自动更新完成'))
        .catch((e) => logger.warn(`[registry] 自动更新失败: ${e instanceof Error ? e.message : String(e)}`))
    }, INTERVAL_MS)
  }

  ensureRegistryLoaded(): Promise<void> {
    if (this.registryTools.length > 0) return Promise.resolve()
    return this.refreshRegistry(true).then(() => undefined)
  }

  findTool(toolId: string): LoadedTool | undefined {
    return this.registryTools.find((t) => t.toolId === toolId)
  }

  /** 构建版本列表（多发行商工具按发行商依次输出，VersionInfo 携带 dist/distName 与复合 key） */
  private platformVersions(tool: LoadedTool): VersionInfo[] {
    const dists = tool.manifest.distributions
    const entries: { id?: string; name?: string; defaultVersion?: string; platforms: Record<string, import('@shared/registry-types').PlatformDef> }[] =
      dists && Object.keys(dists).length > 0
        ? Object.entries(dists).map(([id, def]) => ({ id, name: def.name, defaultVersion: def.defaultVersion, platforms: def.platforms }))
        : [{ id: undefined, name: undefined, defaultVersion: tool.manifest.defaultVersion, platforms: tool.manifest.platforms ?? {} }]
    const out: VersionInfo[] = []
    for (const { id: distId, name, defaultVersion, platforms } of entries) {
      const plat = matchPlatform(platforms, this.osName, this.arch)
      const all = new Map<string, VersionInfo>()
      for (const p of Object.values(platforms)) {
        for (const [v, asset] of Object.entries(p.assets ?? {})) {
          if (!all.has(v)) {
            all.set(v, { key: makeVersionKey(distId, v), version: v, dist: distId, distName: name, isDefault: defaultVersion === v, available: false, size: assetDisplaySize(asset), sha256: asset.sha256, sources: assetSources(asset) })
          }
        }
      }
      if (plat) {
        for (const [v, asset] of Object.entries(plat.assets ?? {})) {
          const e = all.get(v)
          if (e) {
            e.available = true
            e.size = assetDisplaySize(asset)
            e.sha256 = asset.sha256
            e.sources = assetSources(asset)
          } else {
            all.set(v, { key: makeVersionKey(distId, v), version: v, dist: distId, distName: name, isDefault: defaultVersion === v, available: true, size: assetDisplaySize(asset), sha256: asset.sha256, sources: assetSources(asset) })
          }
        }
      }
      out.push(...[...all.values()].sort((a, b) => -compareVersions(a.version, b.version)))
    }
    return out
  }

  snapshot(): RegistrySnapshot {
    const tools: ToolSummary[] = this.registryTools.map((t) => {
      const inst = this.installed.getTool(t.toolId)
      const versions = this.platformVersions(t)
      // 安装器类工具：激活版本资产配置了 launch 时暴露，前端据此展示「打开」按钮
      let launch: string | undefined
      if (inst.activeVersion) {
        try {
          launch = this.resolver.resolvePlatform(t, inst.activeVersion)?.asset.launch
        } catch {
          launch = undefined
        }
      }
      return {
        id: t.toolId,
        name: t.manifest.name,
        description: t.manifest.description,
        category: t.manifest.category,
        homepage: t.manifest.homepage,
        sourceId: t.sourceId,
        icon: this.icons.get(t.toolId),
        available: versions.some((v) => v.available),
        versions,
        defaultVersion: versions.find((v) => v.isDefault)?.key ?? t.manifest.defaultVersion,
        installedVersions: Object.keys(inst.versions),
        activeVersion: inst.activeVersion,
        launch
      }
    })
    return { tools, sources: this.registryStatuses, updatedAt: new Date().toISOString() }
  }

  // ---------------- 工具操作 ----------------

  /** 启动已激活版本配置的 launch 可执行文件（安装器类工具的「打开」按钮） */
  async launchTool(toolId: string): Promise<void> {
    await this.ensureRegistryLoaded()
    const tool = this.findTool(toolId)
    if (!tool) throw new Error(`未知工具: ${toolId}`)
    const inst = this.installed.getTool(toolId)
    if (!inst.activeVersion) throw new Error('工具没有激活版本')
    const resolved = this.resolver.resolvePlatform(tool, inst.activeVersion)
    if (!resolved?.asset.launch) throw new Error('该版本未配置 launch 入口，无法打开')
    const dir = this.resolver.versionDirOf(toolId, resolved.dist, resolved.version)
    // 相对路径基于版本目录解析，绝对路径直接使用
    const target = path.isAbsolute(resolved.asset.launch) ? resolved.asset.launch : path.join(dir, resolved.asset.launch)
    const err = await shell.openPath(target)
    if (err) throw new Error(err)
  }

  /** 重置应用：清理环境变量、删除全部配置/下载/工具/缓存目录后重启（高危操作，前端需二次确认） */
  async resetApp(): Promise<void> {
    const active = this.manager.list().filter((t) => t.status === 'running' || t.status === 'queued')
    if (active.length > 0) throw new Error('存在进行中的任务，请先取消或等待完成后再重置')

    // 清理已写入的环境变量：以空计划应用（移除全部托管块与 PATH 条目），失败不阻断
    try {
      const plan = buildEnvPlan({ activeTools: [], scope: this.installed.getEnvScope(), platform: this.osName, toolsDir: this.paths.toolsDir })
      await applyEnvPlan(
        { envPlan: plan, platform: this.osName } as unknown as TaskContext,
        { log: () => {}, undo: () => {} } as unknown as StepRunHelpers
      )
    } catch (e) {
      console.warn('[reset] 环境变量清理失败(忽略):', e)
    }

    // 删除下载目录、安装目录与用户目录 .hienvs（配置/状态/日志/缓存），带根目录与自删除防护
    const appBase = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
    const targets = [...new Set([this.paths.downloadsDir, this.paths.toolsDir, defaultHienvsHome()])]
    for (const dir of targets) {
      if (!isSafeToWipe(dir, appBase)) {
        console.warn(`[reset] 跳过危险目录: ${dir}`)
        continue
      }
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch (e) {
        console.warn(`[reset] 目录删除失败(忽略): ${dir}`, e)
      }
    }

    app.relaunch()
    app.exit(0)
  }
  async install(toolId: string, version: string, preferredUrl?: string): Promise<{ taskId: string }> {
    await this.ensureRegistryLoaded()
    const tool = this.findTool(toolId)
    if (!tool) throw new Error(`未知工具: ${toolId}`)
    const taskId = this.manager.newTaskId()
    const ctx = this.resolver.buildInstallTask(tool, version, taskId, [], this.installed.getEnvScope(), preferredUrl)
    this.manager.enqueue(ctx, ctx.steps.map((s) => ({ id: s.id, type: s.type, title: s.title })))
    return { taskId }
  }

  async activate(toolId: string, versionKey: string, scope: 'user' | 'system' = 'user'): Promise<{ taskId: string }> {
    await this.ensureRegistryLoaded()
    const tool = this.findTool(toolId)
    if (!tool) throw new Error(`未知工具: ${toolId}`)
    const inst = this.installed.getTool(toolId)
    if (!inst.versions[versionKey]) throw new Error(`版本 ${versionKey} 未安装`)
    this.installed.setEnvScope(scope)
    const taskId = this.manager.newTaskId()
    const refs = this.activeToolRefs({ excludeToolId: toolId })
    const { dist, version } = splitVersionKey(versionKey)
    refs.push({ toolId, version, dist, env: tool.manifest.env })
    // 激活顺序：其余工具在前，当前工具最后（其 PATH 条目最优先）
    const ctx = this.resolver.buildActivateTask(tool, versionKey, taskId, refs, scope)
    this.manager.enqueue(ctx, ctx.steps.map((s) => ({ id: s.id, type: s.type, title: s.title })))
    return { taskId }
  }

  /** 取消激活：清理环境变量与 current 链接，保留已安装版本 */
  async deactivate(toolId: string): Promise<{ taskId: string }> {
    await this.ensureRegistryLoaded()
    const tool = this.findTool(toolId)
    if (!tool) throw new Error(`未知工具: ${toolId}`)
    const inst = this.installed.getTool(toolId)
    if (!inst.activeVersion) throw new Error('工具没有激活版本')
    const remainingActive = this.activeToolRefs({ excludeToolId: toolId })
    const taskId = this.manager.newTaskId()
    const ctx = this.resolver.buildDeactivateTask(tool, inst.activeVersion, taskId, remainingActive, this.installed.getEnvScope())
    this.manager.enqueue(ctx, ctx.steps.map((s) => ({ id: s.id, type: s.type, title: s.title })))
    return { taskId }
  }

  async uninstall(toolId: string, version?: string): Promise<{ taskId: string }> {
    await this.ensureRegistryLoaded()
    const tool = this.findTool(toolId)
    if (!tool) throw new Error(`未知工具: ${toolId}`)
    const inst = this.installed.getTool(toolId)
    const target = version ?? inst.activeVersion ?? Object.keys(inst.versions)[0]
    if (!target) throw new Error('工具没有已安装版本')
    const remainingActive = this.activeToolRefs({ excludeToolId: toolId })
    const taskId = this.manager.newTaskId()
    const ctx = this.resolver.buildUninstallTask(tool, target, taskId, remainingActive, version ? (inst.activeVersion === version ? inst.activeVersion : null) : inst.activeVersion, this.installed.getEnvScope())
    this.manager.enqueue(ctx, ctx.steps.map((s) => ({ id: s.id, type: s.type, title: s.title })))
    return { taskId }
  }

  async resume(taskId: string): Promise<{ taskId: string }> {
    await this.ensureRegistryLoaded()
    const info = this.manager.resumeInfo(taskId)
    const prev = this.manager.get(taskId)
    if (!prev || !info) throw new Error('任务不存在或不可续跑')
    const tool = this.findTool(prev.toolId)
    if (!tool) throw new Error(`未知工具: ${prev.toolId}`)
    if (!prev.version) throw new Error('任务缺少版本信息')
    this.manager.remove(taskId)
    const newId = this.manager.newTaskId()
    const ctx = this.resolver.buildInstallTask(tool, prev.version, newId, info.completedStepIds, this.installed.getEnvScope())
    this.manager.enqueue(ctx, ctx.steps.map((s) => ({ id: s.id, type: s.type, title: s.title })))
    return { taskId: newId }
  }

  onTaskFinished(snapshot: TaskSnapshot): void {
    const { toolId, version, kind } = snapshot
    if (snapshot.status === 'success') {
      if ((kind === 'install' || kind === 'resume-install') && version) {
        const tool = this.findTool(toolId)
        this.installed.recordInstalled(toolId, version, tool?.sourceId ?? 'builtin')
      } else if (kind === 'activate' && version) {
        this.installed.recordActive(toolId, version, true)
        const plan = buildEnvPlan({ activeTools: this.activeToolRefs(), scope: this.installed.getEnvScope(), platform: this.osName, toolsDir: this.paths.toolsDir })
        patchProcessEnv(this.installed, plan.vars, plan.pathEntries)
        this.notify('env:changed', { toolId, applied: true })
      } else if (kind === 'deactivate') {
        this.installed.recordActive(toolId, null, false)
        const plan = buildEnvPlan({ activeTools: this.activeToolRefs(), scope: this.installed.getEnvScope(), platform: this.osName, toolsDir: this.paths.toolsDir })
        patchProcessEnv(this.installed, plan.vars, plan.pathEntries)
        this.notify('env:changed', { toolId, applied: false })
      } else if (kind === 'uninstall') {
        this.installed.recordUninstalled(toolId, version)
        this.notify('env:changed', { toolId, applied: true })
      }
      if (kind === 'install' || kind === 'activate' || kind === 'deactivate' || kind === 'uninstall' || kind === 'resume-install') {
        // 推送最新快照，渲染层各页面（仪表盘/工具箱）同步激活与安装状态
        this.notify('registry:updated', { snapshot: this.snapshot() })
      }
    } else if (kind === 'uninstall' && snapshot.error?.includes('版本') === false) {
      // 卸载失败不更新状态
    }
  }

  // ---------------- 环境变量 ----------------
  activeToolRefs(exclude?: { excludeToolId: string }): ActiveToolRef[] {
    const refs: ActiveToolRef[] = []
    for (const { toolId, version: key } of this.installed.activeTools()) {
      if (exclude && toolId === exclude.excludeToolId) continue
      const tool = this.findTool(toolId)
      const { dist, version } = splitVersionKey(key)
      refs.push({ toolId, version, dist, env: tool?.manifest.env })
    }
    return refs
  }

  async envPreview(toolId: string, activateVersion?: string, scopeArg?: 'user' | 'system'): Promise<EnvPreview> {
    await this.ensureRegistryLoaded()
    const inst = this.installed.getTool(toolId)
    const key = activateVersion ?? inst.activeVersion
    const others = this.activeToolRefs({ excludeToolId: toolId })
    const tool = this.findTool(toolId)
    const refs: ActiveToolRef[] = [...others]
    if (key && tool) {
      const { dist, version } = splitVersionKey(key)
      refs.push({ toolId, version, dist, env: tool.manifest.env })
    }
    const scope = scopeArg ?? this.installed.getEnvScope()
    const plan: EnvPlan = buildEnvPlan({ activeTools: refs, scope, platform: this.osName, toolsDir: this.paths.toolsDir })
    const currentBlock = this.osName === 'windows' ? null : readManagedBlock(unixManagedBlockFiles()[0])
    const currentPathRaw = this.osName === 'windows' ? ((await readWindowsUserPath()) ?? '') : null
    const changes = await previewEnvPlan(plan, currentBlock, currentPathRaw)
    return { scope: plan.scope, changes, managedBlockPreview: renderManagedBlock(plan) }
  }

  async envSnapshot(): Promise<EnvSnapshotData> {
    const plan = buildEnvPlan({ activeTools: this.activeToolRefs(), scope: this.installed.getEnvScope(), platform: this.osName, toolsDir: this.paths.toolsDir })
    const vars: EnvSnapshotData['vars'] = []
    const pathEntries: EnvSnapshotData['pathEntries'] = []
    if (this.osName === 'windows') {
      const seen = new Set<string>()
      for (const v of plan.vars) {
        if (seen.has(v.name)) continue
        seen.add(v.name)
        const value = await readWindowsVar(v.name, 'user')
        vars.push({ name: v.name, value: value ?? '(未设置)', managed: value === v.value })
      }
      const rawPath = (await readWindowsUserPath()) ?? ''
      const planEntries = new Set(plan.pathEntries)
      for (const e of rawPath.split(';')) {
        if (!e) continue
        pathEntries.push({ entry: e, managed: planEntries.has(e) })
      }
    } else {
      const block = readManagedBlock(unixManagedBlockFiles()[0])
      for (const v of parseBlockVars(block)) vars.push({ ...v, managed: true })
      const planEntries = new Set(plan.pathEntries)
      for (const e of parseBlockPathEntries(block)) pathEntries.push({ entry: e, managed: planEntries.has(e) })
      for (const v of plan.vars) {
        if (!vars.find((x) => x.name === v.name)) vars.push({ name: v.name, value: v.value, managed: false })
      }
    }
    return { scope: plan.scope, vars, pathEntries, managedBlock: renderManagedBlock(plan) }
  }

  // ---------------- 详情/检测/系统信息 ----------------
  toolDetail(toolId: string) {
    const tool = this.findTool(toolId)
    if (!tool) throw new Error(`未知工具: ${toolId}`)
    const inst = this.installed.getTool(toolId)
    const versions = this.platformVersions(tool)
    let health: string | null = null
    if (inst.activeVersion) {
      const currentDir = path.join(this.paths.toolsDir, toolId, 'current')
      health = runVersionCommand(toolId, currentDir, this.osName)
    }
    const dists = tool.manifest.distributions
    return {
      id: tool.toolId,
      name: tool.manifest.name,
      description: tool.manifest.description,
      category: tool.manifest.category,
      homepage: tool.manifest.homepage,
      icon: this.icons.get(toolId),
      defaultVersion: versions.find((v) => v.isDefault)?.key ?? tool.manifest.defaultVersion,
      distributions: dists
        ? Object.entries(dists).map(([id, def]) => ({
            id,
            name: def.name,
            defaultVersion: def.defaultVersion,
            homepage: def.homepage
          }))
        : [],
      versions,
      installedVersions: Object.keys(inst.versions),
      activeVersion: inst.activeVersion,
      envApplied: inst.envApplied,
      health,
      platformKey: this.platformKey
    }
  }

  detectSystem(toolId: string): SystemToolInfo {
    return detectSystemTool(toolId, this.osName)
  }

  appInfo(): AppInfo {
    return {
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      platform: process.platform,
      arch: this.arch,
      osLabel: currentOsLabel(),
      systemLocale: app.getSystemLocale(),
      installDir: this.paths.toolsDir,
      downloadDir: this.paths.downloadsDir,
      home: this.paths.home,
      isPackaged: app.isPackaged
    }
  }

  /** 目录所在磁盘的空间占用（取该目录所属卷的根路径统计） */
  async diskUsage(dir: string): Promise<DiskUsage> {
    const stat = await fs.promises.statfs(path.parse(dir).root || path.sep)
    return { total: stat.blocks * stat.bsize, free: stat.bavail * stat.bsize }
  }

  openPath(target: 'logs' | 'tools' | 'installDir' | 'downloads'): void {
    const map = { logs: this.paths.logsDir, tools: this.paths.toolsDir, installDir: this.paths.toolsDir, downloads: this.paths.downloadsDir }
    void shell.openPath(map[target])
  }

  /**
   * 打开某工具某版本的目录：
   * 解压/落位安装的工具（如 jdk）打开版本安装目录；仅下载的工具（如 iso 镜像）打开该版本的下载目录
   */
  openToolVersionDir(toolId: string, versionKey: string): void {
    const { dist, version } = splitVersionKey(versionKey)
    const versionDir = this.resolver.versionDirOf(toolId, dist, version)
    const downloadDir = dist
      ? path.join(this.paths.downloadsDir, toolId, dist, safeVersionSegment(version))
      : path.join(this.paths.downloadsDir, toolId, safeVersionSegment(version))
    const isDir = (p: string): boolean => {
      try {
        return fs.statSync(p).isDirectory()
      } catch {
        return false
      }
    }
    // 安装目录存在（已落位安装）优先，否则回退到该版本的下载目录，再回退到下载根目录
    const target = isDir(versionDir) ? versionDir : isDir(downloadDir) ? downloadDir : this.paths.downloadsDir
    logger.info(`[tools] 打开版本目录: ${toolId} ${versionKey} -> ${target}`)
    void shell.openPath(target)
  }

  genId(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`
  }
}

export { ResolveError }
