'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { RegionMeta } from '@/lib/regions'
import logo from '@/app/icon.png'
import { LanguageSwitcher } from './LanguageSwitcher'
import { RegionSwitcher } from './RegionSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { useI18n } from './providers'

export function Header({ regions }: { regions: RegionMeta[] }) {
  const { t } = useI18n()
  const pathname = usePathname()
  const current = pathname.split('/').filter(Boolean)[0]

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src={logo.src}
            alt="HiEnvs"
            className="h-8 w-8 rounded-lg object-cover shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
          />
          <span className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">
            {t('site.title')}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <RegionSwitcher regions={regions} current={current} />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
