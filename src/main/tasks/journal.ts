// 任务日志与 journal 持久化
import fs from 'node:fs'
import path from 'node:path'
import type { TaskKind, StepState } from '@shared/task-types'

export interface JournalStepState {
  state: StepState
  error?: string
  detail?: string
}

export interface JournalData {
  taskId: string
  kind: TaskKind
  toolId: string
  toolName: string
  version?: string
  createdAt: number
  updatedAt: number
  error?: string
  steps: Record<string, JournalStepState>
}

export class JournalStore {
  constructor(private tasksDir: string, private logsDir: string) {
    fs.mkdirSync(tasksDir, { recursive: true })
    fs.mkdirSync(logsDir, { recursive: true })
  }

  private file(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}.json`)
  }

  loadAll(): JournalData[] {
    try {
      return fs
        .readdirSync(this.tasksDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(this.tasksDir, f), 'utf-8')) as JournalData
          } catch {
            return null
          }
        })
        .filter((j): j is JournalData => j !== null)
    } catch {
      return []
    }
  }

  load(taskId: string): JournalData | null {
    try {
      const f = this.file(taskId)
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8')) as JournalData
    } catch { /* 忽略 */ }
    return null
  }

  create(data: Omit<JournalData, 'steps' | 'createdAt' | 'updatedAt'> & { steps?: Record<string, JournalStepState> }): JournalData {
    const j: JournalData = {
      ...data,
      steps: data.steps ?? {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    this.save(j)
    return j
  }

  save(j: JournalData): void {
    j.updatedAt = Date.now()
    try {
      fs.writeFileSync(this.file(j.taskId), JSON.stringify(j), 'utf-8')
    } catch { /* 忽略 */ }
  }

  remove(taskId: string): void {
    try {
      fs.rmSync(this.file(taskId), { force: true })
      fs.rmSync(this.logFile(taskId), { force: true })
    } catch { /* 忽略 */ }
  }

  logFile(taskId: string): string {
    return path.join(this.logsDir, `${taskId}.log`)
  }

  appendLog(taskId: string, line: string): void {
    try {
      fs.appendFileSync(this.logFile(taskId), line + '\n')
    } catch { /* 忽略 */ }
  }

  readLog(taskId: string, offset: number): { lines: string[]; nextOffset: number } {
    const file = this.logFile(taskId)
    try {
      if (!fs.existsSync(file)) return { lines: [], nextOffset: offset }
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''))
      return { lines: lines.slice(offset, offset + 500), nextOffset: Math.min(offset + 500, lines.length) }
    } catch {
      return { lines: [], nextOffset: offset }
    }
  }
}
