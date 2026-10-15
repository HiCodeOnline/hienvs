// 步骤处理器集合：所有步骤只依赖 node 内置模块与本项目工具（可在 Worker 中运行）
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { StepHandler, TaskContext, StepRunHelpers, StepResult } from '../types'
import { TaskCancelled } from '../types'
import { download } from '../../worker/downloader'
import { extractZip } from '../../worker/extractor/zip'
import { extractTar } from '../../worker/extractor/tar'
import { applyEnvPlan } from '../../services/env/apply'
import { isLink, removeLink } from '../../core/links'
import type { DownloadParams } from '../../worker/downloader'
import type { ExtractOptions } from '../../worker/extractor/zip'

const STEP_DEFAULT_TIMEOUT = 1800

function withTimeout<T>(p: Promise<T>, sec: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout()
      reject(new Error(`步骤超时(${sec}s)`))
    }, sec * 1000)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

function checkAbort(ctx: TaskContext): void {
  if (ctx.aborted) throw new TaskCancelled()
}

/** 模板渲染后的 size 可能是数字/数字串/空串，归一化为 number | undefined */
function parseSize(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

// ---------- download ----------
/** 兼容镜像数组的两种形态：裸 URL 字符串 或 具名对象 { name, url } */
function toMirrorUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const m of raw) {
    if (typeof m === 'string') out.push(m)
    else if (m && typeof m === 'object' && typeof (m as { url?: unknown }).url === 'string') out.push((m as { url: string }).url)
  }
  return out
}

const downloadStep: StepHandler = async (params, ctx, run) => {
  checkAbort(ctx)
  const p: DownloadParams = {
    url: String(params.url ?? ''),
    fileName: params.fileName as string | undefined,
    sha256: params.sha256 as string | undefined,
    md5: params.md5 as string | undefined,
    sha1: params.sha1 as string | undefined,
    size: parseSize(params.size),
    mirrors: toMirrorUrls(params.mirrors),
    resume: params.resume as boolean | undefined,
    timeoutSec: (params.timeoutSec as number | undefined) ?? 3600
  }
  const r = await download(p, ctx, run)
  run.artifacts['downloadFile'] = r.file
  if (p.sha256) run.artifacts['downloadSha256'] = p.sha256
  return { detail: path.basename(r.file) }
}

// ---------- extract ----------
const extractStep: StepHandler = async (params, ctx, run) => {
  checkAbort(ctx)
  const archivePath = (params.from as string) ?? run.artifacts['downloadFile']
  if (!archivePath || !fs.existsSync(archivePath)) throw new Error(`归档文件不存在: ${archivePath}`)
  const to = String(params.to ?? ctx.paths.versionDir ?? '')
  if (!to) throw new Error('extract 步骤缺少 to')
  fs.mkdirSync(to, { recursive: true })

  const opts: ExtractOptions = {
    stripComponents: (params.stripComponents as number | undefined) ?? 0,
    isWindows: ctx.platform === 'windows',
    signal: run.signal,
    onProgress: (done, total) => {
      run.progress(done, total, 0, 0)
    },
    onWarn: (m) => run.log(m, 'warn')
  }
  const archive = String(params.archive ?? 'zip') as 'zip' | 'tar.gz' | 'tar.xz'
  // 幂等：已解压完成（标记内容为归档 sha256 或版本号）
  const marker = path.join(to, '.hienvs', 'extract.ok')
  const markerValue = run.artifacts['downloadSha256'] ?? ctx.version ?? 'ok'
  if (fs.existsSync(marker)) {
    const content = fs.readFileSync(marker, 'utf-8').trim()
    if (content === markerValue) {
      run.log('检测到已完成解压的标记，跳过')
      return { detail: '已完成（标记存在）' }
    }
  }
  if (archive === 'zip') {
    await extractZip(archivePath, to, opts)
  } else if (archive === 'tar.gz' || archive === 'tar.xz') {
    await extractTar(archivePath, to, { ...opts, archive })
  } else {
    throw new Error(`不支持的归档类型: ${archive}`)
  }
  fs.mkdirSync(path.join(to, '.hienvs'), { recursive: true })
  fs.writeFileSync(marker, markerValue, 'utf-8')
  return { detail: path.basename(archivePath) }
}

// ---------- move / copy / fs ----------
function resolveOne(p: string | undefined): string {
  if (!p) throw new Error('缺少路径参数')
  return p
}

