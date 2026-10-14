// Windows 环境变量实现：reg.exe（不经 shell），广播 WM_SETTINGCHANGE，系统级 UAC 提权
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const HKCU_ENV = 'HKCU\\Environment'
const HKLM_ENV = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'

export interface WinVarSpec {
  name: string
  value: string
  expand?: boolean
}

function runReg(args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('reg', args, { windowsHide: true, windowsVerbatimArguments: false })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('reg 命令超时'))
    }, timeoutMs)
    child.stdout?.on('data', (d) => (out += String(d)))
    child.stderr?.on('data', (d) => (err += String(d)))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `reg exit ${code}`))
    })
  })
}

/** 读取单个环境变量（reg query），不存在返回 undefined */
export async function readWindowsVar(name: string, scope: 'user' | 'system'): Promise<string | undefined> {
  const key = scope === 'user' ? HKCU_ENV : HKLM_ENV
  try {
    const out = await runReg(['query', key, '/v', name])
    const m = out.match(new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.*)$`, 'im'))
    return m ? m[1].trimEnd() : undefined
  } catch {
    return undefined
  }
}

export async function writeWindowsVar(spec: WinVarSpec, scope: 'user' | 'system'): Promise<void> {
  const key = scope === 'user' ? HKCU_ENV : HKLM_ENV
  const type = spec.expand || spec.name.toUpperCase() === 'PATH' ? 'REG_EXPAND_SZ' : 'REG_SZ'
  await runReg(['add', key, '/v', spec.name, '/t', type, '/d', spec.value, '/f'])
}

export async function deleteWindowsVar(name: string, scope: 'user' | 'system'): Promise<void> {
  const key = scope === 'user' ? HKCU_ENV : HKLM_ENV
  try {
    await runReg(['delete', key, '/v', name, '/f'])
  } catch (e) {
    // 不存在视为成功
    if (!String(e).includes('unable to find')) throw e
  }
}

/** 广播 WM_SETTINGCHANGE，让资源管理器/新进程感知变更（失败仅告警） */
export async function broadcastEnvChange(): Promise<void> {
  const script = `
$signature = @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
Add-Type -MemberDefinition $signature -Namespace Win32 -Name NativeMethods
$result = [UIntPtr]::Zero
[Win32.NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) | Out-Null
Write-Output 'OK'
`.trim()
  await new Promise<void>((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true })
    child.on('error', () => resolve())
    child.on('exit', () => resolve())
    setTimeout(() => {
      try { child.kill() } catch { /* 忽略 */ }
      resolve()
    }, 10000)
  })
}

/**
 * 系统级写入：生成自包含 PS 脚本，UAC 提权执行（Start-Process -Verb RunAs），结果落临时文件回读。
 * 一次性完成所有变量 + PATH 写入 + 广播，只弹一次 UAC。
 */
export async function applySystemElevated(specs: WinVarSpec[], deletes: string[], newPath: string | null, log?: (m: string) => void): Promise<void> {
  const id = crypto.randomUUID()
  const tmpDir = os.tmpdir()
  const scriptFile = path.join(tmpDir, `hienvs-elev-${id}.ps1`)
  const outFile = path.join(tmpDir, `hienvs-elev-${id}.out`)

  const esc = (s: string): string => s.replace(/'/g, "''")
  const lines: string[] = ['$ErrorActionPreference = "Stop"']
  lines.push(`$key = "${HKLM_ENV}"`)
  if (newPath !== null) {
    lines.push(`reg add "$key" /v Path /t REG_EXPAND_SZ /d '${esc(newPath)}' /f | Out-Null`)
  }
  for (const d of deletes) {
    lines.push(`reg delete "$key" /v '${esc(d)}' /f | Out-Null`)
  }
  for (const s of specs) {
    const type = s.expand || s.name.toUpperCase() === 'PATH' ? 'REG_EXPAND_SZ' : 'REG_SZ'
    lines.push(`reg add "$key" /v '${esc(s.name)}' /t ${type} /d '${esc(s.value)}' /f | Out-Null`)
  }
  lines.push(
    `$signature = @'\n[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]\npublic static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);\n'@`,
    'Add-Type -MemberDefinition $signature -Namespace Win32 -Name NativeMethods',
    '$result = [UIntPtr]::Zero',
    "[Win32.NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result) | Out-Null",
    `Set-Content -Path '${outFile.replace(/'/g, "''")}' -Value 'OK'`
  )

  fs.writeFileSync(scriptFile, lines.join('\r\n'), 'utf-8')
  try {
    log?.('正在请求管理员权限（UAC）…')
    const outer = `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptFile.replace(/'/g, "''")}'`
    await new Promise<void>((resolve, reject) => {
      const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', outer], { windowsHide: true })
      let stderr = ''
      child.stderr?.on('data', (d) => (stderr += String(d)))
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`提权执行失败(code=${code}): ${stderr.slice(-300)}`))
      })
      setTimeout(() => {
        try { child.kill() } catch { /* 忽略 */ }
        reject(new Error('提权执行超时'))
      }, 300000)
    })
    if (!fs.existsSync(outFile)) throw new Error('管理员授权被拒绝或执行未完成')
  } finally {
    try { fs.rmSync(scriptFile, { force: true }) } catch { /* 忽略 */ }
    try { fs.rmSync(outFile, { force: true }) } catch { /* 忽略 */ }
  }
}
