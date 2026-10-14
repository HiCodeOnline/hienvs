// 工具图标下载与本地缓存：由清单源 index.json 条目的 icon 字段驱动
// 通过 Electron 会话的 net.fetch 请求（自动应用代理），落盘到 ~/.hienvs/cache/icons
import fs from 'node:fs'
import path from 'node:path'
import { net } from 'electron'

const MIME_MAP: Record<string, { mime: string; ext: string }> = {
  'image/png': { mime: 'image/png', ext: '.png' },
  'image/jpeg': { mime: 'image/jpeg', ext: '.jpg' },
  'image/jpg': { mime: 'image/jpeg', ext: '.jpg' },
  'image/svg+xml': { mime: 'image/svg+xml', ext: '.svg' },
  'image/webp': { mime: 'image/webp', ext: '.webp' },
  'image/gif': { mime: 'image/gif', ext: '.gif' },
  'image/x-icon': { mime: 'image/x-icon', ext: '.ico' },
  'image/vnd.microsoft.icon': { mime: 'image/x-icon', ext: '.ico' }
}

const EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
}

/** 综合 Content-Type 与 URL 后缀推断图片类型，默认 png */
function resolveImageType(contentType: string, url: string): { mime: string; ext: string } {
  const ct = contentType.split(';')[0].trim().toLowerCase()
  if (MIME_MAP[ct]) return MIME_MAP[ct]
  let pathname = url
  try {
    pathname = new URL(url).pathname
  } catch {
    /* 非法 URL 时按原串取后缀 */
  }
  const ext = path.extname(pathname).toLowerCase()
  if (ext && EXT_MIME[ext]) return { mime: EXT_MIME[ext], ext }
  return { mime: 'image/png', ext: '.png' }
}

export interface IconResult {
  dataUrl: string
  ext: string
  buffer: Buffer
}

/** 下载图标并返回 data URL（失败抛错，由调用方兜底） */
export async function fetchIcon(url: string, timeoutMs = 15000): Promise<IconResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await net.fetch(url, { signal: ctrl.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buffer = Buffer.from(await resp.arrayBuffer())
    if (buffer.length === 0) throw new Error('图标内容为空')
    const { mime, ext } = resolveImageType(resp.headers.get('content-type') ?? '', url)
    return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, ext, buffer }
  } finally {
    clearTimeout(timer)
  }
}

/** 读取某工具已缓存的图标（返回 data URL），不存在返回 null */
export function readCachedIcon(dir: string, toolId: string): string | null {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(`${toolId}.`)) continue
      const ext = path.extname(name).toLowerCase()
      const buffer = fs.readFileSync(path.join(dir, name))
      if (buffer.length === 0) continue
      return `data:${EXT_MIME[ext] ?? 'image/png'};base64,${buffer.toString('base64')}`
    }
  } catch {
    /* 目录不存在等 */
  }
  return null
}

/** 写入图标文件，并清理同工具的其它扩展名旧文件 */
export function writeIcon(dir: string, toolId: string, ext: string, buffer: Buffer): void {
  fs.mkdirSync(dir, { recursive: true })
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(`${toolId}.`) && name !== `${toolId}${ext}`) {
        fs.rmSync(path.join(dir, name), { force: true })
      }
    }
  } catch {
    /* 忽略清理失败 */
  }
  fs.writeFileSync(path.join(dir, `${toolId}${ext}`), buffer)
}
