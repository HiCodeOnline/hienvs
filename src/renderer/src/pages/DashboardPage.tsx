// 仪表盘：仅展示已激活工具
import { useAppStore } from '../stores/app'
import { useRegistryStore } from '../stores/registry'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../stores/i18n'
import { Button, EmptyState, Spinner } from '../components/common'
import { ToolCard } from '../components/tool/ToolCard'

export function DashboardPage() {
  const navigate = useAppStore((s) => s.navigate)
  const { snapshot, loading } = useRegistryStore()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)
  const t = useI18n()

  const activeTools = (snapshot?.tools ?? []).filter((tool) => tool.activeVersion)
  const hasSources = (snapshot?.sources ?? []).length > 0
  const showNotice = settings !== null && !settings.securityNoticeDismissed

  return (
    <div className="p-8">
      {showNotice && (
        <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.6 13.16A1.5 1.5 0 004.04 19.4h15.92a1.5 1.5 0 001.3-2.3L13.66 3.94a1.5 1.5 0 00-2.6 0z"
            />
          </svg>
          <span className="flex-1">{t('dashboard.notice')}</span>
          <button
            onClick={() => void updateSettings({ securityNoticeDismissed: true })}
            title={t('dashboard.noticeDismiss')}
            className="shrink-0 rounded-md p-0.5 text-amber-700/70 transition-colors hover:bg-amber-100 hover:text-amber-900 dark:text-amber-400/70 dark:hover:bg-amber-900/40 dark:hover:text-amber-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {loading && activeTools.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> {t('dashboard.loading')}
        </div>
      ) : !hasSources ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <EmptyState title={t('tools.noSource')} hint={t('tools.noSourceHint')}>
            <Button onClick={() => navigate('settings')}>{t('settings.configureSources')}</Button>
          </EmptyState>
        </div>
      ) : activeTools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <EmptyState title={t('dashboard.emptyTitle')} hint={t('dashboard.emptyHint')} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {activeTools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} onOpen={() => navigate('tool-detail', tool.id)} showOpen />
          ))}
        </div>
      )}
    </div>
  )
}
