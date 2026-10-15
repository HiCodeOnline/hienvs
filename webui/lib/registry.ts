// 构建期读取 registry/<region>/ 下的软件源 JSON，并归纳为站点可视化所需的视图。
// 仅用于服务端（含 node:fs / node:path），客户端请引用 lib/tool-view.ts。
import fs from 'node:fs'
import path from 'node:path'
import type {
  AssetDef,
  DistributionView,
  MirrorSource,
  PlatformDef,
  RegistryIndex,
  RegistryIndexTool,
  ToolManifest,
  ToolView,
  VersionRow
} from './tool-view'

export type * from './tool-view'

const PLATFORM_ORDER = [
  'windows-x64',
  'windows-arm64',
  'windows-x86',
  'darwin-x64',
  'darwin-arm64',
  'linux-x64',
  'linux-arm64',
  'windows',
  'darwin',
  'linux'
]

function orderPlatforms(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = PLATFORM_ORDER.indexOf(a)
    const ib = PLATFORM_ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

function normalizeMirror(m: MirrorSource | string): MirrorSource {
  if (typeof m === 'string') {
    let name = m
    try {
      name = new URL(m).host
    } catch {
      // 保留原字符串
    }
    return { name, url: m }
  }
  return m
}

/** 把一个平台集合的资产归纳为按版本聚合的行（跨平台合并到同一版本键） */
function collectVersions(
  platforms: Record<string, PlatformDef>,
  dist?: { id: string; name: string }
): VersionRow[] {
  const map = new Map<string, VersionRow>()
  for (const [platKey, plat] of Object.entries(platforms ?? {})) {
    for (const [ver, asset] of Object.entries(plat.assets ?? {}) as [string, AssetDef][]) {
      const key = dist ? `${dist.id}@${ver}` : ver
      let row = map.get(key)
      if (!row) {
        row = { key, version: ver, dist: dist?.id, distName: dist?.name, platforms: [], sources: [] }
        map.set(key, row)
      }
      if (!row.platforms.includes(platKey)) row.platforms.push(platKey)
      if (row.sha256 === undefined) row.sha256 = asset.sha256
      if (row.size === undefined) row.size = asset.size

      const byUrl = new Map(row.sources.map((s) => [s.url, s]))
      if (!byUrl.has(asset.url)) {
        byUrl.set(asset.url, { name: '', url: asset.url, size: asset.size, official: true })
      }
      for (const m of (asset.mirrors ?? []).map(normalizeMirror)) {
        if (!byUrl.has(m.url)) byUrl.set(m.url, { name: m.name, url: m.url, size: m.size, official: false })
      }
      row.sources = [...byUrl.values()]
    }
  }
  for (const row of map.values()) {
    row.platforms = orderPlatforms(row.platforms)
    if (row.size === undefined) {
      row.size = row.sources.find((s) => s.size !== undefined)?.size
    }
  }
  return [...map.values()]
}

function regionDir(region: string): string {
  return path.join(process.cwd(), 'registry', region)
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
}

export function getIndex(region: string): RegistryIndex {
  return readJson<RegistryIndex>(path.join(regionDir(region), 'index.json'))
}

function buildToolView(region: string, entry: RegistryIndexTool): ToolView {
  const manifest = readJson<ToolManifest>(path.join(regionDir(region), entry.manifest))
  const distributions: DistributionView[] = []
  const allPlatforms = new Set<string>()
  let versionCount = 0

  const hasDistributions = manifest.distributions && Object.keys(manifest.distributions).length > 0
  if (hasDistributions) {
    for (const [distId, dist] of Object.entries(manifest.distributions ?? {})) {
      const plats = orderPlatforms(Object.keys(dist.platforms ?? {}))
      plats.forEach((p) => allPlatforms.add(p))
      const versions = collectVersions(dist.platforms ?? {}, { id: distId, name: dist.name })
      versionCount += versions.length
      distributions.push({
        id: distId,
        name: dist.name,
        description: dist.description,
        homepage: dist.homepage,
        defaultVersion: dist.defaultVersion,
        platforms: plats,
        versions
      })
    }
  } else {
    const plats = orderPlatforms(Object.keys(manifest.platforms ?? {}))
    plats.forEach((p) => allPlatforms.add(p))
    const versions = collectVersions(manifest.platforms ?? {})
    versionCount = versions.length
    distributions.push({
      name: manifest.name,
      description: manifest.description,
      homepage: manifest.homepage,
      defaultVersion: manifest.defaultVersion,
      platforms: plats,
      versions
    })
  }

  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    homepage: entry.homepage,
    icon: entry.icon,
    manifestPath: entry.manifest,
    platforms: orderPlatforms([...allPlatforms]),
    distributions,
    versionCount
  }
}

const cache = new Map<string, ToolView[]>()

/** 读取某地区的全部工具视图（构建期缓存） */
export function getTools(region: string): ToolView[] {
  const hit = cache.get(region)
  if (hit) return hit
  const index = getIndex(region)
  const tools = index.tools.map((entry) => buildToolView(region, entry))
  cache.set(region, tools)
  return tools
}

export function getTool(region: string, id: string): ToolView | undefined {
  return getTools(region).find((t) => t.id === id)
}
