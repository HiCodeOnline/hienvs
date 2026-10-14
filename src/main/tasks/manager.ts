// 任务管理器：队列/并发/Worker 进程托管/事件聚合/journal/日志
import path from 'node:path'
import { utilityProcess, UtilityProcess, powerSaveBlocker } from 'electron'
import { randomUUID } from 'node:crypto'
import type { TaskContext } from '../engine/types'
import type { TaskSnapshot, StepSnapshot, TaskKind } from '@shared/task-types'
import type { MainToWorker, WorkerToMain } from '../worker/protocol'
import { JournalStore, type JournalData } from './journal'

interface RunningTask {
  child: UtilityProcess
  snapshot: TaskSnapshot
  journal: JournalData
  lastProgressEmit: number
}

interface QueuedTask {
  task: TaskContext
  priority: number
  steps: StepSnapshot[]
  journal: JournalData
}

export type NotifyFn = (channel: string, payload: unknown) => void

function priorityOf(kind: TaskKind): number {
  return kind === 'activate' || kind === 'uninstall' ? 1 : 2
}

export class TaskManager {
  private running = new Map<string, RunningTask>()
  private queue: QueuedTask[] = []
  private finished = new Map<string, TaskSnapshot>()
  private journal: JournalStore
  private concurrency = 2
  private powerSaveId: number | null = null

