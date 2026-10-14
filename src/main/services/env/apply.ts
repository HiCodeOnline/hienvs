// env.apply 步骤实现：将 EnvPlan 应用到系统（Worker 中执行；主进程预览复用读取函数）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TaskContext, StepRunHelpers } from '../../engine/types'
import type { EnvChangeItem, EnvPlan } from '@shared/task-types'
import { rebuildPath, renderManagedBlock } from './planner'
import {
  readWindowsVar,
  writeWindowsVar,
  deleteWindowsVar,
  broadcastEnvChange,
  applySystemElevated
} from './apply-windows'
import {
  readManagedBlock,
  writeManagedBlock,
  restoreManagedBlock,
  writeEnvironmentD,
  parseBlockVars,
  parseBlockPathEntries
} from './apply-unix'

/** 计算并应用环境变量计划，返回变更列表（含旧值供回滚） */
export async function applyEnvPlan(ctx: TaskContext, run: StepRunHelpers): Promise<EnvChangeItem[]> {
  const plan = ctx.envPlan
  if (!plan) {
    run.log('无环境变量计划，跳过')
    return []
  }
  if (ctx.platform === 'windows') return applyWindows(plan, run)
  return applyUnix(plan, ctx, run)
}

async function applyWindows(plan: EnvPlan, run: StepRunHelpers): Promise<EnvChangeItem[]> {
  const scope = plan.scope
  const changes: EnvChangeItem[] = []
  const undoFns: (() => Promise<void>)[] = []

  const oldValues = new Map<string, string | undefined>()
  for (const v of plan.vars) {
    oldValues.set(v.name, await readWindowsVar(v.name, scope))
  }
  const oldPath = (await readWindowsVar('Path', scope)) ?? ''
  const newPath = rebuildPath(oldPath, plan.pathEntries, ';', true)
  const pathChanged = newPath !== oldPath

  for (const v of plan.vars) {
    const old = oldValues.get(v.name)
    if (old !== v.value) {
      changes.push({ kind: 'var', name: v.name, oldValue: old, newValue: v.value, hadOldValue: old !== undefined })
      undoFns.push(async () => {
        if (old === undefined) await deleteWindowsVar(v.name, scope)
        else await writeWindowsVar({ name: v.name, value: old, expand: true }, scope)
      })
    }
  }
  if (pathChanged) {
    changes.push({ kind: 'path', name: 'Path', oldValue: oldPath, newValue: newPath, hadOldValue: true })
    undoFns.push(async () => {
      await writeWindowsVar({ name: 'Path', value: oldPath, expand: true }, scope)
    })
  }

  if (changes.length === 0) {
    run.log('环境变量无变化')
    return []
  }

  if (scope === 'system') {
    const deletes = changes.filter((c) => c.kind === 'var' && !c.newValue).map((c) => c.name)
    const specs = plan.vars.filter((v) => v.value !== '').map((v) => ({ name: v.name, value: v.value, expand: v.expand }))
    await applySystemElevated(specs, deletes, pathChanged ? newPath : null, (m) => run.log(m))
  } else {
    for (const v of plan.vars) {
      if (v.value === '') {
        await deleteWindowsVar(v.name, scope)
      } else {
        await writeWindowsVar(v, scope)
      }
    }
    if (pathChanged) {
      await writeWindowsVar({ name: 'Path', value: newPath, expand: true }, scope)
    }
    await broadcastEnvChange()
  }

  for (const fn of undoFns) run.undo(async () => fn())
  return changes
}

async function applyUnix(plan: EnvPlan, ctx: TaskContext, run: StepRunHelpers): Promise<EnvChangeItem[]> {
  const block = renderManagedBlock(plan)
  const changes: EnvChangeItem[] = []
  const undoFns: (() => void)[] = []
  const home = os.homedir()

  const primaryRc = plan.rcFiles[0]
  const oldBlock = primaryRc ? readManagedBlock(primaryRc) : null

  const oldVars = parseBlockVars(oldBlock)
  const oldPathEntries = parseBlockPathEntries(oldBlock)
  for (const v of plan.vars) {
    const old = oldVars.find((o) => o.name === v.name)
    if (!old || old.value !== v.value) {
      changes.push({ kind: 'var', name: v.name, oldValue: old?.value, newValue: v.value, hadOldValue: !!old })
    }
  }
  const oldEntries = new Set(oldPathEntries.map((e) => e.replace(/^"|"$/g, '')))
  for (const e of plan.pathEntries) {
    if (!oldEntries.has(e)) changes.push({ kind: 'path', name: e, oldValue: undefined, newValue: e, hadOldValue: false })
  }

  if (changes.length === 0 && (oldBlock ?? '') === block) {
    run.log('环境变量无变化')
    return []
  }

  for (const file of plan.rcFiles) {
    const prev = readManagedBlock(file)
    writeManagedBlock(file, block)
    undoFns.push(() => restoreManagedBlock(file, prev))
  }

  if (ctx.platform === 'linux') {
    const lines: string[] = []
    for (const v of plan.vars) lines.push(`${v.name}="${v.value}"`)
    if (plan.pathEntries.length) {
      lines.push(`PATH="${plan.pathEntries.join(':')}:$PATH"`)
    }
    writeEnvironmentD(home, lines)
  }

  for (const fn of undoFns) run.undo(async () => fn())
  return changes
}

/** 主进程预览用：计算变更（不写入） */
export async function previewEnvPlan(plan: EnvPlan, currentBlock: string | null, currentPathRaw: string | null): Promise<EnvChangeItem[]> {
  const changes: EnvChangeItem[] = []
  if (plan.platform === 'windows') {
    for (const v of plan.vars) {
      changes.push({ kind: 'var', name: v.name, newValue: v.value, hadOldValue: false })
    }
    if (currentPathRaw !== null && plan.pathEntries.length) {
      const newPath = rebuildPath(currentPathRaw, plan.pathEntries, ';', true)
      if (newPath !== currentPathRaw) {
        changes.push({ kind: 'path', name: 'Path', oldValue: currentPathRaw, newValue: newPath, hadOldValue: true })
      }
    }
    return changes
  }
  const oldVars = parseBlockVars(currentBlock)
  for (const v of plan.vars) {
    const old = oldVars.find((o) => o.name === v.name)
    if (!old || old.value !== v.value) {
      changes.push({ kind: 'var', name: v.name, oldValue: old?.value, newValue: v.value, hadOldValue: !!old })
    }
  }
  const oldEntries = new Set(parseBlockPathEntries(currentBlock))
  for (const e of plan.pathEntries) {
    if (!oldEntries.has(e)) changes.push({ kind: 'path', name: e, newValue: e, hadOldValue: false })
  }
  return changes
}

/** 供主进程读取托管 PATH 条目 */
export function readWindowsUserPath(): Promise<string | undefined> {
  return readWindowsVar('Path', 'user')
}

export function unixManagedBlockFiles(): string[] {
  const home = os.homedir()
  if (process.platform === 'darwin') return [path.join(home, '.zshrc'), path.join(home, '.zprofile')]
  const shell = process.env.SHELL ?? '/bin/bash'
  if (shell.includes('zsh')) return [path.join(home, '.zshrc'), path.join(home, '.zprofile')]
  return [path.join(home, '.bashrc'), path.join(home, '.profile')]
}

export { readManagedBlock, parseBlockVars, parseBlockPathEntries } from './apply-unix'
