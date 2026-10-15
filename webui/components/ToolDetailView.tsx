'use client'

import Link from 'next/link'
import { categoryKey, type ToolView } from '@/lib/tool-view'
import type { RegionMeta } from '@/lib/regions'
import { Badge } from './Badge'
import { ToolAvatar } from './ToolAvatar'
import { VersionTable } from './VersionTable'
import { useI18n } from './providers'

interface ToolDetailViewProps {
  region: RegionMeta
  tool: ToolView
}

/** 工具详情：头部信息 + 发行商/版本/平台/下载源 */
export function ToolDetailView({ region, tool }: ToolDetailViewProps) {
  const { t } = useI18n()
  const rawUrl = `/${region.code}/${tool.manifestPath}`

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href={`/${region.code}/`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
        </svg>
        {t('tool.back')}
      </Link>

      <section className="mt-5 rounded-2xl bg-white p-6 ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10">
        <div className="flex flex-wrap items-start gap-4">
          <ToolAvatar name={tool.name} icon={tool.icon} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                {tool.name}
              </h1>
              {tool.category && <Badge tone="sky">{t(categoryKey(tool.category) ?? tool.category)}</Badge>}
            </div>
            <p className="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">{tool.id}</p>
            {tool.description && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {tool.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {tool.homepage && (
                <a
                  href={tool.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                >
                  {t('toolDetail.homepage')} ↗
                </a>
              )}
              <a
                href={rawUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
              >
                {t('tool.raw')} ↗
              </a>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500">{t('tool.platforms')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tool.platforms.map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-8">
        <VersionTable distributions={tool.distributions} />
      </div>
    </div>
  )
}