  constructor(tasksDir: string, logsDir: string, private notify: NotifyFn, private onFinished?: (snapshot: TaskSnapshot) => void) {
    this.journal = new JournalStore(tasksDir, logsDir)
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, Math.min(5, n))
    this.pump()
  }

  /** 启动时恢复：孤儿 running 标记 interrupted */
  restore(): void {
    for (const j of this.journal.loadAll()) {
      const steps: StepSnapshot[] = Object.entries(j.steps).map(([id, s]) => ({
        id,
        type: 'unknown',
        title: id,
        state: s.state,
        error: s.error,
        detail: s.detail
      }))
      const snapshot: TaskSnapshot = {
        taskId: j.taskId,
        kind: j.kind,
        toolId: j.toolId,
        toolName: j.toolName,
        version: j.version,
        status: 'interrupted',
        steps,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        error: j.error,
        revision: 1,
        resumable: j.kind === 'install' || j.kind === 'resume-install'
      }
      this.finished.set(j.taskId, snapshot)
    }
  }

  list(): TaskSnapshot[] {
    const all: TaskSnapshot[] = [
      ...[...this.queue.values()].map((q) => this.snapshotOf(q)),
      ...[...this.running.values()].map((r) => r.snapshot),
      ...[...this.finished.values()]
    ]
    return all.sort((a, b) => b.createdAt - a.createdAt)
  }

  get(taskId: string): TaskSnapshot | null {
    const r = this.running.get(taskId)
    if (r) return r.snapshot
    const q = this.queue.find((x) => x.task.taskId === taskId)
    if (q) return this.snapshotOf(q)
    return this.finished.get(taskId) ?? null
  }

  private snapshotOf(q: QueuedTask): TaskSnapshot {
    return {
      taskId: q.task.taskId,
      kind: q.task.kind,
      toolId: q.task.toolId,
      toolName: q.task.toolName,
      version: q.task.version,
      status: 'queued',
      steps: q.steps,
      createdAt: q.journal.createdAt,
      updatedAt: q.journal.updatedAt,
      revision: 1,
      resumable: false
    }
  }

  enqueue(task: TaskContext, stepTitles: { id: string; type: string; title: string }[]): TaskSnapshot {
    const steps: StepSnapshot[] = stepTitles.map((s) => ({ id: s.id, type: s.type, title: s.title, state: 'pending' }))
    const journal = this.journal.create({
      taskId: task.taskId,
      kind: task.kind,
      toolId: task.toolId,
      toolName: task.toolName,
      version: task.version
    })
    const q: QueuedTask = { task, priority: priorityOf(task.kind), steps, journal }
    this.queue.push(q)
    this.queue.sort((a, b) => a.priority - b.priority)
    const snapshot = this.get(task.taskId)
    if (snapshot) this.notifyUpdated(snapshot)
    this.pump()
    return snapshot as TaskSnapshot
  }

  cancel(taskId: string): boolean {
    const qi = this.queue.findIndex((q) => q.task.taskId === taskId)
    if (qi >= 0) {
      const [q] = this.queue.splice(qi, 1)
      const snap = this.snapshotOf(q)
      snap.status = 'cancelled'
      snap.finishedAt = Date.now()
      this.finished.set(taskId, snap)
      this.notifyUpdated(snap)
      return true
    }
    const r = this.running.get(taskId)
    if (r) {
      try {
        r.child.postMessage({ type: 'cancel' } satisfies MainToWorker)
      } catch { /* 进程可能已退出 */ }
      return true
    }
    return false
  }

  remove(taskId: string): boolean {
    if (this.running.has(taskId)) return false
    const q = this.queue.find((x) => x.task.taskId === taskId)
    if (q) return false
    if (!this.finished.has(taskId)) return false
    this.finished.delete(taskId)
    this.journal.remove(taskId)
    // 通知渲染层移除该任务，否则其仍停留在任务列表中
    this.notify('task:removed', { taskId })
    return true
  }

  readLog(taskId: string, offset: number): { lines: string[]; nextOffset: number } {
    return this.journal.readLog(taskId, offset)
  }

  /** 断点续跑需要的信息 */
  resumeInfo(taskId: string): { completedStepIds: string[] } | null {
    const j = this.journal.load(taskId)
    if (!j) return null
    const completed = Object.entries(j.steps)
      .filter(([, s]) => s.state === 'done')
      .map(([id]) => id)
    return { completedStepIds: completed }
  }

  private pump(): void {
    while (this.running.size < this.concurrency && this.queue.length > 0) {
      const q = this.queue.shift()
      if (!q) break
      this.startWorker(q)
    }
    this.updatePowerSave()
  }

  private updatePowerSave(): void {
    const need = this.running.size > 0
    if (need && this.powerSaveId === null) {
      this.powerSaveId = powerSaveBlocker.start('prevent-app-suspension')
    } else if (!need && this.powerSaveId !== null) {
      powerSaveBlocker.stop(this.powerSaveId)
      this.powerSaveId = null
    }
  }

  private startWorker(q: QueuedTask): void {
    const task = q.task
    const workerPath = path.join(__dirname, 'worker', 'index.js')
    const child = utilityProcess.fork(workerPath, [], { serviceName: `hienvs-task-${task.toolId}` })
    const snapshot: TaskSnapshot = {
      taskId: task.taskId,
      kind: task.kind,
      toolId: task.toolId,
      toolName: task.toolName,
      version: task.version,
      status: 'running',
      steps: q.steps.map((s) => ({ ...s })),
      createdAt: q.journal.createdAt,
      updatedAt: Date.now(),
      startedAt: Date.now(),
      revision: 1,
      resumable: false
    }
    const entry: RunningTask = { child, snapshot, journal: q.journal, lastProgressEmit: 0 }
    this.running.set(task.taskId, entry)
    this.notifyUpdated(snapshot)

    child.on('message', (raw: unknown) => this.onWorkerMessage(entry, raw as WorkerToMain))
    child.on('exit', (code) => {
      // Worker 异常退出（崩溃）而未发 task-done
      if (this.running.has(task.taskId)) {
        this.finish(entry, false, `Worker 进程异常退出(code=${code})，可尝试继续`)
      }
    })

    try {
      child.postMessage({ type: 'run', task } satisfies MainToWorker)
    } catch (e) {
      this.finish(entry, false, `任务分发失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private onWorkerMessage(entry: RunningTask, msg: WorkerToMain): void {
    const snap = entry.snapshot
    const j = entry.journal
    const stepId = (msg as { stepId?: string }).stepId ?? ''
    const step = snap.steps.find((s) => s.id === stepId)
    switch (msg.type) {
      case 'step-start':
        if (step) {
          step.state = 'running'
          step.startedAt = Date.now()
        }
        j.steps[msg.stepId] = { state: 'running' }
        break
      case 'step-skip':
        if (step) {
          step.state = 'skipped'
          step.detail = msg.reason
        }
        j.steps[msg.stepId] = { state: 'skipped', detail: msg.reason }
        break
      case 'step-done':
        if (step) {
          step.state = 'done'
          step.detail = msg.detail
          step.finishedAt = Date.now()
        }
        j.steps[msg.stepId] = { state: 'done', detail: msg.detail }
        break
      case 'step-failed':
        if (step) {
          step.state = 'failed'
          step.error = msg.error
        }
        j.steps[msg.stepId] = { state: 'failed', error: msg.error }
        break
      case 'step-progress': {
        if (step) {
          step.received = msg.received
          step.total = msg.total
          step.progress = msg.total > 0 ? msg.received / msg.total : undefined
        }
        const now = Date.now()
        if (now - entry.lastProgressEmit >= 250) {
          entry.lastProgressEmit = now
          this.notify('task:progress', {
            taskId: msg.taskId,
            stepId: msg.stepId,
            received: msg.received,
            total: msg.total,
            speed: msg.speed,
            eta: msg.eta
          })
        }
        break
      }
      case 'log':
        this.journal.appendLog(msg.taskId, `[${new Date().toISOString()}] [${msg.level}] ${msg.line}`)
        this.notify('task:log', { taskId: msg.taskId, line: msg.line, level: msg.level, ts: Date.now() })
        return // 日志不触发 snapshot 更新
      case 'env-applied':
        j.steps['__env__'] = { state: 'done', detail: JSON.stringify(msg.changes) }
        break
      case 'task-done':
        this.finish(entry, msg.ok, msg.error === '__cancelled__' ? undefined : msg.error, msg.error === '__cancelled__')
        return
    }
    this.journal.save(j)
    snap.revision++
    snap.updatedAt = Date.now()
    this.notifyUpdated(snap)
  }

  private finish(entry: RunningTask, ok: boolean, error?: string, cancelled = false): void {
    const snap = entry.snapshot
    snap.status = cancelled ? 'cancelled' : ok ? 'success' : 'failed'
    snap.error = error
    snap.finishedAt = Date.now()
    snap.revision++
    snap.resumable = !ok && !cancelled && (snap.kind === 'install' || snap.kind === 'resume-install')
    for (const s of snap.steps) {
      if (s.state === 'running' || s.state === 'pending') {
        if (snap.status === 'cancelled' || snap.status === 'failed') s.state = s.state === 'running' ? 'failed' : 'pending'
      }
    }
    if (error) entry.journal.error = error
    this.journal.save(entry.journal)
    this.running.delete(snap.taskId)
    this.finished.set(snap.taskId, snap)
    this.notifyUpdated(snap)
    try {
      entry.child.kill()
    } catch { /* 忽略 */ }
    this.updatePowerSave()
    this.pump()
    this.onFinished?.(snap)
  }

  private notifyUpdated(snap: TaskSnapshot): void {
    this.notify('task:updated', { task: snap })
  }

  newTaskId(): string {
    return `task-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  }
}
