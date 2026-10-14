// 工具卡片
import type { ToolSummary } from '@shared/registry-types'
import { useI18n } from '../../stores/i18n'
import { Badge, ToolAvatar, formatVersionLabel } from '../common'

/** 分类 -> 文案键 */
const CATEGORY_LABEL: Record<string, string> = {
  language: 'category.language',
  'build-tool': 'category.buildTool',
  runtime: 'category.runtime',
  sdk: 'category.sdk',
  vcs: 'category.vcs'
}

export function ToolCard({
  tool,
  onOpen
}: {
  tool: ToolSummary
  onOpen: () => void
}) {
  const t = useI18n()
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
                <Badge tone="blue">{CATEGORY_LABEL[tool.category] ? t(CATEGORY_LABEL[tool.category]) : tool.category}</Badge>
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
        <div className="mt-4">
          <Badge tone="green">
            {t('toolCard.active', { version: formatVersionLabel(tool.activeVersion, tool.versions) })}
          </Badge>
        </div>
      )}
    </div>
  )
}
