// 下载器：断点续传(.part + meta)、流式校验(md5/sha1/sha256)、镜像回退、进度上报、取消
// 协议分发：http(s) 直链 / BT（magnet: 或 http .torrent 链接）/ ed2k（识别解析，不支持直接下载）
import fs from 'node:fs'
import path from 'node:path'
import crypto, { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici'
import type WebTorrent from 'webtorrent'
import type { Torrent, TorrentFile } from 'webtorrent'
import type { TaskContext, StepRunHelpers } from '../engine/types'

export interface DownloadParams {
  url: string
  fileName?: string
  sha256?: string
  md5?: string
  sha1?: string
  size?: number
  mirrors?: string[]
  resume?: boolean
  timeoutSec?: number
}

/** 配置了的校验算法列表（按固定顺序），值与算法名对应 */
const CHECK_ALGOS = ['md5', 'sha1', 'sha256'] as const
type CheckAlgo = (typeof CHECK_ALGOS)[number]

function activeChecks(params: DownloadParams): { algo: CheckAlgo; expected: string }[] {
  return CHECK_ALGOS.filter((a) => params[a]).map((a) => ({ algo: a, expected: params[a] as string }))
}

/** 下载链接类型：http(s) 直链（.torrent 除外）/ BT（magnet: 或 .torrent）/ ed2k / 其他 */
type UrlKind = 'http' | 'bt' | 'ed2k' | 'unknown'

function urlKind(url: string): UrlKind {
  if (/^magnet:\?/i.test(url)) return 'bt'
  if (/^ed2k:\/\//i.test(url)) return 'ed2k'
  if (/^https?:\/\//i.test(url)) return /\.torrent([?#]|$)/i.test(url) ? 'bt' : 'http'
  return 'unknown'
}

interface Ed2kInfo {
  name: string
  size: number
  hash: string
}

/** 解析 ed2k 文件链接：ed2k://|file|<文件名>|<字节大小>|<MD4>|[h=<AICH>|]/，不合法返回 null */
function parseEd2kLink(url: string): Ed2kInfo | null {
  const parts = url.split('|')
  if (!/^ed2k:\/\//i.test(parts[0] ?? '') || parts[1] !== 'file' || parts.length < 6) return null
  let name: string
  try {
    name = decodeURIComponent(parts[2] ?? '')
  } catch {
    name = parts[2] ?? ''
  }
  const size = Number(parts[3])
  const hash = (parts[4] ?? '').toLowerCase()
  if (!name || !Number.isSafeInteger(size) || size <= 0 || !/^[0-9a-f]{32}$/.test(hash)) return null
  return { name, size, hash }
}

/** 按链接推断下载文件名：magnet 取 dn 显示名（真实文件名以种子元数据为准）、ed2k 取链接内文件名、http 取路径末段 */
function guessFileName(url: string): string | undefined {
  const kind = urlKind(url)
  if (kind === 'ed2k') return parseEd2kLink(url)?.name
  if (kind === 'bt') {
    if (/^magnet:\?/i.test(url)) {
      try {
        return new URL(url).searchParams.get('dn') ?? undefined
      } catch {
        return undefined
      }
    }
    return undefined
  }
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') || undefined
  } catch {
    return undefined
  }
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
    // 配置了认证时附加 Proxy-Authorization（Basic），否则代理按匿名访问
    if (ctx.proxyAuth?.username) {
      const token = Buffer.from(`${ctx.proxyAuth.username}:${ctx.proxyAuth.password ?? ''}`, 'utf8').toString('base64')
      return new ProxyAgent({ uri: ctx.proxy, token: `Basic ${token}` })
    }
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
  const checks = activeChecks(params)
  const hashes = checks.map(({ algo }) => crypto.createHash(algo))

  const bodyStream = Readable.fromWeb(resp.body as Parameters<typeof Readable.fromWeb>[0])
  bodyStream.on('data', (chunk: Buffer) => {
    received += chunk.length
    for (const h of hashes) h.update(chunk)
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

  // 校验：配置了哪些算法就逐项校验，任一不符即判定失败并清理缓存
  for (let i = 0; i < checks.length; i++) {
    const { algo, expected } = checks[i]
    const actual = hashes[i].digest('hex')
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      fs.rmSync(partPath, { force: true })
      fs.rmSync(metaPath, { force: true })
      throw new Error(`${algo.toUpperCase()} 校验失败: ${url} (期望 ${expected}, 实际 ${actual})`)
    }
  }
  if (params.size && Math.abs(received - params.size) > 1024) {
    throw new Error(`文件大小不符: 期望 ${params.size}, 实际 ${received}`)
  }

  fs.rmSync(metaPath, { force: true })
  fs.renameSync(partPath, filePath)
  run.progress(received, received, 0, 0)
  return { file: filePath, verified: checks.length > 0, receivedTotal: received }
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

// ---- BT 下载（magnet / .torrent，webtorrent）：client 进程内复用，随应用生命周期存活 ----
let torrentClient: WebTorrent | null = null
let clientReady: Promise<WebTorrent> | null = null

function acquireClient(): Promise<WebTorrent> {
  if (torrentClient) return Promise.resolve(torrentClient)
  clientReady ??= import('webtorrent')
    .then(({ default: Ctor }) => {
      torrentClient = new Ctor()
      return torrentClient
    })
    .catch((e) => {
      clientReady = null
      throw e
    })
  return clientReady
}

/** 添加种子：获取到元数据即 resolve；60 秒超时；取消时移除种子并清理存储 */
function addTorrent(client: WebTorrent, url: string, workDir: string, run: StepRunHelpers): Promise<Torrent> {
  return new Promise((resolve, reject) => {
    let settled = false
    const metaTimer = setTimeout(() => fail(new Error('获取 BT 元数据超时')), 60_000)
    const done = (torrent: Torrent) => {
      if (settled) return
      settled = true
      clearTimeout(metaTimer)
      run.signal.removeEventListener('abort', onAbort)
      resolve(torrent)
    }
    const fail = (e: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(metaTimer)
      run.signal.removeEventListener('abort', onAbort)
      reject(e)
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      clearTimeout(metaTimer)
      try { client.remove(t, { destroyStore: true }) } catch { /* 忽略 */ }
      reject(new Error('任务已取消'))
    }
    const t = client.add(url, { path: workDir }, done)
    t.on('error', fail)
    run.signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function attemptTorrentDownload(
  url: string,
  filePath: string,
  params: DownloadParams,
  ctx: TaskContext,
  run: StepRunHelpers
): Promise<AttemptResult> {
  const client = await acquireClient()
  const workDir = path.join(ctx.paths.cacheDir, 'bt', randomUUID())
  fs.mkdirSync(workDir, { recursive: true })
  let torrent: Torrent | null = null

  // 收尾：移除种子并销毁本地存储，剩余文件一并清理（交付文件在此之前已移出）
  const cleanup = () => {
    if (torrent) {
      try { client.remove(torrent, { destroyStore: true }) } catch { /* 忽略 */ }
    }
    try { fs.rmSync(workDir, { recursive: true, force: true }) } catch { /* 忽略 */ }
  }

  try {
    run.log('BT 下载：正在获取元数据并连接节点…')
    torrent = await addTorrent(client, url, workDir, run)
    if (run.signal.aborted) throw new Error('任务已取消')

    let noPeersLogged = false
    torrent.on('noPeers', () => {
      if (!noPeersLogged) {
        noPeersLogged = true
        run.log('BT 下载：暂未发现可用节点，将继续等待…', 'warn')
      }
    })

    // 进度上报：downloaded 为已通过分片校验的字节数
    let lastEmit = 0
    const emitProgress = () => {
      const now = Date.now()
      if (now - lastEmit < 250 || !torrent) return
      lastEmit = now
      const total = torrent.length || params.size || 0
      const speed = torrent.downloadSpeed
      const eta = speed > 0 && total > 0 ? (total - torrent.downloaded) / speed : 0
      run.progress(torrent.downloaded, total, speed, eta)
    }
    torrent.on('download', emitProgress)
    emitProgress()

    if (!torrent.done) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(new Error('任务已取消'))
        run.signal.addEventListener('abort', onAbort, { once: true })
        torrent!.on('done', () => {
          run.signal.removeEventListener('abort', onAbort)
          resolve()
        })
        torrent!.on('error', (e: Error) => {
          run.signal.removeEventListener('abort', onAbort)
          reject(e)
        })
      })
    }
    if (run.signal.aborted) throw new Error('任务已取消')

    // 交付文件：单文件种子取该文件，多文件种子取最大文件（工具包绝大多数为单文件）
    const files: TorrentFile[] = torrent.files
    if (files.length === 0) throw new Error('种子中不含任何文件')
    const chosen = files.length === 1 ? files[0] : files.reduce((a, b) => (b.length > a.length ? b : a))
    if (files.length > 1) run.log(`BT 下载：种子包含 ${files.length} 个文件，已选取最大文件 ${chosen.name}`, 'warn')

    const diskFile = path.join(workDir, chosen.path)
    if (!fs.existsSync(diskFile)) throw new Error(`BT 下载文件缺失: ${chosen.path}`)

    // 分片校验由 BT 协议保证；源另配置了校验和时逐项复核
    const checks = activeChecks(params)
    for (const { algo, expected } of checks) {
      const actual = await hashFile(diskFile, algo)
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        throw new Error(`${algo.toUpperCase()} 校验失败: ${chosen.name} (期望 ${expected}, 实际 ${actual})`)
      }
    }
    if (params.size && Math.abs(chosen.length - params.size) > 1024) {
      throw new Error(`文件大小不符: 期望 ${params.size}, 实际 ${chosen.length}`)
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.renameSync(diskFile, filePath)
    run.progress(chosen.length, chosen.length, 0, 0)
    return { file: filePath, verified: checks.length > 0, receivedTotal: chosen.length }
  } finally {
    cleanup()
  }
}

/** 下载步骤入口：按链接协议分发（http / BT / ed2k） */
export async function download(params: DownloadParams, ctx: TaskContext, run: StepRunHelpers): Promise<{ file: string }> {
  if (!params.url) throw new Error('download 步骤缺少 url')
  const urls = orderUrls(params, ctx.mirrorPolicy, ctx.preferredUrl)
  const fileName = params.fileName ?? guessFileName(params.url) ?? 'download.bin'
  const dir = ctx.paths.cacheDir
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, fileName)
  const partPath = filePath + '.part'
  const metaPath = partPath + '.meta.json'
  const timeoutSec = params.timeoutSec ?? 3600

  // 幂等：目标文件已存在（配置了校验和则校验通过才视为命中）
  if (fs.existsSync(filePath)) {
    const checks = activeChecks(params)
    if (checks.length > 0) {
      let matched = true
      for (const { algo, expected } of checks) {
        const actual = await hashFile(filePath, algo)
        if (actual.toLowerCase() !== expected.toLowerCase()) matched = false
      }
      if (matched) {
        run.log('缓存命中，跳过下载')
        return { file: filePath }
      }
      fs.rmSync(filePath, { force: true })
    } else {
      run.log('目标文件已存在（无校验和配置），跳过下载')
      return { file: filePath }
    }
  }

  const errors: string[] = []
  for (const url of urls) {
    if (run.signal.aborted) throw new Error('任务已取消')
    const kind = urlKind(url)

    // ed2k / 未知协议：仅识别解析，不支持直接下载，跳过后回退其余镜像源
    if (kind === 'ed2k' || kind === 'unknown') {
      const ed = kind === 'ed2k' ? parseEd2kLink(url) : null
      const msg = ed
        ? `ed2k 链接暂不支持直接下载（eDonkey 网络无可用协议实现）: ${ed.name} (${ed.size} 字节, MD4 ${ed.hash})，请改用 HTTP 或 BT 镜像源`
        : `无法识别的下载链接: ${url}`
      errors.push(`${url}: ${msg}`)
      run.log(msg, 'warn')
      continue
    }

    try {
      run.log(kind === 'bt' ? `开始 BT 下载: ${url.length > 120 ? url.slice(0, 120) + '…' : url}` : `开始下载: ${url}`)
      const r =
        kind === 'bt'
          ? await attemptTorrentDownload(url, filePath, { ...params, url }, ctx, run)
          : await attemptDownload(url, filePath, partPath, metaPath, { ...params, url }, ctx, run, timeoutSec)
      // BT 成功后清理可能残留的 HTTP 断点缓存
      if (kind === 'bt') {
        fs.rmSync(partPath, { force: true })
        fs.rmSync(metaPath, { force: true })
      }
      const algoLabel = activeChecks(params).map((c) => c.algo.toUpperCase()).join('/')
      run.log(`下载完成: ${fileName} (${(r.receivedTotal / 1024 / 1024).toFixed(1)} MB${r.verified ? `, ${algoLabel} 校验通过` : ', 未校验'})`)
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

/** 计算文件指定算法的校验和（小写 hex） */
export async function hashFile(file: string, algo: 'md5' | 'sha1' | 'sha256'): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo)
    const rs = fs.createReadStream(file)
    rs.on('data', (d) => h.update(d))
    rs.on('error', reject)
    rs.on('end', () => resolve(h.digest('hex')))
  })
}
