// 工具卡片
import type { MouseEvent } from 'react'
import type { ToolSummary } from '@shared/registry-types'
import { useAppStore } from '../../stores/app'
import { useI18n } from '../../stores/i18n'
import { Badge, ToolAvatar, formatVersionLabel } from '../common'

/** 分类 -> 文案键（源未提供分类名时的内置回退） */
const CATEGORY_LABEL: Record<string, string> = {
  language: 'category.language',
  'build-tool': 'category.buildTool',
  runtime: 'category.runtime',
  sdk: 'category.sdk',
  vcs: 'category.vcs'
}

export function ToolCard({
  tool,
  onOpen,
  showOpen = false,
  categoryName
}: {
  tool: ToolSummary
  onOpen: () => void
  /** 仪表盘展示：激活版本配置了 launch 入口时显示「打开」按钮 */
  showOpen?: boolean
  /** 工具箱传入的源配置分类名；未传时回退内置分类文案或原始编码 */
  categoryName?: string
}) {
  const t = useI18n()
  const pushToast = useAppStore((s) => s.pushToast)

  function openApp(e: MouseEvent) {
    e.stopPropagation()
    window.api.launchTool(tool.id).catch((err) => pushToast('error', err instanceof Error ? err.message : String(err)))
  }
  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <ToolAvatar toolId={tool.id} icon={tool.icon} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{tool.name}</span>
              {tool.category && (
                <Badge tone="blue">
                  {categoryName ?? (CATEGORY_LABEL[tool.category] ? t(CATEGORY_LABEL[tool.category]) : tool.category)}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-zinc-400">{t('toolCard.versionsCount', { count: tool.versions.length })}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!tool.activeVersion && tool.installedVersions.length > 0 && (
            <Badge tone="amber">{t('toolCard.installedCount', { count: tool.installedVersions.length })}</Badge>
          )}
          {!tool.available && <Badge tone="red">{t('toolCard.platformUnavailable')}</Badge>}
          {tool.healthy === false && <Badge tone="red">{t('toolCard.healthFailed')}</Badge>}
        </div>
      </div>

      {tool.description && (
        <p className="mt-3 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{tool.description}</p>
      )}

      {tool.activeVersion && (
        <div className="mt-4 flex items-center gap-2">
          <Badge tone="green">
            {t('toolCard.active', { version: formatVersionLabel(tool.activeVersion, tool.versions) })}
          </Badge>
          {showOpen && tool.launch && (
            <button
              onClick={openApp}
              title={t('toolCard.open')}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-600 ring-1 ring-sky-200 transition hover:bg-sky-50 dark:text-sky-400 dark:ring-sky-500/30 dark:hover:bg-sky-500/10"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5m0-5l-8.5 8.5M19 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h4" />
              </svg>
              {t('toolCard.open')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
