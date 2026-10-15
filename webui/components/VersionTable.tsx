'use client'

import { cn } from '@/lib/cn'
import { formatBytes, type DistributionView } from '@/lib/tool-view'
import { Badge } from './Badge'
import { useI18n } from './providers'

const TH = 'px-4 py-2.5 text-xs font-medium uppercase tracking-wide'

function HostLink({ url }: { url: string }) {
  let host = url
  try {
    host = new URL(url).host
  } catch {
    // 保留原字符串
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
    >
      {host} ↗
    </a>
  )
}

/** 版本表格：按发行商分组展示版本、平台、体积与下载源 */
export function VersionTable({ distributions }: { distributions: DistributionView[] }) {
  const { t } = useI18n()

  return (
    <div className="space-y-8">
      {distributions.map((dist, index) => {
        const hasSha = dist.versions.some((v) => v.platformRows.some((p) => p.sha256))
        return (
          <section key={dist.id ?? `direct-${index}`} className="space-y-3">
            {dist.id && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{dist.name}</h3>
                {dist.homepage && <HostLink url={dist.homepage} />}
                {dist.description && (
                  <p className="w-full text-sm text-slate-500 dark:text-slate-400">{dist.description}</p>
                )}
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-900/5 dark:ring-white/10">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className={`${TH} text-start`}>{t('tool.colVersion')}</th>
                    <th className={`${TH} text-start`}>{t('tool.colPlatforms')}</th>
                    <th className={`${TH} text-start`}>{t('tool.colSize')}</th>
                    <th className={`${TH} text-end`}>{t('tool.colSources')}</th>
                    {hasSha && <th className={`${TH} text-start`}>{t('tool.sha256')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dist.versions.length === 0 && (
                    <tr>
                      <td colSpan={hasSha ? 5 : 4} className="px-4 py-6 text-center text-slate-400">
                        {t('toolDetail.noVersions')}
                      </td>
                    </tr>
                  )}
                  {dist.versions.map((row) =>
                    row.platformRows.map((p, platIdx) => (
                      <tr
                        key={`${row.key}:${p.platform}`}
                        className="bg-white transition hover:bg-slate-50/60 dark:bg-slate-900 dark:hover:bg-slate-800/40"
                      >
                        {platIdx === 0 && (
                          <td
                            rowSpan={row.platformRows.length}
                            className="w-px px-4 py-3 align-top font-mono text-[13px] font-medium whitespace-nowrap text-slate-900 dark:text-white"
                          >
                            {row.version}
                          </td>
                        )}
                        <td className="w-px px-4 py-3 whitespace-nowrap">
                          <Badge>{p.platform}</Badge>
                        </td>
                        <td className="w-px px-4 py-3 tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400">
                          {formatBytes(p.size)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {p.sources.map((s) => (
                              <a
                                key={s.url}
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                title={s.url}
                                className={cn(
                                  'inline-flex max-w-[15rem] items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 transition',
                                  s.official
                                    ? 'bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20'
                                    : 'bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                                )}
                              >
                                <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M5 21h14" />
                                </svg>
                                <span className="truncate">{s.official ? t('tool.official') : s.name}</span>
                              </a>
                            ))}
                          </div>
                        </td>
                        {hasSha && (
                          <td className="w-px px-4 py-3 font-mono text-[11px] whitespace-nowrap text-slate-400 dark:text-slate-500">
                            {p.sha256 ? `${p.sha256.slice(0, 12)}…` : '—'}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
