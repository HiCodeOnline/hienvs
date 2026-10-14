// 工具箱：工具列表 + 搜索 + 刷新注册表
import { useMemo, useState } from 'react'
import { useAppStore } from '../stores/app'
import { useRegistryStore } from '../stores/registry'
import { Button, EmptyState, PageHeader, Spinner } from '../components/common'
import { ToolCard } from '../components/tool/ToolCard'

export function ToolsPage() {
  const navigate = useAppStore((s) => s.navigate)
  const pushToast = useAppStore((s) => s.pushToast)
  const { snapshot, loading } = useRegistryStore()
  const [keyword, setKeyword] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingIcons, setRefreshingIcons] = useState(false)

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
      pushToast('success', '注册表已刷新')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }

  async function refreshIcons() {
    setRefreshingIcons(true)
    try {
      await useRegistryStore.getState().refreshIcons()
      pushToast('success', '图标已刷新')
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshingIcons(false)
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="工具箱"
        subtitle={snapshot ? `共 ${snapshot.tools.length} 个工具 · ${snapshot.sources.length} 个清单源` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={refreshIcons} disabled={refreshingIcons}>
              {refreshingIcons ? <Spinner className="h-3.5 w-3.5" /> : null}
              刷新图标
            </Button>
            <Button variant="secondary" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Spinner className="h-3.5 w-3.5" /> : null}
              刷新注册表
            </Button>
          </>
        }
      />

      <div className="mb-5">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索工具…"
          className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {loading && tools.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> 正在加载…
        </div>
      ) : tools.length === 0 ? (
        <EmptyState title={keyword ? '没有匹配的工具' : '注册表为空'} hint={keyword ? '换个关键词试试' : '检查设置中的清单源配置'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {tools.map((t) => (
            <ToolCard key={t.id} tool={t} onOpen={() => navigate('tool-detail', t.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
