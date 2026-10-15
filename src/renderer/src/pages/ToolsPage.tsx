// 工具箱：源下拉切换 + GitHub 风格分类 tab 过滤 + 搜索 + 刷新软件源（同时增量同步图标）
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../stores/app'
import { useRegistryStore } from '../stores/registry'
import { useI18n } from '../stores/i18n'
import { Button, EmptyState, Spinner } from '../components/common'
import { ToolCard } from '../components/tool/ToolCard'

/** 分类过滤 tab 的公共样式（GitHub code/issue 切换风格） */
const TAB_BASE =
  'relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5'

export function ToolsPage() {
  const navigate = useAppStore((s) => s.navigate)
  const pushToast = useAppStore((s) => s.pushToast)
  const { snapshot, loading } = useRegistryStore()
  const t = useI18n()
  const [keyword, setKeyword] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const sources = useMemo(() => snapshot?.sources ?? [], [snapshot])
  const current = sources.find((s) => s.id === activeId()) ?? null

  function activeId(): string | null {
    if (activeSource && sources.some((s) => s.id === activeSource)) return activeSource
    return sources[0]?.id ?? null
  }

  // 源列表变化（新增/删除/重载）时回落到第一个可用源，并重置分类过滤
  const resolvedId = activeId()
  useEffect(() => {
    if (resolvedId && resolvedId !== activeSource) {
      setActiveSource(resolvedId)
      setActiveCategory('all')
    } else if (!resolvedId && activeSource !== null) {
      setActiveSource(null)
    }
  }, [resolvedId, activeSource])

  const sourceTools = useMemo(
    () => (snapshot?.tools ?? []).filter((tool) => tool.sourceId === resolvedId),
    [snapshot, resolvedId]
  )

  // 按搜索关键词过滤（分类过滤在渲染层叠加，保证计数实时）
  const searched = useMemo(() => {
    if (!keyword.trim()) return sourceTools
    const kw = keyword.trim().toLowerCase()
    return sourceTools.filter(
      (tool) =>
        tool.id.toLowerCase().includes(kw) ||
        tool.name.toLowerCase().includes(kw) ||
        tool.description?.toLowerCase().includes(kw)
    )
  }, [sourceTools, keyword])

  const tools = useMemo(
    () => (activeCategory === 'all' ? searched : searched.filter((tool) => tool.category === activeCategory)),
    [searched, activeCategory]
  )

  // 源配置的分类：tab 计数基于搜索后的结果
  const categories = current?.categories ?? []
  const countOf = (code: string): number => searched.filter((tool) => tool.category === code).length
  const categoryName = (code: string): string => categories.find((c) => c.code === code)?.name ?? code

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

  // 尚未配置任何软件源：引导前往设置
  if (!loading && sources.length === 0) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <EmptyState title={t('tools.noSource')} hint={t('tools.noSourceHint')}>
            <Button onClick={() => navigate('settings')}>{t('settings.configureSources')}</Button>
          </EmptyState>
        </div>
      </div>
    )
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
          {/* 源切换：下拉选择，置于刷新按钮前 */}
          {sources.length > 1 && (
            <select
              value={resolvedId ?? ''}
              onChange={(e) => {
                setActiveSource(e.target.value)
                setActiveCategory('all')
              }}
              title={current?.error ?? current?.name}
              className="max-w-[14rem] rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.status === 'error' ? '!' : s.toolCount}）
                </option>
              ))}
            </select>
          )}
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('tools.refresh')}
          </Button>
        </div>
      </div>

      {/* 分类过滤 tab（GitHub code/issue 切换样式）：仅源配置了分类时展示 */}
      {categories.length > 0 && (
        <div className="mb-5 border-b border-zinc-200 dark:border-zinc-800">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveCategory('all')}
              className={`${TAB_BASE} ${
                activeCategory === 'all'
                  ? 'border-b-2 border-brand-500 font-medium text-zinc-900 dark:text-zinc-100'
                  : 'border-b-2 border-transparent text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {t('tools.all')}
              <span className="rounded-full bg-zinc-100 px-1.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {searched.length}
              </span>
            </button>
            {categories.map((c) => (
              <button
                key={c.code}
                onClick={() => setActiveCategory(c.code)}
                className={`${TAB_BASE} ${
                  activeCategory === c.code
                    ? 'border-b-2 border-brand-500 font-medium text-zinc-900 dark:text-zinc-100'
                    : 'border-b-2 border-transparent text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {c.name}
                <span className="rounded-full bg-zinc-100 px-1.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {countOf(c.code)}
                </span>
              </button>
            ))}
          </nav>
        </div>
      )}

      {loading && tools.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> {t('tools.loading')}
        </div>
      ) : tools.length === 0 ? (
        <EmptyState
          title={keyword || activeCategory !== 'all' ? t('tools.noMatch') : t('tools.emptyRegistry')}
          hint={keyword || activeCategory !== 'all' ? t('tools.noMatchHint') : t('tools.emptyRegistryHint')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onOpen={() => navigate('tool-detail', tool.id)}
              categoryName={tool.category ? categoryName(tool.category) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
