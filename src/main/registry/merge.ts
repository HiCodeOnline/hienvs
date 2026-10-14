// 工作流三层合并：tool.workflows ⊕ platform.workflowOverrides ⊕ versionOverrides[v].workflowOverrides
// 合并规则：按步骤 id 浅合并；insertBefore/insertAfter 插入；remove: true 显式删除
import type { ManifestStep, WorkflowDef } from '@shared/registry-types'

export interface MergeResult {
  steps: ManifestStep[]
  warnings: string[]
}

interface Layer {
  steps: ManifestStep[]
}

export function mergeWorkflow(base: ManifestStep[] | undefined, layers: (WorkflowDef | undefined)[]): MergeResult {
  const warnings: string[] = []
  let steps: ManifestStep[] = (base ?? []).map((s) => ({ ...s }))

  const ensureIds = (): void => {
    steps = steps.map((s, i) => {
      if (!s.id) {
        warnings.push(`步骤缺少 id，自动生成: ${s.type}#${i}`)
        return { ...s, id: `${s.type}#${i}` }
      }
      return s
    })
  }
  ensureIds()

  for (const layer of layers) {
    const incoming = layer?.install ?? []
    // 1. 删除
    for (const inc of incoming) {
      if (inc.remove && inc.id) {
        steps = steps.filter((s) => s.id !== inc.id)
      }
    }
    // 2. 浅合并同 id
    for (const inc of incoming) {
      if (!inc.id || inc.remove) continue
      const idx = steps.findIndex((s) => s.id === inc.id)
      if (idx >= 0) {
        steps[idx] = { ...steps[idx], ...inc, id: inc.id }
      }
    }
    // 3. 插入新步骤（insertBefore / insertAfter / 追加）
    for (const inc of incoming) {
      if (inc.remove) continue
      const exists = steps.some((s) => s.id === inc.id && !inc.insertBefore && !inc.insertAfter)
      if (exists) continue
      if (inc.insertBefore) {
        const idx = steps.findIndex((s) => s.id === inc.insertBefore)
        if (idx >= 0) {
          steps.splice(idx, 0, { ...inc })
          continue
        }
        warnings.push(`insertBefore ${inc.insertBefore} 未找到，步骤 ${inc.id ?? inc.type} 追加到末尾`)
      }
      if (inc.insertAfter) {
        const idx = steps.findIndex((s) => s.id === inc.insertAfter)
        if (idx >= 0) {
          steps.splice(idx + 1, 0, { ...inc })
          continue
        }
        warnings.push(`insertAfter ${inc.insertAfter} 未找到，步骤 ${inc.id ?? inc.type} 追加到末尾`)
      }
      steps.push({ ...inc })
    }
    ensureIds()
  }

  return { steps, warnings }
}

/** 步骤展示标题：中文语义化 */
export function stepTitle(step: ManifestStep): string {
  const titles: Record<string, string> = {
    download: '下载资源包',
    extract: '解压',
    move: '调整目录结构',
    copy: '复制文件',
    'fs.mkdir': '创建目录',
    'fs.delete': '清理文件',
    'env.set': '设置环境变量',
    'env.path.prepend': '前置 PATH',
    'env.path.remove': '移除 PATH',
    'env.apply': '应用环境变量',
    'env.remove-tool': '移除环境配置',
    verify: '验证安装',
    'git.clone': '克隆仓库',
    'shell.run': '执行命令',
    cleanup: '清理临时文件',
    'builtin.link-current': '切换激活版本',
    'builtin.unlink-current': '解除激活'
  }
  return titles[step.type] ?? step.type
}
