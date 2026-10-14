// 工作流模板变量渲染：{{var}} 语法，未知变量抛错（fail-fast）
// 主进程与 Worker 共用的纯函数。

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

export type TemplateVars = Record<string, string | number | undefined | null>

/** 渲染字符串中的所有 {{var}}；遇到未知变量抛错 */
export function renderTemplate(tpl: string, vars: TemplateVars): string {
  return tpl.replace(VAR_RE, (_m, rawName: string) => {
    const name = rawName
    if (!(name in vars) || vars[name] === undefined || vars[name] === null) {
      throw new Error(`模板变量 {{${name}}} 无法解析`)
    }
    return String(vars[name])
  })
}

/** 渲染对象中所有字符串值（浅层 + 一层嵌套对象/数组） */
export function renderDeep<T>(value: T, vars: TemplateVars): T {
  if (typeof value === 'string') return renderTemplate(value, vars) as unknown as T
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, vars)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = renderDeep(v, vars)
    return out as unknown as T
  }
  return value
}

/** 收集模板中引用的变量名 */
export function collectVars(tpl: string): string[] {
  const names: string[] = []
  for (const m of tpl.matchAll(VAR_RE)) names.push(m[1])
  return names
}

/** 版本号转文件系统安全的目录名片段 */
export function safeVersionSegment(version: string): string {
  return version.replace(/[^\w.+-]/g, '_')
}

/** 复合版本键：发行商工具为 `dist@version`，普通工具为裸 version */
export function makeVersionKey(dist: string | undefined, version: string): string {
  return dist ? `${dist}@${version}` : version
}

/** 解析复合版本键；无 @ 前缀时视为裸版本 */
export function splitVersionKey(key: string): { dist?: string; version: string } {
  const i = key.indexOf('@')
  if (i <= 0) return { version: key }
  return { dist: key.slice(0, i), version: key.slice(i + 1) }
}

/** 版本比较：按数字段比较，返回 -1/0/1；无法解析时回退字符串比较 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : NaN))
  const pb = b.split(/[.+-]/).map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : NaN))
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const xa = pa[i]
    const xb = pb[i]
    const na = typeof xa === 'number' && !Number.isNaN(xa)
    const nb = typeof xb === 'number' && !Number.isNaN(xb)
    if (na && nb) {
      if (xa !== xb) return (xa as number) < (xb as number) ? -1 : 1
    } else {
      const sa = String(pa[i] ?? '')
      const sb = String(pb[i] ?? '')
      if (sa !== sb) return sa < sb ? -1 : 1
    }
  }
  return 0
}

/** 当前平台信息 → 共享的平台键计算 */
export function currentOsName(platform: string): 'windows' | 'darwin' | 'linux' {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'darwin'
  return 'linux'
}
