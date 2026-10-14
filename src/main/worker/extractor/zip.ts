// zip 解压（yauzl，纯 JS），支持 stripComponents / ZipSlip 防护 / 进度 / 取消
import fs from 'node:fs'
import path from 'node:path'
import yauzl from 'yauzl'
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
  if (norm.endsWith('/')) {
    // 目录条目：去掉尾部斜杠后计算
    const segs = norm.slice(0, -1).split('/')
    if (segs.length <= strip) return null
    return segs.slice(strip).join('/')
  }
  const segs = norm.split('/')
  if (segs.length <= strip) return null
  return segs.slice(strip).join('/')
}

export async function extractZip(archivePath: string, destDir: string, opts: ExtractOptions): Promise<void> {
  const strip = opts.stripComponents ?? 0
  return new Promise<void>((resolveP, rejectP) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true, decodeStrings: true }, (err, zipfile) => {
      if (err || !zipfile) return rejectP(err ?? new Error('无法打开 zip'))
      let done = 0
      let cancelled = false
      const total = zipfile.entryCount

      const checkAbort = (): boolean => {
        if (opts.signal?.aborted) {
          cancelled = true
          return true
        }
        return false
      }

      zipfile.on('error', (e) => rejectP(e))
      zipfile.on('end', () => resolveP())
      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (checkAbort()) {
          zipfile.close()
          return rejectP(new Error('任务已取消'))
        }
        const isDir = entry.fileName.endsWith('/')
        const rel = stripRel(entry.fileName, strip)
        done++
        opts.onProgress?.(done, total)
        if (!rel) {
          zipfile.readEntry()
          return
        }
        try {
          const san = sanitizeRelPath(rel, opts.isWindows)
          if (san.sanitized) opts.onWarn?.(`Windows 保留名已重命名: ${rel}`)
          const outPath = safeJoin(destDir, san.path)
          if (isDir) {
            fs.mkdirSync(outPath, { recursive: true })
            zipfile.readEntry()
            return
          }
          fs.mkdirSync(path.dirname(outPath), { recursive: true })
          zipfile.openReadStream(entry, (err2, readStream) => {
            if (err2 || !readStream) {
              zipfile.close()
              return rejectP(err2 ?? new Error(`无法读取条目: ${entry.fileName}`))
            }
            const ws = fs.createWriteStream(outPath)
            readStream.pipe(ws)
            ws.on('finish', () => {
              if (cancelled) return
              zipfile.readEntry()
            })
            ws.on('error', (e3) => {
              zipfile.close()
              rejectP(e3)
            })
            readStream.on('error', (e3) => {
              zipfile.close()
              rejectP(e3)
            })
          })
        } catch (e) {
          zipfile.close()
          rejectP(e)
        }
      })
      if (checkAbort()) return rejectP(new Error('任务已取消'))
      zipfile.readEntry()
    })
  })
}
