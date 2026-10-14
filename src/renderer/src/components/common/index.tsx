// 通用小组件
import { useState, type ReactNode } from 'react'
import { currentLanguage } from '../../stores/i18n'

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  className = ''
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600',
    secondary:
      'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
  }[variant]
  return (
    <button className={`${base} ${sizes} ${variants} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function Badge({
  children,
  tone = 'zinc'
}: {
  children: ReactNode
  tone?: 'zinc' | 'green' | 'blue' | 'amber' | 'red' | 'brand'
}) {
  const tones = {
    zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    blue: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    brand: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700 ${className}`}>
      <div
        className="h-full rounded-full bg-brand-500 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative z-10 max-h-[85vh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-900`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          <button
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title?: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        {title && <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>}
        {subtitle && <p className={`text-sm text-zinc-500 dark:text-zinc-400 ${title ? 'mt-1' : ''}`}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ToolAvatar({
  toolId,
  icon,
  className = 'h-10 w-10 text-base'
}: {
  toolId: string
  /** 本地图标 data URL；未提供或加载失败时回退首字母 */
  icon?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(icon) && !failed
  const letter = toolId.charAt(0).toUpperCase()
  const bg = showImage
    ? 'bg-white dark:bg-zinc-800'
    : 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg font-bold ${bg} ${className}`}>
      {showImage ? (
        <img
          src={icon}
          alt={toolId}
          className="h-full w-full object-contain p-0.5"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        letter
      )}
    </div>
  )
}

/** 版本键展示标签：多发行商工具显示 "发行商 版本"，普通工具原样显示 */
export function formatVersionLabel(key: string, versions?: { key: string; version: string; distName?: string }[]): string {
  const v = versions?.find((x) => x.key === key)
  if (v?.distName) return `${v.distName} ${v.version}`
  const i = key.indexOf('@')
  return i > 0 ? `${key.slice(0, i)} ${key.slice(i + 1)}` : key
}

export function formatBytes(n?: number): string {
  if (!n || n <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatSpeed(bps: number): string {
  if (bps <= 0) return '-'
  return `${formatBytes(bps)}/s`
}

export function formatEta(sec: number): string {
  if (!sec || sec <= 0 || !Number.isFinite(sec)) return '-'
  if (sec < 60) return `${Math.ceil(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m${Math.ceil(sec % 60)}s`
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`
}

export function formatDateTime(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString(currentLanguage(), { hour12: false })
}

export function formatDuration(from: number, to?: number): string {
  if (!from) return '-'
  const ms = (to ?? Date.now()) - from
  if (ms < 0) return '-'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}
