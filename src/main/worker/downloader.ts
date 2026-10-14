// 下载器：断点续传(.part + meta)、流式 sha256、镜像回退、进度上报、取消
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici'
import type { TaskContext, StepRunHelpers } from '../engine/types'

export interface DownloadParams {
  url: string
  fileName?: string
  sha256?: string
  size?: number
  mirrors?: string[]
  resume?: boolean
  timeoutSec?: number
}

interface PartMeta {
  url: string
  etag?: string
  lastModified?: string
  received: number
}

function orderUrls(params: DownloadParams, mirrorPolicy: TaskContext['mirrorPolicy'], preferredUrl?: string): string[] {
  const primary = params.url
  const mirrors = params.mirrors ?? []
  const base = mirrorPolicy === 'mainland-first' ? [...mirrors, primary] : [primary, ...mirrors]
  // 用户指定的下载源优先，其余源作为回退（去重）
  const ordered = preferredUrl ? [preferredUrl, ...base] : base
  return [...new Set(ordered)]
}

function proxyDispatcher(ctx: TaskContext): Dispatcher | undefined {
  if (!ctx.proxy) return undefined
  try {
    return new ProxyAgent(ctx.proxy)
  } catch {
    return undefined
  }
}

async function fetchWithTimeout(url: string, ctx: TaskContext, headers: Record<string, string>, signal: AbortSignal, timeoutSec: number): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
  const dispatcher = proxyDispatcher(ctx)
  const timeout = AbortSignal.timeout(timeoutSec * 1000)
  const resp = await undiciFetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.any([signal, timeout]),
    dispatcher: dispatcher as unknown as Dispatcher,
    redirect: 'follow'
  } as Parameters<typeof undiciFetch>[1])
  return resp
}

interface AttemptResult {
  file: string
  verified: boolean
  receivedTotal: number
}

