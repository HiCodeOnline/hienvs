// 工具卡片
import type { ToolSummary } from '@shared/registry-types'
import { Badge, ToolAvatar, formatVersionLabel } from '../common'

const CATEGORY_LABEL: Record<string, string> = {
  language: '语言',
  'build-tool': '构建工具',
  runtime: '运行时',
  sdk: 'SDK',
  vcs: '版本控制'
}

export function ToolCard({
  tool,
  onOpen
}: {
  tool: ToolSummary
  onOpen: () => void
}) {
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
                <Badge tone="blue">{CATEGORY_LABEL[tool.category] ?? tool.category}</Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-zinc-400">{tool.versions.length} 个可用版本</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!tool.activeVersion && tool.installedVersions.length > 0 && (
            <Badge tone="amber">已安装 {tool.installedVersions.length} 个</Badge>
          )}
          {!tool.available && <Badge tone="red">当前平台不可用</Badge>}
          {tool.healthy === false && <Badge tone="red">健康检查未通过</Badge>}
        </div>
      </div>

      {tool.description && (
        <p className="mt-3 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{tool.description}</p>
      )}

      {tool.activeVersion && (
        <div className="mt-4">
          <Badge tone="green">已激活 {formatVersionLabel(tool.activeVersion, tool.versions)}</Badge>
        </div>
      )}
    </div>
  )
}
