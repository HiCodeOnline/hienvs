// IPC 通道常量（主/预加载/渲染共享，零运行时依赖）

export const IPC = {
  // invoke: 系统
  AppInfo: 'app:info',
  AppOpenPath: 'app:openPath',
  AppSelectDirectory: 'app:selectDirectory',

  // invoke: 注册表
  RegistryList: 'registry:list',
  RegistryRefresh: 'registry:refresh',
  RegistryRefreshIcons: 'registry:refreshIcons',
  RegistryUpdateSource: 'registry:updateSource',

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

  // 事件: main -> renderer
  TaskUpdated: 'task:updated',
  TaskRemoved: 'task:removed',
  TaskProgress: 'task:progress',
  TaskLog: 'task:log',
  RegistryUpdated: 'registry:updated',
  EnvChanged: 'env:changed'
} as const
