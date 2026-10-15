'use client'

import { useEffect, useState } from 'react'
import type { RegistryIndex } from '@/lib/tool-view'
import { CopyButton } from './CopyButton'
import { useI18n } from './providers'

interface SourceUrlCardProps {
  region: string
  index: RegistryIndex
}

/** 展示该地区软件源的元信息与可直接填入客户端的远程源地址 */
export function SourceUrlCard({ region, index }: SourceUrlCardProps) {
  const { t } = useI18n()
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const sourceUrl = `${origin}/${region}/index.json`
  const rawUrl = `/${region}/index.json`

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('source.title')}</h2>
        <a
          href={rawUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
        >
          {t('source.raw')} ↗
        </a>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-400 dark:text-slate-500">{t('source.name')}</dt>
          <dd className="mt-0.5 truncate font-medium text-slate-800 dark:text-slate-200" title={index.name}>
            {index.name}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400 dark:text-slate-500">{t('source.schemaVersion')}</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{index.schemaVersion}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400 dark:text-slate-500">{t('source.toolCount')}</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{index.tools.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400 dark:text-slate-500">{t('source.updatedAt')}</dt>
          <dd className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200">
            {index.updatedAt ? index.updatedAt.slice(0, 10) : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <p className="text-xs text-slate-400 dark:text-slate-500">{t('source.clientUrl')}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-slate-700">
            {sourceUrl}
          </code>
          <CopyButton value={sourceUrl} className="shrink-0 px-3 py-2 text-xs" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400 dark:text-slate-500">{t('source.usage')}</p>
      </div>
    </section>
  )
}
