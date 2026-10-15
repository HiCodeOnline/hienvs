// 主进程入口：生命周期 / 单实例 / 窗口 / IPC 注册
import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { logger } from './core/logger'
import { defaultHienvsHome } from './core/paths'
import { settingsStore } from './core/settings'
import { AppContext } from './context'
import { registerAllIpc } from './ipc'
import { IPC } from '@shared/ipc-channels'

let ctx: AppContext | null = null

function createWindow(ctx: AppContext): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    name: 'hienvs-main',
    windowStatePersistence: true,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    // dev 下运行的是 electron.exe（默认图标），显式指向生成的应用图标；
    // 打包后图标已嵌入 exe，无需再设置
    icon: app.isPackaged ? undefined : path.join(__dirname, '../../build/icon.png'),
    // macOS 使用原生红绿灯按钮，Windows/Linux 使用无边框窗口配合自绘控制按钮
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // 最大化状态变化通知渲染层，用于切换自定义标题栏的最大化/还原图标
  win.on('maximize', () => win.webContents.send(IPC.WindowMaximizedChanged, true))
  win.on('unmaximize', () => win.webContents.send(IPC.WindowMaximizedChanged, false))

  // 阻止导航到外部页面；外链用系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) e.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(async () => {
    settingsStore.load()
    logger.init(path.join(defaultHienvsHome(), 'logs'))

    ctx = new AppContext((channel, payload) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, payload)
      }
    })

    registerAllIpc(ctx)

    // 后台加载注册表
    void ctx.refreshRegistry(true).catch((e) => logger.warn(`[registry] 初始加载失败: ${e instanceof Error ? e.message : String(e)}`))

    // 远程源自动更新定时器（每 10 分钟，仅拉取开启 autoUpdate 的源）
    ctx.startRegistryAutoUpdate()

    createWindow(ctx)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && ctx) createWindow(ctx)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