const moveStep: StepHandler = async (params, _ctx, run) => {
  const from = resolveOne(params.from as string)
  const to = resolveOne(params.to as string)
  const overwrite = params.overwrite === true
  if (!fs.existsSync(from)) throw new Error(`源不存在: ${from}`)
  if (fs.existsSync(to)) {
    if (!overwrite) {
      run.log(`目标已存在，跳过: ${to}`)
      return { detail: '目标已存在，跳过' }
    }
    fs.rmSync(to, { recursive: true, force: true })
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
  run.undo(async () => {
    if (fs.existsSync(to)) fs.renameSync(to, from)
  })
  return { detail: `${path.basename(from)} → ${path.basename(to)}` }
}

const copyStep: StepHandler = async (params, _ctx, run) => {
  const from = resolveOne(params.from as string)
  const to = resolveOne(params.to as string)
  if (!fs.existsSync(from)) throw new Error(`源不存在: ${from}`)
  fs.cpSync(from, to, { recursive: true, force: params.overwrite === true })
  run.undo(async () => {
    fs.rmSync(to, { recursive: true, force: true })
  })
  return { detail: path.basename(to) }
}

const mkdirStep: StepHandler = async (params) => {
  const p = resolveOne(params.path as string)
  fs.mkdirSync(p, { recursive: params.recursive !== false })
  return { detail: p }
}

const deleteStep: StepHandler = async (params, ctx, run) => {
  const p = resolveOne(params.path as string)
  if (!fs.existsSync(p)) {
    run.log(`路径不存在，跳过删除: ${p}`)
    return { detail: '不存在，跳过' }
  }
  // 防护：禁止删除根目录 / hienvs 根 / tools 根
  const home = path.resolve(ctx.paths.hienvsHome)
  const resolved = path.resolve(p)
  if (resolved === path.resolve(home) || resolved === path.resolve(ctx.paths.toolsDir) || resolved === path.parse(home).root) {
    throw new Error(`拒绝删除受保护路径: ${p}`)
  }
  fs.rmSync(resolved, { recursive: params.recursive !== false, force: true })
  return { detail: path.basename(resolved) }
}

// ---------- env ----------
const envSetStep: StepHandler = async (params, ctx, run) => {
  const name = String(params.name ?? '')
  const value = String(params.value ?? '')
  if (!name) throw new Error('env.set 缺少 name')
  ctx.envPlan ??= { scope: ctx.envScope, platform: ctx.platform, vars: [], pathEntries: [], rcFiles: [] }
  const existing = ctx.envPlan.vars.find((v) => v.name === name)
  if (existing) existing.value = value
  else ctx.envPlan.vars.push({ name, value, expand: params.expand === true })
  run.log(`将设置环境变量 ${name}=${value}`)
  return { detail: `${name}=${value}` }
}

const envPathPrependStep: StepHandler = async (params, ctx, run) => {
  const value = String(params.value ?? '')
  if (!value) throw new Error('env.path.prepend 缺少 value')
  ctx.envPlan ??= { scope: ctx.envScope, platform: ctx.platform, vars: [], pathEntries: [], rcFiles: [] }
  if (!ctx.envPlan.pathEntries.includes(value)) {
    ctx.envPlan.pathEntries.unshift(value)
  }
  run.log(`将前置 PATH: ${value}`)
  return { detail: value }
}

const envPathRemoveStep: StepHandler = async (params, ctx, run) => {
  const value = String(params.value ?? '')
  ctx.envPlan ??= { scope: ctx.envScope, platform: ctx.platform, vars: [], pathEntries: [], rcFiles: [] }
  const before = ctx.envPlan.pathEntries.length
  ctx.envPlan.pathEntries = ctx.envPlan.pathEntries.filter((e) => !e.includes(value))
  return { detail: `移除 ${before - ctx.envPlan.pathEntries.length} 条` }
}

const envApplyStep: StepHandler = async (params, ctx, run) => {
  checkAbort(ctx)
  const timeout = (params.timeoutSec as number | undefined) ?? STEP_DEFAULT_TIMEOUT
  const changes = await withTimeout(applyEnvPlan(ctx, run), timeout, () => {
    ctx.aborted = true
  })
  if (changes.length > 0) {
    run.artifacts['envChanges'] = JSON.stringify(changes)
    for (const c of changes) {
      run.log(`环境变量变更: ${c.kind === 'path' ? 'PATH' : c.name} ${c.oldValue !== undefined ? `${c.oldValue} → ` : ''}${c.newValue ?? '(删除)'}`)
    }
  }
  return { detail: `${changes.length} 项变更` }
}

// ---------- verify ----------
const verifyStep: StepHandler = async (params, ctx, run) => {
  checkAbort(ctx)
  const cmd = String(params.run ?? '')
  if (!cmd) throw new Error('verify 缺少 run')
  const args = (params.args as string[] | undefined) ?? []
  const expectCode = (params.expectCode as number | undefined) ?? 0
  const expectRegex = params.expectOutputRegex as string | undefined

  // PATH 注入 currentDir/bin，使 run 可使用相对命令名
  const binDir = ctx.paths.currentDir ? path.join(ctx.paths.currentDir, 'bin') : undefined
  const childPath = [binDir, ctx.paths.currentDir, process.env.PATH].filter(Boolean).join(path.delimiter)

  const r = await new Promise<{ code: number; out: string; err: string }>((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      shell: params.shell === true,
      env: { ...process.env, PATH: childPath },
      cwd: (params.cwd as string | undefined) ?? ctx.paths.versionDir
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* 忽略 */ }
      reject(new Error(`验证命令超时: ${cmd}`))
    }, ((params.timeoutSec as number | undefined) ?? 60) * 1000)
    child.stdout?.on('data', (d) => (out += String(d)))
    child.stderr?.on('data', (d) => (err += String(d)))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, out, err })
    })
  })

  const combined = (r.out + r.err).trim()
  if (r.code !== expectCode) {
    throw new Error(`验证命令退出码 ${r.code}（期望 ${expectCode}）: ${cmd}\n输出: ${combined.slice(-300)}`)
  }
  if (expectRegex && !new RegExp(expectRegex, 'm').test(combined)) {
    throw new Error(`验证输出不匹配 /${expectRegex}/: ${combined.slice(-300)}`)
  }
  run.log(`验证通过: ${combined.split('\n')[0]?.slice(0, 120)}`)
  return { detail: combined.split('\n')[0]?.slice(0, 120) ?? `exit ${r.code}` }
}

