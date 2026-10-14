// 应用根组件：初始化 + 事件订阅 + 页面路由 + Toast
import { useEffect } from 'react'
import { useAppStore } from './stores/app'
import { useRegistryStore } from './stores/registry'
import { useTasksStore } from './stores/tasks'
import { useSettingsStore } from './stores/settings'
import { Sidebar } from './components/layout/Sidebar'
import { TitleBar } from './components/layout/TitleBar'
import { StatusBar } from './components/layout/StatusBar'
import { DashboardPage } from './pages/DashboardPage'
import { ToolsPage } from './pages/ToolsPage'
import { ToolDetailPage } from './pages/ToolDetailPage'
import { TasksPage } from './pages/TasksPage'
import { SettingsPage } from './pages/SettingsPage'

function ToastHost() {
  const toasts = useAppStore((s) => s.toasts)
  const dismissToast = useAppStore((s) => s.dismissToast)
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto cursor-pointer rounded-lg border p-3.5 text-sm shadow-lg backdrop-blur transition-all ${
            t.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-300'
              : t.kind === 'error'
                ? 'border-red-200 bg-red-50/95 text-red-800 dark:border-red-800 dark:bg-red-950/90 dark:text-red-300'
                : 'border-zinc-200 bg-white/95 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const page = useAppStore((s) => s.page)
  const detailToolId = useAppStore((s) => s.detailToolId)
  const pushToast = useAppStore((s) => s.pushToast)

  useEffect(() => {
    // 初始化数据
    void useRegistryStore.getState().load()
    void useTasksStore.getState().init()
    void useSettingsStore.getState().load()

    // 订阅主进程事件
    const unsubs = [
      window.api.onTaskUpdated(({ task }) => useTasksStore.getState().handleUpdated(task)),
      window.api.onTaskRemoved(({ taskId }) => useTasksStore.getState().handleRemoved(taskId)),
      window.api.onTaskProgress((p) => useTasksStore.getState().handleProgress(p)),
      window.api.onRegistryUpdated(({ snapshot }) => useRegistryStore.setState({ snapshot })),
      window.api.onEnvChanged(({ toolId, applied }) =>
        pushToast(applied ? 'success' : 'info', `${toolId} 环境变量已${applied ? '应用，重开终端生效' : '移除'}`)
      )
    ]
    return () => unsubs.forEach((u) => u())
  }, [pushToast])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {page === 'dashboard' && <DashboardPage />}
          {page === 'tools' && <ToolsPage />}
          {page === 'tool-detail' && detailToolId && <ToolDetailPage toolId={detailToolId} />}
          {page === 'tasks' && <TasksPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
      <StatusBar />
      <ToastHost />
    </div>
  )
}