async function attemptDownload(
  url: string,
  filePath: string,
  partPath: string,
  metaPath: string,
  params: DownloadParams,
  ctx: TaskContext,
  run: StepRunHelpers,
  timeoutSec: number
): Promise<AttemptResult> {
  const prevMeta: PartMeta | null = loadMeta(metaPath)
  const canResume = params.resume !== false && !!prevMeta && prevMeta.url === url && fs.existsSync(partPath) && prevMeta.received > 0

  const headers: Record<string, string> = {}
  if (canResume) headers['Range'] = `bytes=${prevMeta.received}-`

  const resp = await fetchWithTimeout(url, ctx, headers, run.signal, timeoutSec)
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status} ${url}`)

  // 服务器不支持续传 → 重头下载
  let offset = 0
  if (canResume && resp.status === 206) {
    offset = prevMeta.received
    // ETag 变化 → 缓存失效，重下
    const etag = resp.headers.get('etag') ?? undefined
    const lastModified = resp.headers.get('last-modified') ?? undefined
    if (prevMeta.etag && etag && prevMeta.etag !== etag) {
      offset = 0
    } else {
      saveMeta(metaPath, { url, etag, lastModified, received: offset })
    }
  } else if (canResume) {
    offset = 0
  }

  const contentLength = resp.headers.get('content-length')
  const total = contentLength ? offset + parseInt(contentLength, 10) : params.size

  const ws = fs.createWriteStream(partPath, { flags: offset > 0 ? 'a' : 'w' })
  let received = offset
  let lastEmit = 0
  let lastBytes = offset
  let lastTime = Date.now()
  const hash = crypto.createHash('sha256')

  const bodyStream = Readable.fromWeb(resp.body as Parameters<typeof Readable.fromWeb>[0])
  bodyStream.on('data', (chunk: Buffer) => {
    received += chunk.length
    hash.update(chunk)
    const now = Date.now()
    if (now - lastEmit >= 250) {
      const speed = ((received - lastBytes) * 1000) / (now - lastTime)
      const eta = total && speed > 0 ? (total - received) / speed : 0
      run.progress(received, total ?? 0, speed, eta)
      lastEmit = now
      lastBytes = received
      lastTime = now
      saveMeta(metaPath, { url, etag: resp.headers.get('etag') ?? undefined, lastModified: resp.headers.get('last-modified') ?? undefined, received })
    }
  })

  try {
    await pipeline(bodyStream, ws)
  } catch (e) {
    saveMeta(metaPath, { url, etag: resp.headers.get('etag') ?? undefined, lastModified: resp.headers.get('last-modified') ?? undefined, received })
    throw e
  }

  if (run.signal.aborted) throw new Error('任务已取消')

  // 校验
  if (params.sha256) {
    const actual = hash.digest('hex')
    if (actual.toLowerCase() !== params.sha256.toLowerCase()) {
      fs.rmSync(partPath, { force: true })
      fs.rmSync(metaPath, { force: true })
      throw new Error(`SHA256 校验失败: ${url} (期望 ${params.sha256}, 实际 ${actual})`)
    }
  }
  if (params.size && Math.abs(received - params.size) > 1024) {
    throw new Error(`文件大小不符: 期望 ${params.size}, 实际 ${received}`)
  }

  fs.rmSync(metaPath, { force: true })
  fs.renameSync(partPath, filePath)
  run.progress(received, received, 0, 0)
  return { file: filePath, verified: !!params.sha256, receivedTotal: received }
}

function loadMeta(metaPath: string): PartMeta | null {
  try {
    if (fs.existsSync(metaPath)) return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as PartMeta
  } catch { /* 损坏即视为无缓存 */ }
  return null
}

function saveMeta(metaPath: string, meta: PartMeta): void {
  try {
    fs.mkdirSync(path.dirname(metaPath), { recursive: true })
    fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf-8')
  } catch { /* 忽略 */ }
}

/** 下载步骤入口 */
export async function download(params: DownloadParams, ctx: TaskContext, run: StepRunHelpers): Promise<{ file: string }> {
  if (!params.url) throw new Error('download 步骤缺少 url')
  const urls = orderUrls(params, ctx.mirrorPolicy, ctx.preferredUrl)
  const fileName = params.fileName ?? decodeURIComponent(new URL(params.url).pathname.split('/').pop() ?? 'download.bin')
  const dir = ctx.paths.cacheDir
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, fileName)
  const partPath = filePath + '.part'
  const metaPath = partPath + '.meta.json'
  const timeoutSec = params.timeoutSec ?? 3600

  // 幂等：目标文件已存在
  if (fs.existsSync(filePath)) {
    if (params.sha256) {
      const actual = await sha256File(filePath)
      if (actual.toLowerCase() === params.sha256.toLowerCase()) {
        run.log('缓存命中，跳过下载')
        return { file: filePath }
      }
      fs.rmSync(filePath, { force: true })
    } else {
      run.log('目标文件已存在（无 sha256 可校验），跳过下载')
      return { file: filePath }
    }
  }

  const errors: string[] = []
  for (const url of urls) {
    if (run.signal.aborted) throw new Error('任务已取消')
    try {
      run.log(`开始下载: ${url}`)
      const r = await attemptDownload(url, filePath, partPath, metaPath, { ...params, url }, ctx, run, timeoutSec)
      run.log(`下载完成: ${fileName} (${(r.receivedTotal / 1024 / 1024).toFixed(1)} MB${r.verified ? ', sha256 校验通过' : ', 未校验'})`)
      return { file: r.file }
    } catch (e) {
      if (run.signal.aborted) throw new Error('任务已取消')
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${url}: ${msg}`)
      run.log(`下载失败: ${msg}`, 'warn')
    }
  }
  throw new Error(`全部下载源失败:\n${errors.join('\n')}`)
}

export async function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const rs = fs.createReadStream(file)
    rs.on('data', (d) => h.update(d))
    rs.on('error', reject)
    rs.on('end', () => resolve(h.digest('hex')))
  })
}
