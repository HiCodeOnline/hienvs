// 工具详情：版本管理（多发行商分组）
import { useCallback, useEffect, useState } from 'react'
import type { ToolDetail } from '../../../preload/api-types'
import type { ToolSummary, VersionInfo } from '@shared/registry-types'
import type { TaskSnapshot } from '@shared/task-types'
import { useAppStore } from '../stores/app'
import { useRegistryStore } from '../stores/registry'
import { useI18n } from '../stores/i18n'
import { Badge, Button, EmptyState, Modal, Spinner, ToolAvatar, formatVersionLabel } from '../components/common'

interface VersionGroup {
  dist?: string
  name: string
  homepage?: string
  items: VersionInfo[]
}

/** 官网链接：交给主进程用系统浏览器打开 */
function HomepageLink({ url }: { url: string }) {
  const t = useI18n()
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="text-xs text-brand-600 hover:underline dark:text-brand-400"
    >
      {t('toolDetail.homepage')}
    </a>
  )
}

/** 用工具箱快照快速构造详情视图（含名称/版本/安装状态，不含健康检测等异步数据） */
function summaryToDetail(t: ToolSummary): ToolDetail {
  const dists = new Map<string, { id: string; name: string; homepage?: string }>()
  for (const v of t.versions) {
    if (v.dist && !dists.has(v.dist)) dists.set(v.dist, { id: v.dist, name: v.distName ?? v.dist })
  }
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    homepage: t.homepage,
    icon: t.icon,
    defaultVersion: t.defaultVersion,
    distributions: [...dists.values()],
    versions: t.versions,
    installedVersions: t.installedVersions,
    activeVersion: t.activeVersion,
    envApplied: false,
    health: null,
    platformKey: ''
  }
}

