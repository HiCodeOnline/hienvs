// Worker（utilityProcess）与主进程之间的消息协议
import type { TaskContext } from '../engine/types'
import type { EnvChangeItem } from '@shared/task-types'

export type MainToWorker = { type: 'run'; task: TaskContext } | { type: 'cancel' }

export type WorkerToMain =
  | { type: 'step-start'; taskId: string; stepId: string }
  | { type: 'step-skip'; taskId: string; stepId: string; reason: string }
  | { type: 'step-done'; taskId: string; stepId: string; detail?: string }
  | { type: 'step-failed'; taskId: string; stepId: string; error: string }
  | { type: 'step-progress'; taskId: string; stepId: string; received: number; total: number; speed: number; eta: number }
  | { type: 'log'; taskId: string; line: string; level: 'info' | 'warn' | 'error' | 'debug' }
  | { type: 'env-applied'; taskId: string; changes: EnvChangeItem[] }
  | { type: 'task-done'; taskId: string; ok: boolean; error?: string; detail?: string }
