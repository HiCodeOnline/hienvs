// IPC 注册：全部 invoke 通道
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { AppContext } from '../context'
import { IPC } from '@shared/ipc-channels'
import type { AppSettings } from '@shared/tool-types'
import { logger } from '../core/logger'

type Handler = () => Promise<unknown> | unknown

function ok(data: unknown): unknown {
  return { ok: true, data }
}

function fail(e: unknown): unknown {
  return { ok: false, code: 'ERROR', message: e instanceof Error ? e.message : String(e) }
}

export function registerAllIpc(ctx: AppContext): void {
  const handle = (channel: string, fn: (...args: never[]) => Promise<unknown> | unknown): void => {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        return ok(await (fn as (...a: unknown[]) => unknown)(...args))
      } catch (e) {
        logger.error(`[ipc:${channel}] ${e instanceof Error ? e.message : String(e)}`)
        return fail(e)
      }
    })
  }

  handle(IPC.AppInfo, () => ctx.appInfo())
  handle(IPC.AppOpenPath, (target: 'logs' | 'tools' | 'installDir' | 'downloads') => ctx.openPath(target))
  handle(IPC.AppSelectDirectory, async (opts: { title?: string; defaultPath?: string } = {}) => {
    const res = await dialog.showOpenDialog({
      title: opts.title,
      defaultPath: opts.defaultPath,
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  handle(IPC.AppDiskUsage, (dir: string) => ctx.diskUsage(dir))

  handle(IPC.RegistryList, () => ctx.ensureRegistryLoaded().then(() => ctx.snapshot()))
  handle(IPC.RegistryRefresh, () => ctx.refreshRegistry(true))
  handle(IPC.RegistryUpdateSource, (sourceId: string) => ctx.updateRegistrySource(sourceId))

  handle(IPC.ToolsDetail, (toolId: string) => ctx.toolDetail(toolId))
  handle(IPC.ToolsInstall, (req: { toolId: string; version: string; sourceUrl?: string }) => ctx.install(req.toolId, req.version, req.sourceUrl))
  handle(IPC.ToolsActivate, (req: { toolId: string; version: string; scope?: 'user' | 'system' }) => ctx.activate(req.toolId, req.version, req.scope))
  handle(IPC.ToolsDeactivate, (toolId: string) => ctx.deactivate(toolId))
  handle(IPC.ToolsUninstall, (req: { toolId: string; version?: string }) => ctx.uninstall(req.toolId, req.version))
  handle(IPC.ToolsDetectSystem, (toolId: string) => ctx.detectSystem(toolId))

  handle(IPC.TasksList, () => ctx.manager.list())
  handle(IPC.TasksGet, (taskId: string) => ctx.manager.get(taskId))
  handle(IPC.TasksCancel, (taskId: string) => ctx.manager.cancel(taskId))
  handle(IPC.TasksResume, (taskId: string) => ctx.resume(taskId))
  handle(IPC.TasksRemove, (taskId: string) => ctx.manager.remove(taskId))
  handle(IPC.TasksGetLog, (req: { taskId: string; offset: number }) => ctx.manager.readLog(req.taskId, req.offset))

  handle(IPC.SettingsGet, () => ctx.settings)
  handle(IPC.SettingsSet, (patch: Partial<AppSettings>) => ctx.updateSettings(patch))

  handle(IPC.EnvSnapshot, () => ctx.envSnapshot())
  handle(IPC.EnvPreview, (req: { toolId: string; version?: string; scope?: 'user' | 'system' }) => ctx.envPreview(req.toolId, req.version, req.scope))

  // 窗口控制：frameless 自定义标题栏按钮（作用于发起调用的窗口）
  const handleWindow = (channel: string, fn: (win: BrowserWindow) => unknown): void => {
    ipcMain.handle(channel, async (event) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) throw new Error('窗口不存在')
        return ok(fn(win))
      } catch (e) {
        logger.error(`[ipc:${channel}] ${e instanceof Error ? e.message : String(e)}`)
        return fail(e)
      }
    })
  }

  handleWindow(IPC.WindowMinimize, (win) => win.minimize())
  handleWindow(IPC.WindowToggleMaximize, (win) => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  handleWindow(IPC.WindowClose, (win) => win.close())
  handleWindow(IPC.WindowIsMaximized, (win) => win.isMaximized())
}
