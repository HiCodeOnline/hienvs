'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface DropdownItem {
  key: string
  label: string
  hint?: string
  active?: boolean
  onSelect: () => void
}

interface DropdownProps {
  button: ReactNode
  items: DropdownItem[]
  align?: 'start' | 'end'
  label?: string
  width?: string
}

/** 通用下拉：外部点击 / Esc 关闭 */
export function Dropdown({ button, items, align = 'end', label, width = 'w-56' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800/60 dark:hover:text-white"
      >
        {button}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-2 max-h-80 overflow-y-auto rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-900/10 dark:bg-slate-900 dark:ring-slate-100/10',
            width,
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect()
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition',
                item.active
                  ? 'bg-sky-50 font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              )}
            >
              <span>{item.label}</span>
              {item.hint && (
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{item.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
