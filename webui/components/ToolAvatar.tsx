'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'

interface ToolAvatarProps {
  name: string
  icon?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'h-8 w-8 text-xs rounded-lg',
  md: 'h-11 w-11 text-base rounded-xl',
  lg: 'h-14 w-14 text-xl rounded-2xl'
}

/** 工具图标：未配置图标或加载失败时回退首字母 */
export function ToolAvatar({ name, icon, size = 'md' }: ToolAvatarProps) {
  const [failed, setFailed] = useState(false)
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  if (!icon || failed) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center bg-gradient-to-br from-sky-400 to-indigo-600 font-semibold text-white',
          SIZES[size]
        )}
        aria-hidden="true"
      >
        {initial}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 bg-white object-contain p-1.5 ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10',
        SIZES[size]
      )}
    />
  )
}
