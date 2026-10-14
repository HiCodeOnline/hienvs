// 任务中心：全部任务列表
import { useMemo } from 'react'
import { useTasksStore } from '../stores/tasks'
import { useI18n } from '../stores/i18n'
import { EmptyState } from '../components/common'
import { TaskItem } from '../components/task/TaskItem'

export function TasksPage() {
  const tasks = useTasksStore((s) => s.tasks)
  const t = useI18n()

  const sorted = useMemo(() => Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt), [tasks])

  return (
    <div className="p-8">
      {sorted.length === 0 ? (
        <EmptyState title={t('tasks.empty')} hint={t('tasks.emptyHint')} />
      ) : (
        <div className="space-y-3">
          {sorted.map((task) => (
            <TaskItem key={task.taskId} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