// ---------- exec（安装包执行 / 通用命令，支持管理员提权） ----------
function posixQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** 按平台包装提权命令：Windows PowerShell RunAs（UAC）、macOS osascript、Linux pkexec */
function elevateCommand(cmd: string, args: string[], platform: TaskContext['platform']): { cmd: string; args: string[] } {
  if (platform === 'windows') {
    const psQuote = (s: string): string => `'${String(s).replace(/'/g, "''")}'`
    const all = [cmd, ...args].map(psQuote)
    const filePath = all[0]
    const argList = all.length > 1 ? all.slice(1).join(',') : '@()'
    return {
      cmd: 'powershell',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$p = Start-Process -FilePath ${filePath} -ArgumentList ${argList} -Verb RunAs -Wait -PassThru; exit $p.ExitCode`
      ]
    }
  }
  if (platform === 'darwin') {
    const inner = [cmd, ...args].map(posixQuote).join(' ')
    return { cmd: 'osascript', args: ['-e', `do shell script ${posixQuote(inner)} with administrator privileges`] }
  }
  return { cmd: 'pkexec', args: [cmd, ...args] }
}

const execStep: StepHandler = async (params, ctx, run) => {
  checkAbort(ctx)
  const cmd = String(params.run ?? '')
  if (!cmd) throw new Error('exec 缺少 run')
  const args = (params.args as string[] | undefined) ?? []
  const expectCode = (params.expectCode as number | undefined) ?? 0

  let realCmd = cmd
  let realArgs = args
  let shell = params.shell === true
  if (params.elevate === true) {
    const el = elevateCommand(cmd, args, ctx.platform)
    realCmd = el.cmd
    realArgs = el.args
    shell = false
    run.log(`以管理员权限执行: ${cmd}`)
  }

  // PATH 注入 currentDir/bin，使相对命令名可用
  const binDir = ctx.paths.currentDir ? path.join(ctx.paths.currentDir, 'bin') : undefined
  const childPath = [binDir, ctx.paths.currentDir, process.env.PATH].filter(Boolean).join(path.delimiter)

  const r = await new Promise<{ code: number; out: string; err: string }>((resolve, reject) => {
    const child = spawn(realCmd, realArgs, {
      windowsHide: true,
      shell,
      env: { ...process.env, PATH: childPath },
      cwd: (params.cwd as string | undefined) ?? ctx.paths.versionDir
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* 忽略 */ }
      reject(new Error(`命令超时: ${cmd}`))
    }, ((params.timeoutSec as number | undefined) ?? 300) * 1000)
    child.stdout?.on('data', (d) => {
      out += String(d)
      for (const line of String(d).split('\n')) if (line.trim()) run.log(line.trimEnd(), 'debug')
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
      for (const line of String(d).split('\n')) if (line.trim()) run.log(line.trimEnd(), 'debug')
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, out, err })
    })
  })

  if (r.code !== expectCode) {
    throw new Error(`命令退出码 ${r.code}（期望 ${expectCode}）: ${cmd}\n${(r.err || r.out).slice(-400)}`)
  }
  return { detail: (r.out || r.err).split('\n')[0]?.slice(0, 120) ?? `exit ${r.code}` }
}

// ---------- shell.run / git.clone ----------
const shellRunStep: StepHandler = async (params, ctx, run) => {
  checkAbort(ctx)
  const cmd = String(params.run ?? '')
  if (!cmd) throw new Error('shell.run 缺少 run')
  const args = (params.args as string[] | undefined) ?? []
  const r = await new Promise<{ code: number; out: string; err: string }>((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      shell: params.shell !== false,
      cwd: (params.cwd as string | undefined) ?? ctx.paths.versionDir,
      env: { ...process.env, ...((params.env as Record<string, string>) ?? {}) }
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* 忽略 */ }
      reject(new Error(`命令超时: ${cmd}`))
    }, ((params.timeoutSec as number | undefined) ?? 300) * 1000)
    child.stdout?.on('data', (d) => {
      out += String(d)
      for (const line of String(d).split('\n')) if (line.trim()) run.log(line.trimEnd(), 'debug')
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
      for (const line of String(d).split('\n')) if (line.trim()) run.log(line.trimEnd(), 'debug')
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, out, err })
    })
  })
  if (r.code !== 0) {
    throw new Error(`命令失败(${r.code}): ${cmd}\n${(r.err || r.out).slice(-400)}`)
  }
  return { detail: (r.out || r.err).split('\n')[0]?.slice(0, 120) }
}

const gitCloneStep: StepHandler = async (params, ctx, run) => {
  checkAbort(ctx)
  const repo = String(params.repo ?? '')
  const to = String(params.to ?? '')
  if (!repo || !to) throw new Error('git.clone 缺少 repo/to')
  if (fs.existsSync(path.join(to, '.git'))) {
    run.log('仓库已存在，跳过克隆')
    return { detail: '已存在，跳过' }
  }
  const args = ['clone']
  if (params.depth) args.push('--depth', String(params.depth))
  if (params.branch || params.ref) args.push('--branch', String(params.branch ?? params.ref))
  args.push(repo, to)
  return shellRunStep({ run: 'git', args, timeoutSec: params.timeoutSec ?? 1800 }, ctx, run)
}

// ---------- cleanup / builtin ----------
const cleanupStep: StepHandler = async (params, _ctx, run) => {
  const paths = (params.paths as string[] | undefined) ?? []
  let n = 0
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true })
        n++
      }
    } catch (e) {
      run.log(`清理失败(忽略): ${p} ${e instanceof Error ? e.message : String(e)}`, 'warn')
    }
  }
  return { detail: `清理 ${n} 项` }
}

const linkCurrentStep: StepHandler = async (params, ctx, run) => {
  const target = resolveOne(params.target as string)
  const link = resolveOne(params.link as string)
  if (!fs.existsSync(target)) throw new Error(`目标版本目录不存在: ${target}`)
  if (isLink(link)) {
    try {
      const real = fs.realpathSync(link)
      if (path.resolve(real) === path.resolve(target)) {
        run.log('current 已指向目标版本')
        return { detail: '已指向目标' }
      }
    } catch { /* 失效链接，重建 */ }
    removeLink(link)
  } else if (fs.existsSync(link)) {
    // current 不是链接（异常状态），删除重建
    removeLink(link)
  }
  fs.symlinkSync(target, link, ctx.platform === 'windows' ? 'junction' : 'dir')
  run.log(`current → ${path.basename(target)}`)
  run.undo(async () => {
    try {
      removeLink(link)
    } catch { /* 忽略 */ }
  })
  return { detail: `${path.basename(link)} → ${path.basename(target)}` }
}

const unlinkCurrentStep: StepHandler = async (params, _ctx, run) => {
  const link = resolveOne(params.link as string)
  if (isLink(link)) {
    removeLink(link)
    run.log('已解除 current 链接')
  }
  return { detail: '解除激活' }
}

export const stepHandlers: Record<string, StepHandler> = {
  download: downloadStep,
  extract: extractStep,
  move: moveStep,
  copy: copyStep,
  'fs.mkdir': mkdirStep,
  'fs.delete': deleteStep,
  'env.set': envSetStep,
  'env.path.prepend': envPathPrependStep,
  'env.path.remove': envPathRemoveStep,
  'env.apply': envApplyStep,
  verify: verifyStep,
  'shell.run': shellRunStep,
  'exec': execStep,
  'git.clone': gitCloneStep,
  cleanup: cleanupStep,
  'builtin.link-current': linkCurrentStep,
  'builtin.unlink-current': unlinkCurrentStep
}

export type { StepResult }
