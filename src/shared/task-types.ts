// 任务与步骤状态类型

export type TaskKind = 'install' | 'activate' | 'deactivate' | 'uninstall' | 'resume-install'

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type StepState = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface StepSnapshot {
  id: string
  type: string
  title: string
  state: StepState
  detail?: string
  error?: string
  startedAt?: number
  finishedAt?: number
  /** 下载进度（0-1），仅 download 步骤 */
  progress?: number
  received?: number
  total?: number
}

export interface TaskSnapshot {
  taskId: string
  kind: TaskKind
  toolId: string
  toolName: string
  version?: string
  status: TaskStatus
  steps: StepSnapshot[]
  createdAt: number
  updatedAt: number
  startedAt?: number
  finishedAt?: number
  error?: string
  /** 单调递增，渲染层用于乱序保护 */
  revision: number
  resumable: boolean
}

export interface TaskProgressEvent {
  taskId: string
  stepId: string
  received: number
  total: number
  speed: number
  eta: number
}

export interface TaskLogEvent {
  taskId: string
  line: string
  level: 'info' | 'warn' | 'error' | 'debug'
  ts: number
}

/** 环境变量操作记录（用于回滚与审计） */
export interface EnvUndoRecord {
  kind: 'var' | 'path' | 'rc-block'
  name: string
  oldValue?: string
  hadOldValue: boolean
  scope: 'user' | 'system'
}

export interface EnvPlanVar {
  name: string
  value: string
  expand?: boolean
}

/** 渲染后的环境变量计划：激活某组工具后的目标状态 */
export interface EnvPlan {
  scope: 'user' | 'system'
  platform: 'windows' | 'darwin' | 'linux'
  vars: EnvPlanVar[]
  pathEntries: string[]
  rcFiles: string[]
}

export interface EnvChangeItem {
  kind: 'var' | 'path'
  name: string
  oldValue?: string
  newValue?: string
  hadOldValue: boolean
}

export interface EnvPreview {
  scope: 'user' | 'system'
  changes: EnvChangeItem[]
  managedBlockPreview: string
}

export interface EnvSnapshotData {
  scope: 'user' | 'system'
  vars: { name: string; value: string; managed: boolean }[]
  pathEntries: { entry: string; managed: boolean; toolId?: string }[]
  managedBlock: string
}