export function ToolDetailPage({ toolId }: { toolId: string }) {
  const navigate = useAppStore((s) => s.navigate)
  const pushToast = useAppStore((s) => s.pushToast)
  const t = useI18n()
  const summary = useRegistryStore((s) => s.snapshot?.tools.find((tool) => tool.id === toolId))
  const [detail, setDetail] = useState<ToolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [uninstallVersion, setUninstallVersion] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 激活时动态指定环境变量写入作用域
  const [activateTarget, setActivateTarget] = useState<string | null>(null)
  const [activateScope, setActivateScope] = useState<'user' | 'system'>('user')
  // 安装时选择下载源（空串表示跟随镜像策略自动排序）
  const [installTarget, setInstallTarget] = useState<string | null>(null)
  const [installSourceUrl, setInstallSourceUrl] = useState('')

  const reload = useCallback(async () => {
    try {
      const d = await window.api.toolDetail(toolId)
      setDetail(d)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [toolId, pushToast])

  useEffect(() => {
    void reload()
  }, [reload])

  // 任务完成时刷新详情（安装/激活/卸载都会改变版本状态）
  useEffect(() => {
    return window.api.onTaskUpdated(({ task }: { task: TaskSnapshot }) => {
      if (task.toolId !== toolId) return
      if (['success', 'failed', 'cancelled'].includes(task.status)) void reload()
    })
  }, [toolId, reload])

  async function action(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      pushToast('success', ok)
      await reload()
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 先用工具箱快照渲染页面，完整详情（健康检测/环境变量等）异步补齐
  // 已安装/激活状态始终以工具箱快照为准：快照在状态变更时由主进程即时推送，
  // 避免详情请求与状态提交竞态导致页面停留在旧状态
  const view =
    detail && summary
      ? { ...detail, installedVersions: summary.installedVersions, activeVersion: summary.activeVersion }
      : (detail ?? (summary ? summaryToDetail(summary) : null))

  if (!view) {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-20">
          <Spinner className="h-6 w-6 text-brand-500" />
        </div>
      )
    }
    return (
      <div className="p-8">
        <EmptyState title={t('toolDetail.notFound')} />
        <div className="text-center">
          <Button variant="secondary" onClick={() => navigate('tools')}>
            {t('toolDetail.back')}
          </Button>
        </div>
      </div>
    )
  }

  // 版本按发行商分组（普通工具为单匿名组）
  const groups: VersionGroup[] =
    view.distributions.length > 0
      ? view.distributions.map((d) => ({
          dist: d.id,
          name: d.name,
          homepage: d.homepage,
          items: view.versions.filter((v) => v.dist === d.id)
        }))
      : [{ name: '', items: view.versions }]
  // 有发行商层级的工具，官网挂到各发行商之后；否则沿用工具自身的官网标签
  const hasDistributions = view.distributions.length > 0

  // 安装弹窗：目标版本的可选下载源（首个为官方源，其余为具名镜像源）
  const installVersion = installTarget ? view.versions.find((x) => x.key === installTarget) : null
  const installSources = installVersion?.sources ?? []

  return (
    <div className="p-8">
      <button
        onClick={() => navigate('tools')}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <svg
          className="h-4 w-4 rtl:-scale-x-100"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('toolDetail.back')}
      </button>

      {/* 头部信息：工具名称置于标签上方 */}
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <ToolAvatar toolId={view.id} icon={view.icon} className="h-12 w-12 text-xl" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{view.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {view.activeVersion && (
              <Badge tone="green">
                {t('toolDetail.active', { version: formatVersionLabel(view.activeVersion, view.versions) })}
              </Badge>
            )}
            {view.envApplied && <Badge tone="blue">{t('toolDetail.envApplied')}</Badge>}
            {view.health && <Badge tone={view.health.startsWith('✓') ? 'green' : 'red'}>{view.health}</Badge>}
            {!detail && view.activeVersion && (
              <Badge tone="zinc">
                <Spinner className="h-3 w-3" /> {t('toolDetail.healthChecking')}
              </Badge>
            )}
            {view.platformKey && <Badge tone="zinc">{view.platformKey}</Badge>}
            {view.distributions.length > 0 && (
              <Badge tone="brand">{t('toolDetail.distCount', { count: view.distributions.length })}</Badge>
            )}
            {view.homepage && !hasDistributions && <HomepageLink url={view.homepage} />}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {t('toolDetail.installedCount', { count: view.installedVersions.length })}
          </div>
        </div>
      </div>

      {/* 版本列表（按发行商分组） */}
      {view.versions.length === 0 ? (
        <EmptyState title={t('toolDetail.noVersions')} />
      ) : (
        groups.map((g) => (
          <section key={g.dist ?? '_'} className="mb-6">
            {g.name && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{g.name}</span>
                {/* 发行商层级的官网紧随发行商名称之后 */}
                {(g.homepage ?? view.homepage) && <HomepageLink url={(g.homepage ?? view.homepage) as string} />}
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-start text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <th className="px-4 py-2.5 text-start font-medium">{t('toolDetail.colVersion')}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t('toolDetail.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                  {g.items.map((v) => {
                    const isActive = v.key === view.activeVersion
                    const installed = view.installedVersions.includes(v.key)
                    return (
                      <tr key={v.key} className={isActive ? 'bg-brand-50/50 dark:bg-brand-900/10' : ''}>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono">{v.version}</span>
                            {isActive ? (
                              <Badge tone="green">{t('toolDetail.currentActive')}</Badge>
                            ) : installed ? (
                              <Badge tone="blue">{t('toolDetail.installed')}</Badge>
                            ) : !v.available ? (
                              <Badge tone="zinc">{t('toolDetail.unavailable')}</Badge>
                            ) : (
                              <span className="text-xs text-zinc-400">{t('toolDetail.notInstalled')}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="flex justify-end gap-2">
                            {!installed && v.available && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setInstallSourceUrl('')
                                  setInstallTarget(v.key)
                                }}
                              >
                                {t('toolDetail.install')}
                              </Button>
                            )}
                            {installed && !isActive && (
                              <Button size="sm" disabled={busy} onClick={() => setActivateTarget(v.key)}>
                                {t('toolDetail.activate')}
                              </Button>
                            )}
                            {isActive && (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  action(
                                    () => window.api.deactivateTool(view.id),
                                    t('toast.deactivated', { version: formatVersionLabel(v.key, view.versions) })
                                  )
                                }
                              >
                                {t('toolDetail.deactivate')}
                              </Button>
                            )}
                            {installed && (
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() => setUninstallVersion(v.key)}
                              >
                                {t('toolDetail.uninstall')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {/* 安装：选择下载源 */}
      <Modal
        open={installTarget !== null}
        onClose={() => setInstallTarget(null)}
        title={t('toolDetail.installTitle', {
          name: view.name,
          version: installTarget ? formatVersionLabel(installTarget, view.versions) : ''
        })}
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('toolDetail.downloadSource')}
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setInstallSourceUrl('')}
                className={`block w-full rounded-lg border px-4 py-2 text-start text-sm transition-colors ${
                  installSourceUrl === ''
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                }`}
              >
                <span>{t('toolDetail.autoSource')}</span>
                <span
                  className={`mt-0.5 block truncate text-xs font-normal ${
                    installSourceUrl === '' ? 'text-brand-600/70 dark:text-brand-300/70' : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {t('toolDetail.autoSourceHint')}
                </span>
              </button>
              {installSources.map((s, i) => (
                <button
                  key={s.url}
                  onClick={() => setInstallSourceUrl(s.url)}
                  className={`block w-full rounded-lg border px-4 py-2 text-start text-sm transition-colors ${
                    installSourceUrl === s.url
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  <span>{i === 0 ? t('toolDetail.officialTag', { name: s.name }) : s.name}</span>
                  <span
                    title={s.url}
                    className={`mt-0.5 block truncate font-mono text-xs font-normal ${
                      installSourceUrl === s.url ? 'text-brand-600/70 dark:text-brand-300/70' : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    {s.url}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInstallTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const v = installTarget
                const src = installSourceUrl
                setInstallTarget(null)
                if (v) {
                  void action(
                    () => window.api.installTool(view.id, v, src || undefined),
                    t('toast.installQueued', { version: formatVersionLabel(v, view.versions) })
                  )
                }
              }}
            >
              {t('toolDetail.startInstall')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 卸载确认 */}
      <Modal
        open={uninstallVersion !== null}
        onClose={() => setUninstallVersion(null)}
        title={t('toolDetail.uninstallTitle', {
          name: view.name,
          version: uninstallVersion ? formatVersionLabel(uninstallVersion, view.versions) : ''
        })}
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {uninstallVersion === view.activeVersion ? t('toolDetail.uninstallActiveWarn') : t('toolDetail.uninstallWarn')}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUninstallVersion(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const v = uninstallVersion
                setUninstallVersion(null)
                if (v) {
                  void action(
                    () => window.api.uninstallTool(view.id, v),
                    t('toast.uninstallQueued', { version: formatVersionLabel(v, view.versions) })
                  )
                }
              }}
            >
              {t('toolDetail.confirmUninstall')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 激活：动态指定环境变量写入作用域 */}
      <Modal
        open={activateTarget !== null}
        onClose={() => setActivateTarget(null)}
        title={t('toolDetail.activateTitle', {
          name: view.name,
          version: activateTarget ? formatVersionLabel(activateTarget, view.versions) : ''
        })}
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('toolDetail.envScope')}</div>
            <div className="flex gap-2">
              {(['user', 'system'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setActivateScope(s)}
                  className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                    activateScope === s
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  {s === 'user' ? t('toolDetail.scopeUser') : t('toolDetail.scopeSystem')}
                </button>
              ))}
            </div>
          </div>
          {activateScope === 'system' && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t('toolDetail.systemScopeWarn')}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setActivateTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const v = activateTarget
                const scope = activateScope
                setActivateTarget(null)
                if (v) {
                  void action(
                    () => window.api.activateTool(view.id, v, scope),
                    t('toast.activating', {
                      scope: scope === 'user' ? t('toolDetail.scopeUser') : t('toolDetail.scopeSystem'),
                      version: formatVersionLabel(v, view.versions)
                    })
                  )
                }
              }}
            >
              {t('toolDetail.confirmActivate')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
