// 任务卡片：状态 + 步骤时间线 + 日志（可展开）
import { useState } from 'react'
import type { TaskSnapshot, TaskStatus } from '@shared/task-types'
import { useAppStore } from '../../stores/app'
import { useRegistryStore } from '../../stores/registry'
import { useI18n, useStepLabel } from '../../stores/i18n'
import { Badge, Button, Spinner, ToolAvatar, formatDateTime, formatDuration } from '../common'
import { StepTimeline } from './StepTimeline'
import { LogViewer } from './LogViewer'

/** 任务状态 -> 徽标配色与文案键 */
const STATUS_BADGE: Record<TaskStatus, { tone: 'zinc' | 'green' | 'red' | 'amber' | 'brand'; key: string }> = {
  queued: { tone: 'zinc', key: 'taskStatus.queued' },
  running: { tone: 'brand', key: 'taskStatus.running' },
  success: { tone: 'green', key: 'taskStatus.success' },
  failed: { tone: 'red', key: 'taskStatus.failed' },
  cancelled: { tone: 'amber', key: 'taskStatus.cancelled' },
  interrupted: { tone: 'amber', key: 'taskStatus.interrupted' }
}

/** 任务类型 -> 文案键 */
const KIND_LABEL: Record<TaskSnapshot['kind'], string> = {
  install: 'taskKind.install',
  activate: 'taskKind.activate',
  deactivate: 'taskKind.deactivate',
  uninstall: 'taskKind.uninstall',
  'resume-install': 'taskKind.resumeInstall'
}

export function TaskItem({ task }: { task: TaskSnapshot }) {
  const pushToast = useAppStore((s) => s.pushToast)
  const t = useI18n()
  const stepLabel = useStepLabel()
  // 卡片前展示对应工具的图标（未配置或加载失败时回退首字母）
  const toolIcon = useRegistryStore((s) => s.snapshot?.tools.find((x) => x.id === task.toolId)?.icon)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)

  const badge = STATUS_BADGE[task.status]
  const active = task.status === 'running' || task.status === 'queued'
  const doneStepCount = task.steps.filter((s) => s.state === 'done').length

  async function withBusy(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      pushToast('info', ok)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white transition-colors dark:border-zinc-800 dark:bg-zinc-900">
      <div
        className="flex cursor-pointer items-center gap-3 p-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <ToolAvatar toolId={task.toolId} icon={toolIcon} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t(KIND_LABEL[task.kind])} {task.toolName}
              {task.version ? ` ${task.version}` : ''}
            </span>
            <Badge tone={badge.tone}>{t(badge.key)}</Badge>
            {task.resumable && (task.status === 'failed' || task.status === 'interrupted') && (
              <Badge tone="blue">{t('taskItem.resumable')}</Badge>
            )}
          </div>
          <div className="mt-0.5 text-xs text-zinc-400">
            {formatDateTime(task.createdAt)} · {t('taskItem.steps', { done: doneStepCount, total: task.steps.length })}
            {task.status === 'running' || task.status === 'queued'
              ? ` · ${t('taskItem.elapsed', { time: formatDuration(task.startedAt ?? task.createdAt) })}`
              : task.finishedAt
                ? ` · ${t('taskItem.duration', { time: formatDuration(task.startedAt ?? task.createdAt, task.finishedAt) })}`
                : ''}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {task.status === 'running' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => withBusy(() => window.api.tasksCancel(task.taskId), t('toast.cancelRequested'))}
            >
              {t('taskItem.cancel')}
            </Button>
          )}
          {task.resumable && (task.status === 'failed' || task.status === 'interrupted') && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => withBusy(() => window.api.tasksResume(task.taskId), t('toast.resumed'))}
            >
              {t('taskItem.resume')}
            </Button>
          )}
          {!active && task.status !== 'running' && task.status !== 'queued' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => withBusy(() => window.api.tasksRemove(task.taskId), t('toast.taskRemoved'))}
            >
              {t('taskItem.remove')}
            </Button>
          )}
          <button
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={() => setExpanded((v) => !v)}
          >
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {task.status === 'running' && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Spinner className="h-3 w-3 text-brand-500" />
            {t('taskItem.currentStep')}
            {(() => {
              const running = task.steps.find((s) => s.state === 'running')
              return running ? stepLabel(running) : t('taskItem.preparing')
            })()}
          </div>
        </div>
      )}

      {task.error && (
        <div className="mx-4 mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {task.error}
        </div>
      )}

      {expanded && (
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('taskItem.workflowSteps')}</div>
          <StepTimeline steps={task.steps} />
          <div className="mt-4">
            <LogViewer taskId={task.taskId} />
          </div>
        </div>
      )}
    </div>
  )
}
