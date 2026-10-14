// 任务中心：全部任务列表
import { useMemo } from 'react'
import { useTasksStore } from '../stores/tasks'
import { EmptyState } from '../components/common'
import { TaskItem } from '../components/task/TaskItem'

export function TasksPage() {
  const tasks = useTasksStore((s) => s.tasks)

  const sorted = useMemo(() => Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt), [tasks])

  return (
    <div className="p-8">
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
