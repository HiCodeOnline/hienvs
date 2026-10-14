// macOS / Linux 环境变量实现：shell rc 托管标记块 + environment.d（Linux 尽力而为）
import fs from 'node:fs'
import path from 'node:path'
import { BLOCK_BEGIN, BLOCK_END } from './planner'

export function readManagedBlock(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null
    const content = fs.readFileSync(file, 'utf-8')
    const begin = content.indexOf(BLOCK_BEGIN)
    if (begin < 0) return null
    const end = content.indexOf(BLOCK_END, begin)
    if (end < 0) return null
    return content.slice(begin, end + BLOCK_END.length)
  } catch {
    return null
  }
}

/** 从文件中剥离托管块 */
function stripBlock(content: string): string {
  const begin = content.indexOf(BLOCK_BEGIN)
  if (begin < 0) return content
  const end = content.indexOf(BLOCK_END, begin)
  if (end < 0) return content
  const before = content.slice(0, begin)
  const after = content.slice(end + BLOCK_END.length)
  return (before + after).replace(/\n{3,}/g, '\n\n')
}

/**
 * 重写托管块：blockContent 为空 → 仅移除旧块；否则替换为新块（追加到文件尾）。
 * 返回旧块内容（供回滚）。
 */
export function writeManagedBlock(file: string, blockContent: string): string | null {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  let content = ''
  try {
    if (fs.existsSync(file)) content = fs.readFileSync(file, 'utf-8')
  } catch { /* 空文件 */ }
  const oldBlock = readManagedBlock(file)
  content = stripBlock(content).replace(/\n+$/, '')
  if (blockContent) {
    content = content + (content ? '\n\n' : '') + blockContent + '\n'
  }
  fs.writeFileSync(file, content, 'utf-8')
  return oldBlock
}

/** 回滚：恢复旧块（或删除块） */
export function restoreManagedBlock(file: string, oldBlock: string | null): void {
  try {
    if (oldBlock !== null) {
      writeManagedBlock(file, oldBlock.replace(BLOCK_BEGIN + '\n', '').replace(BLOCK_END, '').trim() ? oldBlock : '')
    } else {
      writeManagedBlock(file, '')
    }
  } catch { /* 忽略 */ }
}

/** Linux: environment.d 写入（systemd 用户会话） */
export function writeEnvironmentD(home: string, lines: string[]): void {
  try {
    const dir = path.join(home, '.config', 'environment.d')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'hienvs.conf')
    if (lines.length === 0) {
      fs.rmSync(file, { force: true })
      return
    }
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf-8')
  } catch { /* 尽力而为 */ }
}

/** 解析托管块中的 export 变量（快照/预览用） */
export function parseBlockVars(block: string | null): { name: string; value: string }[] {
  if (!block) return []
  const out: { name: string; value: string }[] = []
  for (const m of block.matchAll(/^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)="(.*)"\s*$/gm)) {
    if (m[1] === 'HIENVS_HOME' || m[1] === 'PATH') continue
    out.push({ name: m[1], value: m[2] })
  }
  return out
}

export function parseBlockPathEntries(block: string | null): string[] {
  if (!block) return []
  for (const m of block.matchAll(/^\s*export\s+PATH=(.*)$/gm)) {
    const raw = m[1]
    // 形如 "a":"b":$PATH
    const entries: string[] = []
    for (const part of raw.split(':')) {
      const unquoted = part.replace(/^"|"$/g, '')
      if (unquoted === '$PATH' || unquoted.length === 0) continue
      entries.push(unquoted)
    }
    return entries
  }
  return []
}
