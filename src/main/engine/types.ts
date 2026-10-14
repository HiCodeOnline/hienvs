// 工作流引擎共享类型（主进程与 Worker 使用，不依赖 electron）
import type { TaskKind, EnvPlan } from '@shared/task-types'

export interface ResolvedStep {
  id: string
  type: string
  title: string
  params: Record<string, unknown>
  retry?: { attempts: number; backoffMs?: number; factor?: number }
  timeoutSec?: number
  onFailure?: 'rollback' | 'keep'
}

export interface TaskPaths {
  hienvsHome: string
  toolsDir: string
  versionDir?: string
  currentDir?: string
  tmpDir: string
  cacheDir: string
  downloadsDir: string
}

export interface ManagedPathEntry {
  toolId: string
  entry: string
}

export interface TaskContext {
  taskId: string
  kind: TaskKind
  toolId: string
  toolName: string
  version?: string
  paths: TaskPaths
  platform: 'windows' | 'darwin' | 'linux'
  arch: string
  mirrorPolicy: 'auto' | 'mainland-first' | 'official-first'
  proxy?: string
  /** 用户安装时指定的下载源 URL：优先使用，失败后仍回退其余源 */
  preferredUrl?: string
  envScope: 'user' | 'system'
  /** 激活后的目标环境变量计划（env.apply 步骤使用） */
  envPlan?: EnvPlan
  steps: ResolvedStep[]
  /** 断点续跑：这些步骤视为已完成（仍会做幂等复核） */
  completedStepIds: string[]
  /** 运行态：取消标志（Worker 注入） */
  aborted?: boolean
}

export interface StepResult {
  detail?: string
  /** 产物信息，供后续步骤或主进程使用 */
  artifacts?: Record<string, string>
}

export interface StepHandler {
  (params: Record<string, unknown>, ctx: TaskContext, run: StepRunHelpers): Promise<StepResult>
}

export interface StepRunHelpers {
  /** 上报下载进度 */
  progress(received: number, total: number, speed: number, eta: number): void
  /** 记录日志 */
  log(line: string, level?: 'info' | 'warn' | 'error' | 'debug'): void
  /** 登记回滚函数（LIFO 执行） */
  undo(fn: () => Promise<void>): void
  /** 任务取消信号 */
  signal: AbortSignal
  /** 步骤间共享数据 */
  artifacts: Record<string, string>
}

export class TaskCancelled extends Error {
  constructor() {
    super('任务已取消')
    this.name = 'TaskCancelled'
  }
}
