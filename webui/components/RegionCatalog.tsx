'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { regionLabel } from '@/lib/i18n'
import type { RegionMeta } from '@/lib/regions'
import { categoryKey, type RegistryIndex, type ToolView } from '@/lib/tool-view'
import { Badge } from './Badge'
import { SourceUrlCard } from './SourceUrlCard'
import { ToolCard } from './ToolCard'
import { useI18n } from './providers'

interface RegionCatalogProps {
  region: RegionMeta
  index: RegistryIndex
  tools: ToolView[]
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition',
        active
          ? 'bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900 dark:ring-white'
          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800'
      )}
    >
      {children}
    </button>
  )
}

/** 地区首页：软件源信息 + 搜索/分类 + 工具网格 */
export function RegionCatalog({ region, index, tools }: RegionCatalogProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const categories = useMemo(
    () => [...new Set(tools.map((x) => x.category).filter((c): c is string => Boolean(c)))],
    [tools]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tools.filter((x) => {
      if (category && x.category !== category) return false
      if (!q) return true
      return `${x.name} ${x.id} ${x.description ?? ''}`.toLowerCase().includes(q)
    })
  }, [tools, query, category])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {regionLabel(t, region)}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('site.tagline')}</p>
        </div>
        <Badge tone="sky" className="px-2 py-1">
          {region.code}
        </Badge>
      </div>

      <div className="mt-8">
        <SourceUrlCard region={region.code} index={index} />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('catalog.search')}
            className="h-10 w-full rounded-xl bg-white pr-3 pl-9 text-sm text-slate-900 ring-1 ring-slate-200 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={!category} onClick={() => setCategory(null)}>
            {t('catalog.all')}
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {t(categoryKey(c) ?? c)}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
        {t('catalog.tools')}: {filtered.length}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white py-16 text-center text-sm text-slate-400 ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10">
          {t('catalog.empty')}
        </p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => (
            <ToolCard key={tool.id} region={region.code} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}
