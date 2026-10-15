// 底部状态栏（VS Code 风格，沿用主题色）：左侧下载/安装磁盘占用，右侧系统信息（点击弹出关于）与仓库链接
import { useEffect, useState } from 'react'
import type { AppInfo, DiskUsage } from '@shared/tool-types'
import { useSettingsStore } from '../../stores/settings'
import { useI18n } from '../../stores/i18n'
import { Modal, formatBytes } from '../common'
import logoUrl from '../../assets/logo.png'

const ITEM = 'flex h-full items-center gap-1 px-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10'

/** 磁盘占用率 -> 状态色：<70% 绿、≥70% 橙、≥90% 红 */
function usageTone(pct: number): { dot: string; glow: string } {
  if (pct >= 90)
    return { dot: 'bg-red-500', glow: 'shadow-[0_0_6px_2px_rgba(239,68,68,0.7)]' }
  if (pct >= 70)
    return { dot: 'bg-amber-500', glow: 'shadow-[0_0_6px_2px_rgba(245,158,11,0.7)]' }
  return { dot: 'bg-emerald-500', glow: 'shadow-[0_0_6px_2px_rgba(16,185,129,0.7)]' }
}

export function StatusBar() {
  const settings = useSettingsStore((s) => s.settings)
  const t = useI18n()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [download, setDownload] = useState<DiskUsage | null>(null)
  const [install, setInstall] = useState<DiskUsage | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

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

  const diskItem = (label: string, usage: DiskUsage | null) => {
    const pct = usage && usage.total > 0 ? ((usage.total - usage.free) / usage.total) * 100 : 0
    const tone = usageTone(pct)
    return (
      <span
        className={ITEM}
        title={`${label} ${pct.toFixed(0)}%`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${tone.glow}`} />
        {label} {usage ? `${formatBytes(usage.total - usage.free)} / ${formatBytes(usage.total)}` : '—'}
      </span>
    )
  }

  return (
    <footer className="flex h-6 shrink-0 select-none items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
      <div className="flex h-full items-center">
        {diskItem(t('statusBar.download'), download)}
        {diskItem(t('statusBar.install'), install)}
      </div>
      <div className="flex h-full items-center">
        {/* 点击弹出关于卡片 */}
        <button
          onClick={() => setAboutOpen(true)}
          title={t('statusBar.osArch')}
          className={`${ITEM} cursor-pointer`}
        >
          {info ? `${info.osLabel} · ${info.arch}` : '—'}
        </button>
        <a
          href="https://hicodeonline.github.io/HiEnvsRepository"
          target="_blank"
          rel="noreferrer"
          title={t('statusBar.repo')}
          className={ITEM}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </div>

      {/* 关于卡片 */}
      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title={t('about.title')}>
        <div className="flex flex-col items-center py-4 text-center">
          <img src={logoUrl} alt="HiEnvs" className="h-16 w-16" draggable={false} />
          <h3 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">HiEnvs</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('about.slogan')}</p>
          {info && (
            <>
              <p className="mt-4 text-xs text-zinc-400">
                {info.osLabel} · {info.arch}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">{t('about.version', { version: info.version })}</p>
            </>
          )}
        </div>
      </Modal>
    </footer>
  )
}
