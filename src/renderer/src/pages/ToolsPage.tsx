// 工具箱：工具列表 + 搜索 + 刷新软件源（同时增量同步图标）
import { useMemo, useState } from 'react'
import { useAppStore } from '../stores/app'
import { useRegistryStore } from '../stores/registry'
import { Button, EmptyState, Spinner } from '../components/common'
import { ToolCard } from '../components/tool/ToolCard'

export function ToolsPage() {
  const navigate = useAppStore((s) => s.navigate)
  const pushToast = useAppStore((s) => s.pushToast)
  const { snapshot, loading } = useRegistryStore()
  const [keyword, setKeyword] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const tools = useMemo(() => {
    const list = snapshot?.tools ?? []
    if (!keyword.trim()) return list
    const kw = keyword.trim().toLowerCase()
    return list.filter(
      (t) => t.id.toLowerCase().includes(kw) || t.name.toLowerCase().includes(kw) || t.description?.toLowerCase().includes(kw)
    )
  }, [snapshot, keyword])

  async function refresh() {
    setRefreshing(true)
    try {
      await useRegistryStore.getState().refresh()
      pushToast('success', '软件源已刷新')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-5 flex items-center gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索工具…"
          className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Spinner className="h-3.5 w-3.5" /> : null}
            刷新软件源
          </Button>
        </div>
      </div>

      {loading && tools.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> 正在加载…
        </div>
      ) : tools.length === 0 ? (
        <EmptyState title={keyword ? '没有匹配的工具' : '软件源为空'} hint={keyword ? '换个关键词试试' : '检查设置中的软件源配置'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {tools.map((t) => (
            <ToolCard key={t.id} tool={t} onOpen={() => navigate('tool-detail', t.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
