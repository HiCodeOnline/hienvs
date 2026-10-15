'use client'

import Link from 'next/link'
import { regionLabel } from '@/lib/i18n'
import type { RegionMeta } from '@/lib/regions'
import { Badge } from './Badge'
import { useI18n } from './providers'

interface RegionLandingProps {
  regions: RegionMeta[]
  defaultRegion: string
  toolCounts: Record<string, number>
}

/** 落地页：地区选择（应用商店式的分区入口） */
export function RegionLanding({ regions, defaultRegion, toolCounts }: RegionLandingProps) {
  const { t } = useI18n()

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 text-center sm:px-10 sm:py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-28 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-sky-500/30 blur-3xl" />
          <div className="absolute right-1/4 bottom-0 h-52 w-52 rounded-full bg-indigo-500/25 blur-3xl" />
        </div>
        <div className="relative">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{t('landing.title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
            {t('landing.subtitle')}
          </p>
        </div>
      </section>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {regions.map((r) => (
          <Link
            key={r.code}
            href={`/${r.code}/`}
            className="group flex flex-col gap-3 rounded-2xl bg-white p-6 ring-1 ring-slate-900/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 dark:bg-slate-900 dark:ring-white/10 dark:hover:shadow-black/40"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-sm font-bold text-white">
                {r.code.slice(0, 2).toUpperCase()}
              </span>
              {r.code === defaultRegion && <Badge tone="emerald">{t('landing.default')}</Badge>}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-400">
                {regionLabel(t, r)}
              </h2>
              <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{r.code}</p>
            </div>
            <div className="mt-auto flex items-center justify-between pt-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                {t('source.toolCount')}: {toolCounts[r.code] ?? 0}
              </span>
              <span className="font-medium text-sky-600 dark:text-sky-400">{t('landing.browse')} →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
