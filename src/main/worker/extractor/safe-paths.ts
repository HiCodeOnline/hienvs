// 解压安全路径与 Windows 保留名处理
import path from 'node:path'

/** 校验解压目标路径不逃逸出 destDir（ZipSlip 防护），返回规范化绝对路径 */
export function safeJoin(destDir: string, relPath: string): string {
  const target = path.resolve(destDir, relPath)
  const base = path.resolve(destDir)
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`非法归档路径（逃逸）: ${relPath}`)
  }
  return target
}

const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)
])

/** Windows 保留字符/保留名清理；非 Windows 返回原值 */
export function sanitizeSegment(segment: string, isWindows: boolean): { name: string; sanitized: boolean } {
  if (!isWindows) return { name: segment, sanitized: false }
  let name = segment.replace(/[<>:"|?*\u0000-\u001f]/g, '_')
  const base = name.replace(/\.(?=[^.]*$).*$/.test(name) ? name : name, '')
  void base
  const stem = name.includes('.') ? name.slice(0, name.indexOf('.')) : name
  if (RESERVED.has(stem.toUpperCase())) name = '_' + name
  if (/[. ]$/.test(name)) name = name.replace(/[. ]+$/, '_')
  if (name !== segment) return { name, sanitized: true }
  return { name, sanitized: false }
}

/** 应用 sanitize 到相对路径的每一段 */
export function sanitizeRelPath(relPath: string, isWindows: boolean): { path: string; sanitized: boolean } {
  if (!isWindows) return { path: relPath, sanitized: false }
  const segs = relPath.split(/[\\/]/)
  let sanitized = false
  const out = segs.map((s) => {
    const r = sanitizeSegment(s, true)
    if (r.sanitized) sanitized = true
    return r.name
  })
  return { path: out.join(path.sep), sanitized }
}
