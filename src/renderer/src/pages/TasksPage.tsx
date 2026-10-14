// 任务中心：全部任务列表
import { useMemo } from 'react'
import { useTasksStore } from '../stores/tasks'
import { EmptyState, PageHeader } from '../components/common'
import { TaskItem } from '../components/task/TaskItem'

export function TasksPage() {
  const tasks = useTasksStore((s) => s.tasks)
  const runningCount = useTasksStore((s) => s.runningCount)

  const sorted = useMemo(() => Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt), [tasks])

  return (
    <div className="p-8">
      <PageHeader
        title="任务中心"
        subtitle={runningCount > 0 ? `${runningCount} 个任务进行中` : '没有进行中的任务'}
      />
      {sorted.length === 0 ? (
        <EmptyState title="暂无任务" hint="安装或切换工具版本时会在这里显示工作流任务" />
      ) : (
        <div className="space-y-3">
          {sorted.map((t) => (
            <TaskItem key={t.taskId} task={t} />
          ))}
        </div>
      )}
    </div>
  )
}
