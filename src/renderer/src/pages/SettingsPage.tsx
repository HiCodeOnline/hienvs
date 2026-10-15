// 设置页：语言 / 数据目录 / 软件源 / 镜像策略 / 并发 / 代理
import { useEffect, useState, type ReactNode } from 'react'
import type { AppSettings, DiskUsage } from '@shared/tool-types'
import type { RegistrySource } from '@shared/registry-types'
import { LANGUAGES, type LanguagePreference } from '@shared/i18n'
import { useAppStore } from '../stores/app'
import { useSettingsStore } from '../stores/settings'
import { useI18n, useI18nStore } from '../stores/i18n'
import { Badge, Button, Modal, Spinner, formatBytes } from '../components/common'

/** 目录所在磁盘的空间占用进度条（修改目录选择后即时刷新） */
function DirUsage({ dir }: { dir: string }) {
  const t = useI18n()
  const [usage, setUsage] = useState<DiskUsage | null>(null)

  useEffect(() => {
    if (!dir) {
      setUsage(null)
      return
    }
    let alive = true
    window.api
      .diskUsage(dir)
      .then((u) => {
        if (alive) setUsage(u)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [dir])

  if (!usage || usage.total <= 0) return null
  const used = usage.total - usage.free
  const pct = Math.min(100, (used / usage.total) * 100)
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-500"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        {t('settings.diskUsage', { used: formatBytes(used), total: formatBytes(usage.total), pct: Math.round(pct) })}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const pushToast = useAppStore((s) => s.pushToast)
  const { settings, load, update } = useSettingsStore()
  const t = useI18n()
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [newSource, setNewSource] = useState<{ type: 'remote' | 'local'; name: string; location: string }>({
    type: 'remote',
    name: '',
    location: ''
  })
  const [addingSource, setAddingSource] = useState(false)
  const [removingSource, setRemovingSource] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (settings && !draft) setDraft(structuredClone(settings))
  }, [settings, draft])

  if (!draft) {
    return (
      <div className="flex items-center justify-center p-20">
        <Spinner className="h-6 w-6 text-brand-500" />
      </div>
    )
  }

  function patch(p: Partial<AppSettings>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  // 语言选择即时生效（预览），随保存一并持久化
  function pickLanguage(value: LanguagePreference) {
    patch({ language: value })
    useI18nStore.getState().setPreference(value)
  }

  function patchSource(idx: number, p: Partial<RegistrySource>) {
    setDraft((d) => {
      if (!d) return d
      const registries = d.registries.map((r, i) => (i === idx ? { ...r, ...p } : r))
      return { ...d, registries }
    })
  }

  // 删除源：与添加一致，立即保存应用并触发清单重载，工具箱 tab 随快照更新同步移除
  async function removeSource(idx: number) {
    if (!draft || removingSource) return
    setRemovingSource(true)
    try {
      const next = { ...draft, registries: draft.registries.filter((_, i) => i !== idx) }
      setDraft(next)
      await update(next)
      pushToast('success', t('toast.sourceRemoved'))
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setRemovingSource(false)
    }
  }

  // 自动更新开关：离散操作，立即保存应用
  async function toggleAutoUpdate(idx: number, enabled: boolean) {
    if (!draft) return
    const next = { ...draft, registries: draft.registries.map((r, i) => (i === idx ? { ...r, autoUpdate: enabled } : r)) }
    setDraft(next)
    try {
      await update(next)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    }
  }

  // 添加源：先校验有效性（远程可达/本地 index.json 合法），无效不允许添加；
  // 校验通过后立即保存并触发该源初始化（拉取源文件并解析工具信息）
  async function addSource() {
    if (!draft || addingSource) return
    if (!newSource.name.trim() || !newSource.location.trim()) return
    setAddingSource(true)
    try {
      await window.api.registryValidateSource(newSource.type, newSource.location.trim())
      const src: RegistrySource = {
        id: `custom-${Date.now().toString(36)}`,
        type: newSource.type,
        name: newSource.name.trim(),
        location: newSource.location.trim(),
        autoUpdate: newSource.type === 'remote'
      }
      const next = { ...draft, registries: [...draft.registries, src] }
      setDraft(next)
      setNewSource({ type: 'remote', name: '', location: '' })
      await update(next)
      pushToast('success', t('toast.sourceAdded'))
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setAddingSource(false)
    }
  }

  // 手动更新单个远程源：重新拉取远程内容到本地缓存并刷新工具信息与图标
  async function updateSource(id: string) {
    if (updatingId) return
    setUpdatingId(id)
    try {
      await window.api.registryUpdateSource(id)
      pushToast('success', t('toast.sourceUpdated'))
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setUpdatingId(null)
    }
  }

  async function pickDir(key: 'installDir' | 'downloadDir') {
    if (!draft) return
    const picked = await window.api.selectDirectory({
      title: key === 'installDir' ? t('toast.selectInstallDir') : t('toast.selectDownloadDir'),
      defaultPath: draft[key]
    })
    if (picked) patch({ [key]: picked })
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await update(draft)
      pushToast('success', t('toast.settingsSaved'))
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl shrink-0 space-y-6 p-8">
        {/* 语言 */}
        <Section title={t('settings.language')} hint={t('settings.languageHint')}>
          <Field label={t('settings.language')}>
            <select
              value={draft.language}
              onChange={(e) => pickLanguage(e.target.value as LanguagePreference)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="auto">{t('settings.languageAuto')}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        {/* 目录 */}
        <Section title={t('settings.dirs')} hint={t('settings.dirsHint')}>
          <Field label={t('settings.installDir')} hint={t('settings.installDirHint')}>
            <DirPicker value={draft.installDir} onPick={() => pickDir('installDir')} />
            <DirUsage dir={draft.installDir} />
          </Field>
          <Field label={t('settings.downloadDir')} hint={t('settings.downloadDirHint')}>
            <DirPicker value={draft.downloadDir} onPick={() => pickDir('downloadDir')} />
            <DirUsage dir={draft.downloadDir} />
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.api.openPath('installDir')}>
              {t('settings.openInstallDir')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.api.openPath('downloads')}>
              {t('settings.openDownloadDir')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.api.openPath('logs')}>
              {t('settings.openLogs')}
            </Button>
          </div>
        </Section>

        {/* 软件源 */}
        <Section title={t('settings.sources')} hint={t('settings.sourcesHint')}>
          <div className="space-y-2">
            {draft.registries.map((r, i) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <Badge tone={r.type === 'remote' ? 'blue' : 'amber'}>
                  {r.type === 'remote' ? t('common.remote') : t('common.local')}
                </Badge>
                <input
                  value={r.name}
                  onChange={(e) => patchSource(i, { name: e.target.value })}
                  className="w-32 rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
                />
                <input
                  value={r.location ?? ''}
                  onChange={(e) => patchSource(i, { location: e.target.value })}
                  placeholder={r.type === 'remote' ? 'https://…' : 'D:\\path\\to\\registry'}
                  className="min-w-[180px] flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1 font-mono text-xs dark:border-zinc-700"
                />
                {r.type === 'remote' && (
                  <label
                    className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
                    title={t('settings.autoUpdateHint')}
                  >
                    <input
                      type="checkbox"
                      checked={r.autoUpdate ?? false}
                      onChange={(e) => void toggleAutoUpdate(i, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 accent-brand-600"
                    />
                    {t('common.autoUpdate')}
                  </label>
                )}
                {r.type === 'remote' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={updatingId !== null}
                    onClick={() => void updateSource(r.id)}
                  >
                    {updatingId === r.id ? <Spinner className="h-3.5 w-3.5" /> : null}
                    {t('common.update')}
                  </Button>
                )}
                <button
                  onClick={() => void removeSource(i)}
                  disabled={removingSource}
                  className="rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* 添加源 */}
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
            <select
              value={newSource.type}
              onChange={(e) => setNewSource((s) => ({ ...s, type: e.target.value as 'remote' | 'local' }))}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="remote">{t('common.remote')}</option>
              <option value="local">{t('common.local')}</option>
            </select>
            <input
              value={newSource.name}
              onChange={(e) => setNewSource((s) => ({ ...s, name: e.target.value }))}
              placeholder={t('settings.namePlaceholder')}
              className="w-28 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
            />
            <input
              value={newSource.location}
              onChange={(e) => setNewSource((s) => ({ ...s, location: e.target.value }))}
              placeholder={newSource.type === 'remote' ? t('settings.urlPlaceholder') : t('settings.folderPlaceholder')}
              className="flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 font-mono text-xs dark:border-zinc-700"
            />
            <Button variant="secondary" size="sm" onClick={() => void addSource()} disabled={addingSource}>
              {addingSource ? <Spinner className="h-3.5 w-3.5" /> : null}
              {t('common.add')}
            </Button>
          </div>
        </Section>

        {/* 下载 */}
        <Section title={t('settings.download')}>
          <Field label={t('settings.proxy')} hint={t('settings.proxyHint')}>
            <input
              value={draft.proxy ?? ''}
              onChange={(e) => {
                const proxy = e.target.value || undefined
                // 代理清空时同步清空认证信息
                patch(
                  proxy
                    ? { proxy }
                    : { proxy, proxyUsername: undefined, proxyPassword: undefined }
                )
              }}
              placeholder="http://…"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
            />
          </Field>
          {draft.proxy && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('settings.proxyUsername')} hint={t('settings.proxyAuthHint')}>
                <input
                  value={draft.proxyUsername ?? ''}
                  onChange={(e) => patch({ proxyUsername: e.target.value || undefined })}
                  placeholder="user"
                  autoComplete="off"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
                />
              </Field>
              <Field label={t('settings.proxyPassword')} hint={t('settings.proxyAuthHint')}>
                <input
                  type="password"
                  value={draft.proxyPassword ?? ''}
                  onChange={(e) => patch({ proxyPassword: e.target.value || undefined })}
                  placeholder="••••••"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
                />
              </Field>
            </div>
          )}
          <Field label={t('settings.concurrency')} hint={t('settings.concurrencyHint')}>
            <input
              type="number"
              min={1}
              max={8}
              value={draft.taskConcurrency}
              onChange={(e) => patch({ taskConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 2)) })}
              className="w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </Field>
        </Section>
      </div>

      {/* 底部固定操作栏：滚动到任意位置都能点击保存 */}
      <div className="sticky bottom-0 mt-auto shrink-0 border-t border-zinc-200 bg-zinc-50 px-8 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-2xl justify-end gap-2">
          <Button variant="danger" onClick={() => setResetOpen(true)}>
            {t('settings.resetApp')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner className="h-3.5 w-3.5" /> : null}
            {t('settings.saveSettings')}
          </Button>
        </div>
      </div>

      {/* 重置应用：高危操作二次确认 */}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title={t('settings.resetAppTitle')}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
            <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-red-500" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-sm text-red-700 dark:text-red-300">{t('settings.resetAppBody')}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setResetOpen(false)
                void window.api.resetApp().catch((err) => pushToast('error', err instanceof Error ? err.message : String(err)))
              }}
            >
              {t('settings.resetAppConfirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-xs text-zinc-400">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  )
}

function DirPicker({ value, onPick }: { value: string; onPick: () => void }) {
  const t = useI18n()
  return (
    <div className="flex gap-2">
      <input
        value={value}
        readOnly
        title={value}
        className="w-full flex-1 cursor-default rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
      />
      <Button variant="secondary" size="sm" onClick={onPick}>
        {t('common.selectFolder')}
      </Button>
    </div>
  )
}
