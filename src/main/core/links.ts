// 链接（符号链接 / Windows 目录 junction）删除工具
// 背景：Windows 下 junction 会被 lstat 判定为符号链接，但
//   1. 非递归 fs.rmSync(p, { force: true }) 会把 junction 当作目录并抛 ERR_FS_EISDIR；
//   2. 递归 fs.rmSync(p, { recursive: true }) 会顺着 junction 删除目标目录的内容。
// 因此删除链接统一走 fs.unlinkSync，只删链接本身、不触碰目标。
import fs from 'node:fs'

/** 是否为链接（符号链接或 Windows junction）；路径不存在返回 false */
export function isLink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

/** 删除链接本身（不影响其指向的目标）；若为异常状态下的真实目录则按目录递归删除 */
export function removeLink(p: string): void {
  if (isLink(p)) {
    try {
      fs.unlinkSync(p)
    } catch (e) {
      // 链接已被并发删除时忽略，其余错误照常抛出
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    return
  }
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}
