// 工具箱：工具列表 + 搜索 + 刷新软件源（同时增量同步图标）
import { useMemo, useState } from 'react'
import { useAppStore } from '../stores/app'
import { useRegistryStore } from '../stores/registry'
import { useI18n } from '../stores/i18n'
import { Button, EmptyState, Spinner } from '../components/common'
import { ToolCard } from '../components/tool/ToolCard'

export function ToolsPage() {
  const navigate = useAppStore((s) => s.navigate)
  const pushToast = useAppStore((s) => s.pushToast)
  const { snapshot, loading } = useRegistryStore()
  const t = useI18n()
  const [keyword, setKeyword] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const tools = useMemo(() => {
    const list = snapshot?.tools ?? []
    if (!keyword.trim()) return list
    const kw = keyword.trim().toLowerCase()
    return list.filter(
      (tool) =>
        tool.id.toLowerCase().includes(kw) ||
        tool.name.toLowerCase().includes(kw) ||
        tool.description?.toLowerCase().includes(kw)
    )
  }, [snapshot, keyword])

  async function refresh() {
    setRefreshing(true)
    try {
      await useRegistryStore.getState().refresh()
      pushToast('success', t('tools.refreshed'))
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
          placeholder={t('tools.searchPlaceholder')}
          className="w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <div className="ms-auto flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('tools.refresh')}
          </Button>
        </div>
      </div>

      {loading && tools.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> {t('tools.loading')}
        </div>
      ) : tools.length === 0 ? (
        <EmptyState
          title={keyword ? t('tools.noMatch') : t('tools.emptyRegistry')}
          hint={keyword ? t('tools.noMatchHint') : t('tools.emptyRegistryHint')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} onOpen={() => navigate('tool-detail', tool.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
