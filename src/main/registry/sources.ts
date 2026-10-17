// 清单源加载与合并：remote / local 两类，后加载者覆盖前者（按 toolId）
// 默认不提供任何内置源，全部由用户在设置中手动添加（添加时校验有效性）
import fs from 'node:fs'
import path from 'node:path'
import { net } from 'electron'
import { createHash } from 'node:crypto'
import { registryIndexSchema, toolManifestSchema } from './schema'
import type { ParsedRegistryIndex } from './schema'
import type { LoadedTool } from './types'
import type { RegistrySource, RegistrySourceStatus, RegistrySourceType } from '@shared/registry-types'
import { logger } from '../core/logger'

export type { LoadedTool } from './types'

export interface RegistryEnv {
  /** 远程源缓存目录 */
  cacheDir: string
}

let env: RegistryEnv = { cacheDir: '' }

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
  source: { id: string; name: string; type: RegistrySourceType },
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
      tools.push({ toolId: entry.id, manifest: parsed.data, sourceId: source.id, systemAgnostic: entry.systemAgnostic, icon: entry.icon })
    } catch (e) {
      errors.push(`${entry.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return {
    tools,
    status: {
      id: source.id,
      name: source.name,
      type: source.type,
      status: tools.length > 0 ? 'ok' : 'error',
      toolCount: tools.length,
      categories: base.categories,
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
  // manifest 相对路径基于 index.json 所在目录解析（不能把 index.json/ 当目录，否则拼出 .../index.json/tools/x.json 404）
  const baseDir = url.slice(0, url.lastIndexOf('/') + 1)
  const res = await loadIndex(parsed.data, { id: source.id, name: source.name, type: 'remote' }, async (rel) => {
    return fetchRemoteText(new URL(rel, baseDir).toString())
  })
  if (fromCache) res.status.status = 'cached'
  return res
}

async function loadLocal(source: RegistrySource): Promise<SourceLoadResult> {
  const dir = source.location ?? ''
  const raw = fs.readFileSync(path.join(dir, 'index.json'), 'utf-8')
  const parsed = registryIndexSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error(`index 校验失败: ${parsed.error.issues[0]?.path.join('.') ?? 'unknown'}`)
  return loadIndex(parsed.data, { id: source.id, name: source.name, type: 'local' }, async (rel) =>
    fs.readFileSync(path.join(dir, rel), 'utf-8')
  )
}

/** 添加源前的有效性校验：远程需可访问且索引结构合法，本地需存在 index.json 且结构合法；通过返回索引名称 */
export async function validateSource(type: RegistrySourceType, location: string): Promise<{ name?: string }> {
  if (!location.trim()) throw new Error(type === 'remote' ? '请填写源地址' : '请填写源文件夹路径')
  let raw: string
  if (type === 'remote') {
    try {
      raw = await fetchRemoteText(location.trim())
    } catch (e) {
      throw new Error(`无法访问源地址: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    try {
      raw = fs.readFileSync(path.join(location.trim(), 'index.json'), 'utf-8')
    } catch {
      throw new Error('文件夹中未找到有效的 index.json')
    }
  }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    throw new Error('index.json 不是合法的 JSON')
  }
  const parsed = registryIndexSchema.safeParse(parsedJson)
  if (!parsed.success) {
    throw new Error(`清单索引校验失败: ${parsed.error.issues[0]?.path.join('.') ?? 'unknown'}`)
  }
  return { name: parsed.data.name }
}

export interface LoadOptions {
  /** 定时自动更新：仅远程拉取开启 autoUpdate 的源，其余远程源使用本地缓存 */
  autoOnly?: boolean
  /** 手动更新单个源：仅远程拉取该 id 的源，其余远程源使用本地缓存 */
  fetchSourceId?: string
}

/**
 * 加载并合并全部用户清单源：按数组顺序，后者覆盖前者（按 toolId）
 */
export async function loadRegistries(sources: RegistrySource[], opts: LoadOptions = {}): Promise<LoadResult> {
  const merged = new Map<string, LoadedTool>()
  const statuses: RegistrySourceStatus[] = []

  for (const source of sources) {
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
