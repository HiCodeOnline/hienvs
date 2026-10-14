// 仪表盘：仅展示已激活工具
import { useAppStore } from '../stores/app'
import { useRegistryStore } from '../stores/registry'
import { EmptyState, PageHeader, Spinner } from '../components/common'
import { ToolCard } from '../components/tool/ToolCard'

export function DashboardPage() {
  const navigate = useAppStore((s) => s.navigate)
  const { snapshot, loading } = useRegistryStore()

  const activeTools = (snapshot?.tools ?? []).filter((t) => t.activeVersion)

  return (
    <div className="p-8">
      <PageHeader title="仪表盘" subtitle="管理你的开发工具链" />

      {loading && activeTools.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> 加载注册表…
        </div>
      ) : activeTools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <EmptyState title="还没有激活任何工具" hint="前往工具箱安装并激活 Java、Go 等工具" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {activeTools.map((t) => (
            <ToolCard key={t.id} tool={t} onOpen={() => navigate('tool-detail', t.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
