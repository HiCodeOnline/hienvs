// tar 归档解压（tar-stream + zlib / lzma-native，失败回退系统 tar）
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import zlib from 'node:zlib'
import { extract as tarExtract, type Header } from 'tar-stream'
import { safeJoin, sanitizeRelPath } from './safe-paths'

export interface ExtractOptions {
  stripComponents?: number
  isWindows: boolean
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  onWarn?: (msg: string) => void
}

function stripRel(name: string, strip: number): string | null {
  const norm = name.replace(/\\/g, '/')
  const segs = norm.split('/')
  if (segs.length <= strip) return null
  return segs.slice(strip).join('/')
}

function lchmodIfPosix(filePath: string, mode: number | undefined, isWindows: boolean): void {
  if (isWindows || mode === undefined) return
  try {
    // 仅 POSIX：还原可执行权限位
    fs.chmodSync(filePath, mode & 0o7777)
  } catch {
    /* 忽略 */
  }
}

async function xzDecodeStream(): Promise<NodeJS.ReadWriteStream | null> {
  try {
    // 延迟加载可选原生依赖；与 Electron ABI 不兼容时抛错 → 回退系统 tar
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lzma = require('lzma-native') as { createDecompressor?: () => NodeJS.ReadWriteStream }
    if (typeof lzma.createDecompressor === 'function') {
      return lzma.createDecompressor()
    }
    return null
  } catch {
    return null
  }
}

async function systemTarExtract(archivePath: string, destDir: string, strip: number, onWarn?: (m: string) => void): Promise<void> {
  const tarBin = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  const args = ['-xf', archivePath, '-C', destDir]
  if (strip > 0) args.push('--strip-components', String(strip))
  await new Promise<void>((resolve, reject) => {
    const child = spawn(tarBin, args, { windowsHide: true })
    let stderr = ''
    child.stderr?.on('data', (d) => (stderr += String(d)))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`系统 tar 解压失败(code=${code}): ${stderr.slice(-500)}`))
    })
  })
  onWarn?.('使用系统 tar 完成 tar.xz 解压')
}

export async function extractTar(archivePath: string, destDir: string, opts: ExtractOptions & { archive: 'tar.gz' | 'tar.xz' }): Promise<void> {
  const strip = opts.stripComponents ?? 0
  fs.mkdirSync(destDir, { recursive: true })

  if (opts.archive === 'tar.xz') {
    const decoder = await xzDecodeStream()
    if (!decoder) return systemTarExtract(archivePath, destDir, strip, opts.onWarn)
    // lzma-native 可用 → 继续走纯 JS 通道
    await tarPipeline(archivePath, destDir, { ...opts, stripComponents: strip }, (rs) => rs.pipe(decoder))
    return
  }
  await tarPipeline(archivePath, destDir, { ...opts, stripComponents: strip }, (rs) => rs.pipe(zlib.createGunzip()))
}

async function tarPipeline(
  archivePath: string,
  destDir: string,
  opts: { stripComponents: number; isWindows: boolean; signal?: AbortSignal; onProgress?: (d: number, t: number) => void; onWarn?: (m: string) => void },
  pipeDecode: (rs: fs.ReadStream) => NodeJS.ReadableStream
): Promise<void> {
  return new Promise<void>((resolveP, rejectP) => {
    const ex = tarExtract()
    let done = 0
    let total = 0
    let finished = false

    const finish = (e?: Error): void => {
      if (finished) return
      finished = true
      if (e) rejectP(e)
      else resolveP()
    }

    ex.on('entry', (headers, stream, next) => {
      done++
      opts.onProgress?.(done, Math.max(total, done))
      if (opts.signal?.aborted) {
        stream.resume()
        finish(new Error('任务已取消'))
        return
      }
      const rel = stripRel(headers.name, opts.stripComponents)
      if (!rel) {
        stream.resume()
        next()
        return
      }
      try {
        const san = sanitizeRelPath(rel, opts.isWindows)
        if (san.sanitized) opts.onWarn?.(`Windows 保留名已重命名: ${rel}`)
        const outPath = safeJoin(destDir, san.path)

        const drain = (): Promise<void> =>
          new Promise<void>((res) => {
            if (opts.signal?.aborted) return res()
            stream.on('end', () => res())
            stream.on('close', () => res())
            stream.on('error', () => res())
            stream.resume()
          })

        const handle = async (): Promise<void> => {
          if (headers.type === 'directory') {
            fs.mkdirSync(outPath, { recursive: true })
            await drain()
            return
          }
          if (headers.type === 'symlink') {
            if (opts.isWindows) {
              opts.onWarn?.(`Windows 下跳过符号链接: ${rel}`)
              await drain()
              return
            }
            fs.mkdirSync(path.dirname(outPath), { recursive: true })
            try {
              fs.rmSync(outPath, { force: true })
              fs.symlinkSync(headers.linkname ?? '', outPath, 'dir')
            } catch (e) {
              opts.onWarn?.(`符号链接创建失败: ${rel} (${e instanceof Error ? e.message : String(e)})`)
            }
            await drain()
            return
          }
          if (headers.type === 'link') {
            // 硬链接：指向归档内已有文件
            const linkRel = stripRel(headers.linkname ?? '', opts.stripComponents)
            if (linkRel) {
              const src = safeJoin(destDir, sanitizeRelPath(linkRel, opts.isWindows).path)
              fs.mkdirSync(path.dirname(outPath), { recursive: true })
              try {
                fs.rmSync(outPath, { force: true })
                fs.linkSync(src, outPath)
              } catch (e) {
                opts.onWarn?.(`硬链接创建失败: ${rel} (${e instanceof Error ? e.message : String(e)})`)
              }
            }
            await drain()
            return
          }
          // 普通文件
          fs.mkdirSync(path.dirname(outPath), { recursive: true })
          await new Promise<void>((res, rej) => {
            const ws = fs.createWriteStream(outPath, { mode: 0o644 })
            stream.pipe(ws)
            ws.on('finish', () => res())
            ws.on('error', rej)
            stream.on('error', rej)
          })
          lchmodIfPosix(outPath, headers.mode, opts.isWindows)
        }

        void handle()
          .then(() => next())
          .catch((e) => {
            finish(e instanceof Error ? e : new Error(String(e)))
          })
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)))
      }
    })
    ex.on('finish', () => finish())
    ex.on('error', (e) => finish(e))

    const rs = fs.createReadStream(archivePath)
    rs.on('error', (e) => finish(e))
    pipeDecode(rs).on('error', (e) => finish(e as Error)).pipe(ex)
  })
}
