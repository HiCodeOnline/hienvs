// 步骤时间线：展示工作流各步骤执行状态与下载进度
import type { StepSnapshot } from '@shared/task-types'
import { ProgressBar, Spinner, formatBytes, formatSpeed, formatEta } from '../common'

function StepIcon({ state }: { state: StepSnapshot['state'] }) {
  const cls = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full'
  switch (state) {
    case 'done':
      return (
        <div className={`${cls} bg-emerald-100 dark:bg-emerald-900/50`}>
          <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      )
    case 'running':
      return (
        <div className={`${cls} bg-brand-50 dark:bg-brand-900/40`}>
          <Spinner className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
        </div>
      )
    case 'failed':
      return (
        <div className={`${cls} bg-red-100 dark:bg-red-900/50`}>
          <svg className="h-3.5 w-3.5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )
    case 'skipped':
      return <div className={`${cls} border-2 border-dashed border-zinc-300 dark:border-zinc-600`} />
    default:
      return <div className={`${cls} border-2 border-zinc-200 dark:border-zinc-700`} />
  }
}

export function StepTimeline({ steps }: { steps: StepSnapshot[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => (
        <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
          {/* 连接线 */}
          {i < steps.length - 1 && (
            <span className="absolute left-3 top-6 h-[calc(100%-24px)] w-px bg-zinc-200 dark:bg-zinc-700" />
          )}
          <StepIcon state={step.state} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`text-sm font-medium ${
                  step.state === 'failed'
                    ? 'text-red-600 dark:text-red-400'
                    : step.state === 'done'
                      ? 'text-zinc-600 dark:text-zinc-300'
                      : step.state === 'pending'
                        ? 'text-zinc-400 dark:text-zinc-500'
                        : 'text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {step.title || step.type}
              </span>
              {step.detail && (
                <span className="max-w-[50%] truncate text-xs text-zinc-400" title={step.detail}>
                  {step.detail}
                </span>
              )}
            </div>
            {step.state === 'running' && step.total != null && step.total > 0 && (
              <div className="mt-2 space-y-1">
                <ProgressBar value={step.progress ?? 0} />
                {(() => {
                  const elapsed = step.startedAt ? Math.max(1, (Date.now() - step.startedAt) / 1000) : 0
                  const speed = elapsed > 0 ? (step.received ?? 0) / elapsed : 0
                  return (
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>
                        {formatBytes(step.received)} / {formatBytes(step.total)}
                      </span>
                      <span>{formatSpeed(speed)}</span>
                    </div>
                  )
                })()}
              </div>
            )}
            {step.error && <p className="mt-1 text-xs text-red-500">{step.error}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
