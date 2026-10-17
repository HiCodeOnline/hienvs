// preload：contextBridge 白名单 API（sandbox 模式下全量打包）
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).then((r: unknown) => {
    if (r && typeof r === 'object' && 'ok' in r) {
      const res = r as { ok: boolean; data?: T; message?: string }
      if (res.ok) return res.data as T
      throw new Error(res.message ?? 'IPC 调用失败')
    }
    return r as T
  })
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener as never)
  return () => ipcRenderer.removeListener(channel, listener as never)
}

const api = {
  // 系统
  appInfo: () => invoke<import('../shared/tool-types').AppInfo>(IPC.AppInfo),
  openPath: (target: 'logs' | 'tools' | 'installDir' | 'downloads') => invoke<void>(IPC.AppOpenPath, target),
  selectDirectory: (opts?: { title?: string; defaultPath?: string }) =>
    invoke<string | null>(IPC.AppSelectDirectory, opts ?? {}),
  diskUsage: (dir: string) => invoke<import('../shared/tool-types').DiskUsage>(IPC.AppDiskUsage, dir),
  launchTool: (toolId: string) => invoke<void>(IPC.AppLaunchTool, toolId),
  resetApp: () => invoke<void>(IPC.AppReset),

  // 注册表
  registryList: () => invoke<import('../shared/registry-types').RegistrySnapshot>(IPC.RegistryList),
  registryRefresh: () => invoke<import('../shared/registry-types').RegistrySnapshot>(IPC.RegistryRefresh),
  registryUpdateSource: (sourceId: string) => invoke<import('../shared/registry-types').RegistrySnapshot>(IPC.RegistryUpdateSource, sourceId),
  registryValidateSource: (type: 'remote' | 'local', location: string) =>
    invoke<{ name?: string }>(IPC.RegistryValidateSource, type, location),

  // 工具
  toolDetail: (toolId: string) => invoke<import('./api-types').ToolDetail>(IPC.ToolsDetail, toolId),
  installTool: (toolId: string, version: string, sourceUrl?: string) =>
    invoke<{ taskId: string }>(IPC.ToolsInstall, { toolId, version, sourceUrl }),
  activateTool: (toolId: string, version: string, scope?: 'user' | 'system') =>
    invoke<{ taskId: string }>(IPC.ToolsActivate, { toolId, version, scope }),
  deactivateTool: (toolId: string) => invoke<{ taskId: string }>(IPC.ToolsDeactivate, toolId),
  uninstallTool: (toolId: string, version?: string) => invoke<{ taskId: string }>(IPC.ToolsUninstall, { toolId, version }),
  detectSystem: (toolId: string) => invoke<import('../shared/tool-types').SystemToolInfo>(IPC.ToolsDetectSystem, toolId),
  openToolVersionDir: (toolId: string, version: string) => invoke<void>(IPC.ToolsOpenVersionDir, { toolId, version }),

  // 任务
  tasksList: () => invoke<import('../shared/task-types').TaskSnapshot[]>(IPC.TasksList),
  tasksCancel: (taskId: string) => invoke<boolean>(IPC.TasksCancel, taskId),
  tasksResume: (taskId: string) => invoke<{ taskId: string }>(IPC.TasksResume, taskId),
  tasksRemove: (taskId: string) => invoke<boolean>(IPC.TasksRemove, taskId),
  tasksGetLog: (taskId: string, offset: number) => invoke<{ lines: string[]; nextOffset: number }>(IPC.TasksGetLog, { taskId, offset }),

  // 设置
  settingsGet: () => invoke<import('../shared/tool-types').AppSettings>(IPC.SettingsGet),
  settingsSet: (patch: Partial<import('../shared/tool-types').AppSettings>) => invoke<import('../shared/tool-types').AppSettings>(IPC.SettingsSet, patch),

  // 环境变量
  envSnapshot: () => invoke<import('../shared/task-types').EnvSnapshotData>(IPC.EnvSnapshot),
  envPreview: (toolId: string, version?: string, scope?: 'user' | 'system') =>
    invoke<import('../shared/task-types').EnvPreview>(IPC.EnvPreview, { toolId, version, scope }),

  // 窗口控制（frameless 自定义标题栏）
  windowMinimize: () => invoke<void>(IPC.WindowMinimize),
  windowToggleMaximize: () => invoke<boolean>(IPC.WindowToggleMaximize),
  windowClose: () => invoke<void>(IPC.WindowClose),
  windowIsMaximized: () => invoke<boolean>(IPC.WindowIsMaximized),

  // 当前运行平台（用于标题栏按钮样式的平台适配）
  platform: process.platform,

  // 事件订阅
  onTaskUpdated: (cb: (payload: { task: import('../shared/task-types').TaskSnapshot }) => void) => subscribe(IPC.TaskUpdated, cb),
  onTaskRemoved: (cb: (payload: { taskId: string }) => void) => subscribe(IPC.TaskRemoved, cb),
  onTaskProgress: (cb: (payload: import('../shared/task-types').TaskProgressEvent) => void) => subscribe(IPC.TaskProgress, cb),
  onTaskLog: (cb: (payload: import('../shared/task-types').TaskLogEvent) => void) => subscribe(IPC.TaskLog, cb),
  onRegistryUpdated: (cb: (payload: { snapshot: import('../shared/registry-types').RegistrySnapshot }) => void) => subscribe(IPC.RegistryUpdated, cb),
  onEnvChanged: (cb: (payload: { toolId: string; applied: boolean }) => void) => subscribe(IPC.EnvChanged, cb),
  onWindowMaximizedChanged: (cb: (maximized: boolean) => void) => subscribe(IPC.WindowMaximizedChanged, cb)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
