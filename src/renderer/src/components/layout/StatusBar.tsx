// 底部状态栏（VS Code 风格，沿用主题色）：左侧软件源与磁盘占用，右侧系统名称与架构
import { useEffect, useState } from 'react'
import type { AppInfo, DiskUsage } from '@shared/tool-types'
import { useRegistryStore } from '../../stores/registry'
import { useSettingsStore } from '../../stores/settings'
import { formatBytes } from '../common'

const ITEM = 'flex h-full items-center gap-1 px-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10'

export function StatusBar() {
  const snapshot = useRegistryStore((s) => s.snapshot)
  const settings = useSettingsStore((s) => s.settings)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [download, setDownload] = useState<DiskUsage | null>(null)
  const [install, setInstall] = useState<DiskUsage | null>(null)

  useEffect(() => {
    void window.api
      .appInfo()
      .then(setInfo)
      .catch(() => undefined)
  }, [])

  // 下载/安装目录变更后重新统计所在磁盘空间
  const downloadDir = settings?.downloadDir
  const installDir = settings?.installDir
  useEffect(() => {
    if (!downloadDir || !installDir) return
    let alive = true
    void Promise.all([window.api.diskUsage(downloadDir), window.api.diskUsage(installDir)])
      .then(([d, i]) => {
        if (!alive) return
        setDownload(d)
        setInstall(i)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [downloadDir, installDir])

  const enabledSources = (snapshot?.sources ?? []).filter((s) => s.enabled)
  const sourceLabel = enabledSources.length === 0 ? '无软件源' : enabledSources.map((s) => s.name).join('、')

  const diskItem = (label: string, usage: DiskUsage | null) => (
    <span className={ITEM} title={label}>
      {label} {usage ? `${formatBytes(usage.total - usage.free)} / ${formatBytes(usage.total)}` : '—'}
    </span>
  )

  return (
    <footer className="flex h-6 shrink-0 select-none items-center justify-between border-t border-zinc-200 bg-white text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <div className="flex h-full items-center">
        <span className={`${ITEM} max-w-[16rem] truncate`} title={`启用的软件源：${sourceLabel}`}>
          {enabledSources.length > 0 && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.7)]" />
          )}
          {sourceLabel}
        </span>
        {diskItem('下载', download)}
        {diskItem('安装', install)}
      </div>
      <div className="flex h-full items-center">
        <span className={ITEM} title="当前操作系统与架构">
          {info ? `${info.osLabel} · ${info.arch}` : '—'}
        </span>
      </div>
    </footer>
  )
}
