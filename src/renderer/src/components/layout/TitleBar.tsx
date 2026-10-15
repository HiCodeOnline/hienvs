// 自定义标题栏：窗口控制按钮按平台适配（macOS 原生红绿灯 / Windows 直角 / Linux 圆形）
import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores/app'
import { useI18n } from '../../stores/i18n'

const PLATFORM = window.api.platform
const IS_MAC = PLATFORM === 'darwin'
const IS_LINUX = PLATFORM === 'linux'

/** 在标题栏展示标题的页面（其余页面仅显示图标） */
const PAGE_TITLE: Partial<Record<string, string>> = {
  dashboard: 'nav.dashboard',
  tools: 'nav.tools',
  tasks: 'nav.tasks',
  settings: 'nav.settings'
}

/** Windows 风格图标：1px 细线，10×10 视口 */
function WinMinIcon() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function WinMaxIcon() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function WinRestoreIcon() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
      <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function WinCloseIcon() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/** Linux 风格图标：圆形按钮内使用更粗的线条 */
function LinMinIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3">
      <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function LinMaxIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3">
      <rect x="2.75" y="2.75" width="6.5" height="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" rx="1" />
    </svg>
  )
}

function LinRestoreIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3">
      <path d="M4 4V2.75h5.25V8h-1.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="2.75" y="4" width="5.25" height="5.25" fill="none" stroke="currentColor" strokeWidth="1.4" rx="1" />
    </svg>
  )
}

function LinCloseIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3">
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Windows 风格：直角、宽按钮、关闭悬停变红 */
function WindowsControls({ maximized }: { maximized: boolean }) {
  const t = useI18n()
  const base =
    'no-drag flex w-12 items-center justify-center text-zinc-600 transition-colors hover:bg-zinc-200/70 active:bg-zinc-300/70 dark:text-zinc-300 dark:hover:bg-zinc-700/60'
  return (
    <div className="flex h-full items-stretch">
      <button className={base} title={t('window.minimize')} onClick={() => void window.api.windowMinimize()}>
        <WinMinIcon />
      </button>
      <button
        className={base}
        title={maximized ? t('window.restore') : t('window.maximize')}
        onClick={() => void window.api.windowToggleMaximize()}
      >
        {maximized ? <WinRestoreIcon /> : <WinMaxIcon />}
      </button>
      <button
        className="no-drag flex w-12 items-center justify-center text-zinc-600 transition-colors hover:bg-red-600 hover:text-white active:bg-red-700 dark:text-zinc-300"
        title={t('window.close')}
        onClick={() => void window.api.windowClose()}
      >
        <WinCloseIcon />
      </button>
    </div>
  )
}

/** Linux 风格（GNOME/Adwaita）：圆形按钮、关闭为红色圆点 */
function LinuxControls({ maximized }: { maximized: boolean }) {
  const t = useI18n()
  const base =
    'no-drag flex h-6 w-6 items-center justify-center rounded-full transition-colors focus:outline-none'
  const neutral = `${base} bg-zinc-200 text-zinc-700 hover:bg-zinc-300 active:bg-zinc-400 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600`
  return (
    <div className="flex h-full items-center gap-2 pe-3">
      <button className={neutral} title={t('window.minimize')} onClick={() => void window.api.windowMinimize()}>
        <LinMinIcon />
      </button>
      <button
        className={neutral}
        title={maximized ? t('window.restore') : t('window.maximize')}
        onClick={() => void window.api.windowToggleMaximize()}
      >
        {maximized ? <LinRestoreIcon /> : <LinMaxIcon />}
      </button>
      <button
        className={`${base} bg-red-500 text-white hover:bg-red-600 active:bg-red-700`}
        title={t('window.close')}
        onClick={() => void window.api.windowClose()}
      >
        <LinCloseIcon />
      </button>
    </div>
  )
}

export function TitleBar() {
  const page = useAppStore((s) => s.page)
  const t = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    // macOS 使用系统原生红绿灯，无需自绘按钮与状态
    if (IS_MAC) return
    void window.api.windowIsMaximized().then(setMaximized)
    return window.api.onWindowMaximizedChanged(setMaximized)
  }, [])

  return (
    // 标题栏固定为 LTR：窗口控制按钮的位置不随 RTL 语言镜像
    <div
      dir="ltr"
      className="drag-region flex h-10 shrink-0 select-none items-center"
    >
      {/* macOS 左侧预留原生红绿灯区域；应用图标固定在顶部，其后跟随当前页面标题 */}
      <div className={`flex h-full items-center gap-2 ${IS_MAC ? 'ps-20' : 'ps-3'}`}>
        <div className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-bold text-white">
          H
        </div>
        {PAGE_TITLE[page] && (
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{t(PAGE_TITLE[page] as string)}</span>
        )}
      </div>
      <div className="flex-1" />
      {!IS_MAC && (IS_LINUX ? <LinuxControls maximized={maximized} /> : <WindowsControls maximized={maximized} />)}
    </div>
  )
}
