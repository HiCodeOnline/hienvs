// 清单源加载与合并：remote / local / builtin 三类，后加载者覆盖前者（按 toolId）
import fs from 'node:fs'
import path from 'node:path'
import { net } from 'electron'
import { createHash } from 'node:crypto'
import { registryIndexSchema, toolManifestSchema } from './schema'
import type { ParsedRegistryIndex } from './schema'
import type { LoadedTool } from './types'
import type { RegistrySource, RegistrySourceStatus } from '@shared/registry-types'
import { logger } from '../core/logger'

export type { LoadedTool } from './types'

export interface RegistryEnv {
  /** 内置清单目录 */
  builtinDir: string
  /** 远程源缓存目录 */
  cacheDir: string
}

let env: RegistryEnv = { builtinDir: '', cacheDir: '' }

export function initRegistryEnv(e: RegistryEnv): void {
  env = e
}

export function getRegistryEnv(): RegistryEnv {
  return env
}

function hashOf(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

interface SourceLoadResult {
  tools: LoadedTool[]
  status: RegistrySourceStatus
}

async function fetchRemoteText(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await net.fetch(url, { signal: ctrl.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.text()
  } finally {
    clearTimeout(timer)
  }
}

async function loadIndex(
  base: ParsedRegistryIndex,
  sourceType: RegistrySourceStatus['type'],
  sourceName: string,
  fetchManifest: (rel: string) => Promise<string>
): Promise<SourceLoadResult> {
  const tools: LoadedTool[] = []
  const errors: string[] = []
  for (const entry of base.tools) {
    try {
      const raw = await fetchManifest(entry.manifest)
      const parsed = toolManifestSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) {
        errors.push(`${entry.id}: 清单校验失败(${parsed.error.issues[0]?.path.join('.') ?? ''})`)
        continue
      }
      if (parsed.data.id !== entry.id) {
        errors.push(`${entry.id}: 清单 id(${parsed.data.id}) 与索引不一致`)
        continue
      }
      if (entry.manifestSha256) {
        const actual = createHash('sha256').update(raw).digest('hex')
        if (actual !== entry.manifestSha256) {
          errors.push(`${entry.id}: manifestSha256 不匹配`)
          continue
        }
      }
      tools.push({ toolId: entry.id, manifest: parsed.data, sourceId: sourceName, icon: entry.icon })
    } catch (e) {
      errors.push(`${entry.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return {
    tools,
    status: {
      id: sourceName,
      name: sourceName,
      type: sourceType,
      enabled: true,
      status: tools.length > 0 ? 'ok' : 'error',
      toolCount: tools.length,
      error: errors.length ? errors.join('; ') : undefined,
      updatedAt: base.updatedAt
    }
  }
}

async function loadRemote(source: RegistrySource, preferCache = false): Promise<SourceLoadResult> {
  const url = source.location ?? ''
  const cacheFile = path.join(env.cacheDir, `${hashOf(url)}.json`)
  let raw: string
  let fromCache = false
  if (preferCache && fs.existsSync(cacheFile)) {
    raw = fs.readFileSync(cacheFile, 'utf-8')
    fromCache = true
  } else {
    try {
      raw = await fetchRemoteText(url)
      fs.mkdirSync(env.cacheDir, { recursive: true })
      fs.writeFileSync(cacheFile, raw, 'utf-8')
    } catch (e) {
      if (fs.existsSync(cacheFile)) {
        raw = fs.readFileSync(cacheFile, 'utf-8')
        fromCache = true
        logger.warn(`[registry] 远程源拉取失败，使用缓存: ${url} (${e instanceof Error ? e.message : String(e)})`)
      } else {
        throw e
      }
    }
  }
  const parsed = registryIndexSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error(`index 校验失败: ${parsed.error.issues[0]?.path.join('.') ?? 'unknown'}`)
  const baseName = url.endsWith('/') ? url : url + '/'
  const res = await loadIndex(parsed.data, 'remote', source.name, async (rel) => {
    return fetchRemoteText(new URL(rel, baseName).toString())
  })
  if (fromCache) res.status.status = 'cached'
  return res
}

async function loadLocal(source: RegistrySource): Promise<SourceLoadResult> {
  const dir = source.location ?? ''
  const raw = fs.readFileSync(path.join(dir, 'index.json'), 'utf-8')
  const parsed = registryIndexSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error(`index 校验失败: ${parsed.error.issues[0]?.path.join('.') ?? 'unknown'}`)
  return loadIndex(parsed.data, 'local', source.name, async (rel) =>
    fs.readFileSync(path.join(dir, rel), 'utf-8')
  )
}

function loadBuiltin(): SourceLoadResult {
  const baseDir = env.builtinDir
  const fallback = {
    tools: [] as LoadedTool[],
    status: {
      id: 'builtin',
      name: '内置清单',
      type: 'builtin' as const,
      enabled: true,
      status: 'error' as const,
      toolCount: 0,
      error: undefined as string | undefined
    } as RegistrySourceStatus
  }
  try {
    const raw = fs.readFileSync(path.join(baseDir, 'index.json'), 'utf-8')
    const parsed = registryIndexSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      fallback.status.error = '内置清单格式错误'
      return fallback
    }
    const tools: LoadedTool[] = []
    const errors: string[] = []
    for (const entry of parsed.data.tools) {
      try {
        const mRaw = fs.readFileSync(path.join(baseDir, entry.manifest), 'utf-8')
        const m = toolManifestSchema.safeParse(JSON.parse(mRaw))
        if (!m.success) {
          errors.push(`${entry.id}: 清单校验失败`)
          continue
        }
        tools.push({ toolId: entry.id, manifest: m.data, sourceId: parsed.data.name, icon: entry.icon })
      } catch (e) {
        errors.push(`${entry.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    return {
      tools,
      status: {
        id: 'builtin',
        name: parsed.data.name,
        type: 'builtin',
        enabled: true,
        status: tools.length > 0 ? 'ok' : 'error',
        toolCount: tools.length,
        error: errors.length ? errors.join('; ') : undefined,
        updatedAt: parsed.data.updatedAt
      }
    }
  } catch (e) {
    fallback.status.error = e instanceof Error ? e.message : String(e)
    return fallback
  }
}

export interface LoadOptions {
  /** 定时自动更新：仅远程拉取开启 autoUpdate 的源，其余远程源使用本地缓存 */
  autoOnly?: boolean
  /** 手动更新单个源：仅远程拉取该 id 的源，其余远程源使用本地缓存 */
  fetchSourceId?: string
}

/**
 * 加载并合并全部清单源：内置(最低优先) -> 用户源按数组顺序 -> 后者覆盖前者（按 toolId）
 */
export async function loadRegistries(sources: RegistrySource[], opts: LoadOptions = {}): Promise<LoadResult> {
  const merged = new Map<string, LoadedTool>()
  const statuses: RegistrySourceStatus[] = []

  const builtin = loadBuiltin()
  statuses.push(builtin.status)
  for (const t of builtin.tools) merged.set(t.toolId, t)

  for (const source of sources) {
    if (!source.enabled) {
      statuses.push({ id: source.id, name: source.name, type: source.type, enabled: false, status: 'skipped', toolCount: 0 })
      continue
    }
    if (source.type === 'remote') {
      // 选择性拉取：定时自动更新只拉 autoUpdate 源；手动单源更新只拉指定源；无缓存的源始终拉取
      const skipFetch = (opts.autoOnly && !source.autoUpdate) || (opts.fetchSourceId !== undefined && opts.fetchSourceId !== source.id)
      try {
        const res = await loadRemote(source, skipFetch)
        statuses.push(res.status)
        for (const t of res.tools) merged.set(t.toolId, t)
      } catch (e) {
        statuses.push({
          id: source.id,
          name: source.name,
          type: source.type,
          enabled: true,
          status: 'error',
          toolCount: 0,
          error: e instanceof Error ? e.message : String(e)
        })
        logger.warn(`[registry] 源 ${source.name} 加载失败: ${e instanceof Error ? e.message : String(e)}`)
      }
      continue
    }
    try {
      const res = await loadLocal(source)
      statuses.push(res.status)
      for (const t of res.tools) merged.set(t.toolId, t)
    } catch (e) {
      statuses.push({
        id: source.id,
        name: source.name,
        type: source.type,
        enabled: true,
        status: 'error',
        toolCount: 0,
        error: e instanceof Error ? e.message : String(e)
      })
      logger.warn(`[registry] 源 ${source.name} 加载失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { tools: [...merged.values()], statuses }
}

export interface LoadResult {
  tools: LoadedTool[]
  statuses: RegistrySourceStatus[]
}
