// IPC 通道常量（主/预加载/渲染共享，零运行时依赖）

export const IPC = {
  // invoke: 系统
  AppInfo: 'app:info',
  AppOpenPath: 'app:openPath',
  AppSelectDirectory: 'app:selectDirectory',
  AppDiskUsage: 'app:diskUsage',
  AppLaunchTool: 'app:launchTool',
  AppReset: 'app:reset',

  // invoke: 注册表
  RegistryList: 'registry:list',
  RegistryRefresh: 'registry:refresh',
  RegistryUpdateSource: 'registry:updateSource',
  RegistryValidateSource: 'registry:validateSource',

  // invoke: 工具
  ToolsDetail: 'tools:detail',
  ToolsInstall: 'tools:install',
  ToolsActivate: 'tools:activate',
  ToolsDeactivate: 'tools:deactivate',
  ToolsUninstall: 'tools:uninstall',
  ToolsDetectSystem: 'tools:detectSystem',

  // invoke: 任务
  TasksList: 'tasks:list',
  TasksGet: 'tasks:get',
  TasksCancel: 'tasks:cancel',
  TasksResume: 'tasks:resume',
  TasksRemove: 'tasks:remove',
  TasksGetLog: 'tasks:getLog',

  // invoke: 设置
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',

  // invoke: 环境变量
  EnvSnapshot: 'env:snapshot',
  EnvPreview: 'env:preview',

  // invoke: 窗口控制（frameless 自定义标题栏）
  WindowMinimize: 'window:minimize',
  WindowToggleMaximize: 'window:toggleMaximize',
  WindowClose: 'window:close',
  WindowIsMaximized: 'window:isMaximized',

  // 事件: main -> renderer
  TaskUpdated: 'task:updated',
  TaskRemoved: 'task:removed',
  TaskProgress: 'task:progress',
  TaskLog: 'task:log',
  RegistryUpdated: 'registry:updated',
  EnvChanged: 'env:changed',
  WindowMaximizedChanged: 'window:maximizedChanged'
} as const
