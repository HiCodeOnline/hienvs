// 任务状态：事件驱动（task:updated 合并，progress 局部更新）
import { create } from 'zustand'
import type { TaskSnapshot, TaskProgressEvent } from '@shared/task-types'

interface TasksState {
  tasks: Record<string, TaskSnapshot>
  runningCount: number
  init(): Promise<void>
  handleUpdated(task: TaskSnapshot): void
  handleRemoved(taskId: string): void
  handleProgress(p: TaskProgressEvent): void
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: {},
  runningCount: 0,
  async init() {
    try {
      const list = await window.api.tasksList()
      const map: Record<string, TaskSnapshot> = {}
      for (const t of list) map[t.taskId] = t
      set({ tasks: map })
    } catch {
      /* 静默 */
    }
  },
  handleUpdated(task) {
    set((s) => {
      const prev = s.tasks[task.taskId]
      // 乱序保护：revision 大者为准
      if (prev && prev.revision > task.revision) return s
      const tasks = { ...s.tasks, [task.taskId]: task }
      return {
        tasks,
        runningCount: Object.values(tasks).filter((t) => t.status === 'running' || t.status === 'queued').length
      }
    })
  },
  handleRemoved(taskId) {
    set((s) => {
      if (!s.tasks[taskId]) return s
      const tasks = { ...s.tasks }
      delete tasks[taskId]
      return {
        tasks,
        runningCount: Object.values(tasks).filter((t) => t.status === 'running' || t.status === 'queued').length
      }
    })
  },
  handleProgress(p) {
    set((s) => {
      const t = s.tasks[p.taskId]
      if (!t) return s
      const steps = t.steps.map((st) =>
        st.id === p.stepId
          ? { ...st, received: p.received, total: p.total, progress: p.total > 0 ? p.received / p.total : st.progress }
          : st
      )
      return { tasks: { ...s.tasks, [p.taskId]: { ...t, steps } } }
    })
  }
}))
