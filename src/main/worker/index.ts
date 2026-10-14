// Worker 入口（Electron utilityProcess）：接收任务 → 执行工作流 → 回传事件
import process from 'node:process'
import { executeTask, type ExecutorEmit } from '../engine/executor'
import type { TaskContext } from '../engine/types'
import type { MainToWorker, WorkerToMain } from './protocol'

// Electron utilityProcess 提供 process.parentPort（MessagePort 风格）
const port = process.parentPort

let abortController: AbortController | null = null

function send(msg: WorkerToMain): void {
  port.postMessage(msg)
}

function createEmit(taskId: string): ExecutorEmit {
  return {
    stepStart: (stepId) => send({ type: 'step-start', taskId, stepId }),
    stepSkip: (stepId, reason) => send({ type: 'step-skip', taskId, stepId, reason }),
    stepDone: (stepId, detail) => send({ type: 'step-done', taskId, stepId, detail }),
    stepFailed: (stepId, error) => send({ type: 'step-failed', taskId, stepId, error }),
    progress: (stepId, received, total, speed, eta) =>
      send({ type: 'step-progress', taskId, stepId, received, total, speed, eta }),
    log: (line, level) => send({ type: 'log', taskId, line, level: level ?? 'info' }),
    envApplied: (changes) => send({ type: 'env-applied', taskId, changes: changes as never })
  }
}

async function runTask(task: TaskContext): Promise<void> {
  abortController = new AbortController()
  const emit = createEmit(task.taskId)
  try {
    const result = await executeTask(task, emit, abortController.signal)
    send({
      type: 'task-done',
      taskId: task.taskId,
      ok: result.ok,
      error: result.cancelled ? '__cancelled__' : result.error,
      detail: undefined
    })
  } catch (e) {
    send({
      type: 'task-done',
      taskId: task.taskId,
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    })
  } finally {
    abortController = null
  }
}

port.on('message', (msg: { data: MainToWorker }) => {
  const m = (msg as unknown as { data?: MainToWorker }).data ?? (msg as unknown as MainToWorker)
  if (m.type === 'run') {
    void runTask(m.task)
  } else if (m.type === 'cancel') {
    abortController?.abort()
  }
})
