// 工具详情：版本管理（多发行商分组）
import { useCallback, useEffect, useState } from 'react'
import type { ToolDetail } from '../../../preload/api-types'
import type { ToolSummary, VersionInfo } from '@shared/registry-types'
import type { TaskSnapshot } from '@shared/task-types'
import { useAppStore } from '../stores/app'
import { useRegistryStore } from '../stores/registry'
import { Badge, Button, EmptyState, Modal, PageHeader, Spinner, ToolAvatar, formatVersionLabel } from '../components/common'

interface VersionGroup {
  dist?: string
  name: string
  defaultVersion?: string
  items: VersionInfo[]
}

/** 用工具箱快照快速构造详情视图（含名称/版本/安装状态，不含健康检测等异步数据） */
function summaryToDetail(t: ToolSummary): ToolDetail {
  const dists = new Map<string, { id: string; name: string }>()
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
  const summary = useRegistryStore((s) => s.snapshot?.tools.find((t) => t.id === toolId))
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
  const view = detail ?? (summary ? summaryToDetail(summary) : null)

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
        <EmptyState title="工具不存在或已被移除" />
        <div className="text-center">
          <Button variant="secondary" onClick={() => navigate('tools')}>
            返回工具箱
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
          defaultVersion: d.defaultVersion,
          items: view.versions.filter((v) => v.dist === d.id)
        }))
      : [{ name: '', items: view.versions }]

  // 安装弹窗：目标版本的可选下载源（首个为官方源，其余为具名镜像源）
  const installVersion = installTarget ? view.versions.find((x) => x.key === installTarget) : null
  const installSources = installVersion?.sources ?? []

  return (
    <div className="p-8">
      <button
        onClick={() => navigate('tools')}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        返回工具箱
      </button>

      <PageHeader
        title={view.name}
        subtitle={view.description}
      />

      {/* 头部信息 */}
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <ToolAvatar toolId={view.id} icon={view.icon} className="h-12 w-12 text-xl" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {view.activeVersion && <Badge tone="green">已激活 {formatVersionLabel(view.activeVersion, view.versions)}</Badge>}
            {view.envApplied && <Badge tone="blue">环境变量已应用</Badge>}
            {view.health && <Badge tone={view.health.startsWith('✓') ? 'green' : 'red'}>{view.health}</Badge>}
            {!detail && view.activeVersion && (
              <Badge tone="zinc">
                <Spinner className="h-3 w-3" /> 健康检查中…
              </Badge>
            )}
            {view.platformKey && <Badge tone="zinc">{view.platformKey}</Badge>}
            {view.distributions.length > 0 && <Badge tone="brand">{view.distributions.length} 个发行商</Badge>}
            {view.homepage && (
              <a
                href={view.homepage}
                onClick={(e) => e.preventDefault()}
                className="text-xs text-brand-600 hover:underline dark:text-brand-400"
                title={view.homepage}
              >
                官网
              </a>
            )}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            已安装 {view.installedVersions.length} 个版本
            {view.defaultVersion ? ` · 默认 ${formatVersionLabel(view.defaultVersion, view.versions)}` : ''}
          </div>
        </div>
      </div>

      {/* 版本列表（按发行商分组） */}
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">版本</h2>
      {view.versions.length === 0 ? (
        <EmptyState title="当前平台暂无可用版本" />
      ) : (
        groups.map((g) => (
          <section key={g.dist ?? '_'} className="mb-6">
            {g.name && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{g.name}</span>
                {g.defaultVersion && <span className="text-xs text-zinc-400">默认 {g.defaultVersion}</span>}
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <th className="px-4 py-2.5 font-medium">版本</th>
                    <th className="px-4 py-2.5 text-right font-medium">操作</th>
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
                              <Badge tone="green">当前激活</Badge>
                            ) : installed ? (
                              <Badge tone="blue">已安装</Badge>
                            ) : !v.available ? (
                              <Badge tone="zinc">不可用</Badge>
                            ) : (
                              <span className="text-xs text-zinc-400">未安装</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
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
                                安装
                              </Button>
                            )}
                            {installed && !isActive && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => setActivateTarget(v.key)}
                              >
                                激活
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
                                    `${formatVersionLabel(v.key, view.versions)} 已取消激活（保留安装文件）`
                                  )
                                }
                              >
                                取消激活
                              </Button>
                            )}
                            {installed && (
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() => setUninstallVersion(v.key)}
                              >
                                卸载
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
        title={`安装 ${view.name} ${installTarget ? formatVersionLabel(installTarget, view.versions) : ''}`}
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">下载源</div>
            <div className="space-y-2">
              <button
                onClick={() => setInstallSourceUrl('')}
                className={`w-full rounded-lg border px-4 py-2 text-left text-sm transition-colors ${
                  installSourceUrl === ''
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                }`}
              >
                自动（跟随镜像策略设置）
              </button>
              {installSources.map((s, i) => (
                <button
                  key={s.url}
                  onClick={() => setInstallSourceUrl(s.url)}
                  className={`w-full rounded-lg border px-4 py-2 text-left text-sm transition-colors ${
                    installSourceUrl === s.url
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                      : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  {s.name}
                  {i === 0 ? '（官方）' : ''}
                </button>
              ))}
            </div>
          </div>
          <p className="truncate text-xs text-zinc-400" title={installSourceUrl || undefined}>
            {installSourceUrl || '按设置的镜像策略自动排序，失败时自动回退其余源'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInstallTarget(null)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const v = installTarget
                const src = installSourceUrl
                setInstallTarget(null)
                if (v) void action(() => window.api.installTool(view.id, v, src || undefined), `${formatVersionLabel(v, view.versions)} 已加入安装队列`)
              }}
            >
              开始安装
            </Button>
          </div>
        </div>
      </Modal>

      {/* 卸载确认 */}
      <Modal
        open={uninstallVersion !== null}
        onClose={() => setUninstallVersion(null)}
        title={`卸载 ${view.name} ${uninstallVersion ? formatVersionLabel(uninstallVersion, view.versions) : ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {uninstallVersion === view.activeVersion
              ? '该版本当前处于激活状态，卸载将同时清理其环境变量与 PATH 条目。'
              : '将从磁盘中删除该版本目录。此操作不可撤销。'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUninstallVersion(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const v = uninstallVersion
                setUninstallVersion(null)
                if (v) void action(() => window.api.uninstallTool(view.id, v), `${formatVersionLabel(v, view.versions)} 卸载任务已入队`)
              }}
            >
              确认卸载
            </Button>
          </div>
        </div>
      </Modal>

      {/* 激活：动态指定环境变量写入作用域 */}
      <Modal
        open={activateTarget !== null}
        onClose={() => setActivateTarget(null)}
        title={`激活 ${view.name} ${activateTarget ? formatVersionLabel(activateTarget, view.versions) : ''}`}
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">环境变量写入作用域</div>
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
                  {s === 'user' ? '当前用户' : '系统级'}
                </button>
              ))}
            </div>
          </div>
          {activateScope === 'system' && (
            <p className="text-xs text-amber-600 dark:text-amber-400">系统级写入需要管理员权限，将弹出 UAC 授权确认。</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setActivateTarget(null)}>
              取消
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
                    `正在按${scope === 'user' ? '当前用户' : '系统级'}作用域激活 ${formatVersionLabel(v, view.versions)}`
                  )
                }
              }}
            >
              确认激活
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
