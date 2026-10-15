'use client'

import Link from 'next/link'
import { categoryKey, type ToolView } from '@/lib/tool-view'
import { Badge } from './Badge'
import { ToolAvatar } from './ToolAvatar'
import { useI18n } from './providers'

interface ToolCardProps {
  region: string
  tool: Pick<ToolView, 'id' | 'name' | 'description' | 'category' | 'icon' | 'platforms' | 'versionCount'>
}

export function ToolCard({ region, tool }: ToolCardProps) {
  const { t } = useI18n()

  return (
    <Link
      href={`/${region}/tool/${tool.id}/`}
      className="group flex flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-900/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 dark:bg-slate-900 dark:ring-white/10 dark:hover:shadow-black/40"
    >
      <div className="flex items-start gap-3">
        <ToolAvatar name={tool.name} icon={tool.icon} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900 group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-400">
            {tool.name}
          </h3>
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">{tool.id}</p>
        </div>
        {tool.category && (
          <Badge tone="sky">{t(categoryKey(tool.category) ?? tool.category)}</Badge>
        )}
      </div>

      {tool.description && (
        <p className="line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {tool.description}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-1">
          {tool.platforms.slice(0, 3).map((p) => (
            <Badge key={p}>{p}</Badge>
          ))}
          {tool.platforms.length > 3 && <Badge>+{tool.platforms.length - 3}</Badge>}
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {t('catalog.versions', { count: tool.versionCount })}
        </span>
      </div>
    </Link>
  )
}
