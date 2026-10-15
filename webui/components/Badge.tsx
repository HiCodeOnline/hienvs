import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const TONES: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20',
  emerald:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20'
}

export function Badge({
  children,
  tone = 'slate',
  className
}: {
  children: ReactNode
  tone?: keyof typeof TONES | string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1',
        TONES[tone] ?? TONES.slate,
        className
      )}
    >
      {children}
    </span>
  )
}
