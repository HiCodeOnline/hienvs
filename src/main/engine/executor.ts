// 工作流执行器：顺序执行 + 重试 + 幂等跳过 + 取消 + 回滚（在 Worker 中运行）
import type { TaskContext, StepRunHelpers, StepResult } from './types'
import { TaskCancelled } from './types'
import { stepHandlers } from './steps'

export interface ExecutorEmit {
  stepStart(stepId: string): void
  stepSkip(stepId: string, reason: string): void
  stepDone(stepId: string, detail?: string): void
  stepFailed(stepId: string, error: string): void
  progress(stepId: string, received: number, total: number, speed: number, eta: number): void
  log(line: string, level?: 'info' | 'warn' | 'error' | 'debug'): void
  envApplied(changes: unknown[]): void
}

export interface ExecuteResult {
  ok: boolean
  error?: string
  cancelled?: boolean
  envChanges?: unknown[]
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function executeTask(ctx: TaskContext, emit: ExecutorEmit, signal: AbortSignal): Promise<ExecuteResult> {
  const undoStack: (() => Promise<void>)[] = []
  const artifacts: Record<string, string> = {}
  let envChanges: unknown[] = []

  const run: StepRunHelpers = {
    progress: (received, total, speed, eta) => {
      // 进度在步骤运行时由 executor 上下文补充 stepId
      const current = currentStepId
      if (current) emit.progress(current, received, total, speed, eta)
    },
    log: (line, level) => emit.log(line, level ?? 'info'),
    undo: (fn) => {
      undoStack.push(fn)
    },
    signal,
    artifacts
  }

  let currentStepId: string | null = null

  const rollbackAll = async (reason: string): Promise<void> => {
    emit.log(`开始回滚（${reason}），共 ${undoStack.length} 项`, 'warn')
    while (undoStack.length > 0) {
      const fn = undoStack.pop()
      try {
        await fn?.()
      } catch (e) {
        emit.log(`回滚失败(忽略): ${e instanceof Error ? e.message : String(e)}`, 'warn')
      }
    }
  }

  try {
    for (const step of ctx.steps) {
      if (signal.aborted || ctx.aborted) throw new TaskCancelled()
      currentStepId = step.id

      const handler = stepHandlers[step.type]
      if (!handler) {
        emit.stepFailed(step.id, `未知步骤类型: ${step.type}`)
        throw new Error(`未知步骤类型: ${step.type}`)
      }

      // 断点续跑：已完成步骤跳过
      if (ctx.completedStepIds.includes(step.id)) {
        emit.stepSkip(step.id, '已完成（断点续跑）')
        continue
      }

      const attempts = step.retry?.attempts ?? 1
      const backoff = step.retry?.backoffMs ?? 1500
      const factor = step.retry?.factor ?? 2

      emit.stepStart(step.id)
      let lastErr: Error | null = null
      let done = false
      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (signal.aborted || ctx.aborted) throw new TaskCancelled()
        try {
          const result: StepResult = await handler(step.params, ctx, run)
          if (result.artifacts) Object.assign(artifacts, result.artifacts)
          if (run.artifacts['envChanges']) {
            try {
              envChanges = JSON.parse(run.artifacts['envChanges']) as unknown[]
            } catch { /* 忽略 */ }
          }
          emit.stepDone(step.id, result.detail)
          done = true
          break
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e))
          if (lastErr instanceof TaskCancelled || signal.aborted || ctx.aborted) throw new TaskCancelled()
          if (attempt < attempts) {
            const delay = backoff * Math.pow(factor, attempt - 1)
            emit.log(`步骤 ${step.title} 第 ${attempt}/${attempts} 次尝试失败: ${lastErr.message}，${delay}ms 后重试`, 'warn')
            await sleep(delay)
          }
        }
      }
      if (!done) {
        emit.stepFailed(step.id, lastErr?.message ?? '未知错误')
        const policy = step.onFailure ?? 'keep'
        if (policy === 'rollback') {
          await rollbackAll(`步骤 "${step.title}" 失败且策略为 rollback`)
        }
        return { ok: false, error: `步骤 "${step.title}" 失败: ${lastErr?.message ?? '未知错误'}` }
      }
      currentStepId = null
    }
    return { ok: true, envChanges }
  } catch (e) {
    if (e instanceof TaskCancelled || signal.aborted || ctx.aborted) {
      await rollbackAll('任务取消')
      return { ok: false, cancelled: true, error: '任务已取消' }
    }
    const msg = e instanceof Error ? e.message : String(e)
    await rollbackAll('任务异常')
    return { ok: false, error: msg }
  }
}
