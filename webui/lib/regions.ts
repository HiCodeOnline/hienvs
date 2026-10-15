// 地区元数据：读取 registry/regions.json（构建期使用）
import fs from 'node:fs'
import path from 'node:path'

export interface RegionMeta {
  /** 地区代码，同时作为清单目录名与客户端 URL 段（如 zh-CN） */
  code: string
  /** 该地区的本地化名称 */
  nativeName: string
  dir: 'ltr' | 'rtl'
}

export interface RegionConfig {
  defaultRegion: string
  regions: RegionMeta[]
}

const REGIONS_FILE = path.join(process.cwd(), 'registry', 'regions.json')

export function getRegionConfig(): RegionConfig {
  return JSON.parse(fs.readFileSync(REGIONS_FILE, 'utf-8')) as RegionConfig
}

export function listRegions(): RegionMeta[] {
  return getRegionConfig().regions
}

export function regionCodes(): string[] {
  return listRegions().map((r) => r.code)
}

export function getRegion(code: string): RegionMeta | undefined {
  return listRegions().find((r) => r.code === code)
}

export function isValidRegion(code: string): boolean {
  return regionCodes().includes(code)
}

export function getDefaultRegion(): RegionMeta {
  const cfg = getRegionConfig()
  return getRegion(cfg.defaultRegion) ?? cfg.regions[0]
}
