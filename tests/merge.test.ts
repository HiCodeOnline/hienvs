// 工作流三层合并测试
import { describe, expect, it } from 'vitest'
import { mergeWorkflow, stepTitle } from '../src/main/registry/merge'

const base = [
  { id: 'download', type: 'download', url: 'a' },
  { id: 'extract', type: 'extract', stripComponents: 1 }
]

describe('mergeWorkflow', () => {
  it('同 id 浅合并覆盖参数', () => {
    const { steps } = mergeWorkflow(base, [{ install: [{ id: 'extract', type: 'extract', to: '/tmp/x' }] }])
    expect(steps.find((s) => s.id === 'extract')).toMatchObject({ stripComponents: 1, to: '/tmp/x' })
    expect(steps).toHaveLength(2)
  })

  it('insertAfter 插入新步骤', () => {
    const { steps } = mergeWorkflow(base, [
      { install: [{ id: 'verify', insertAfter: 'extract', type: 'verify', run: 'java' }] }
    ])
    expect(steps.map((s) => s.id)).toEqual(['download', 'extract', 'verify'])
  })

  it('insertBefore 插入新步骤', () => {
    const { steps } = mergeWorkflow(base, [
      { install: [{ id: 'env.apply', insertBefore: 'extract', type: 'env.apply' }] }
    ])
    expect(steps.map((s) => s.id)).toEqual(['download', 'env.apply', 'extract'])
  })

  it('remove: true 删除步骤', () => {
    const { steps } = mergeWorkflow(base, [{ install: [{ id: 'download', type: 'download', remove: true }] }])
    expect(steps.map((s) => s.id)).toEqual(['extract'])
  })

  it('多层叠加（平台层 + 版本层）', () => {
    const { steps } = mergeWorkflow(base, [
      { install: [{ id: 'extract', type: 'extract', to: 'p1' }] },
      { install: [{ id: 'extract', type: 'extract', to: 'p2' }] }
    ])
    expect(steps.find((s) => s.id === 'extract')?.to).toBe('p2')
  })

  it('缺 id 自动生成并告警', () => {
    const { steps, warnings } = mergeWorkflow([{ type: 'cleanup' }], [])
    expect(steps[0].id).toContain('cleanup')
    expect(warnings.length).toBe(1)
  })

  it('base 未定义时取覆盖层', () => {
    const { steps } = mergeWorkflow(undefined, [{ install: [{ id: 'only', type: 'cleanup' }] }])
    expect(steps.map((s) => s.id)).toEqual(['only'])
  })
})

describe('stepTitle', () => {
  it('已知类型返回中文标题', () => {
    expect(stepTitle({ type: 'download' })).toBe('下载资源包')
    expect(stepTitle({ type: 'env.apply' })).toBe('应用环境变量')
  })
  it('未知类型返回原值', () => {
    expect(stepTitle({ type: 'mystery' })).toBe('mystery')
  })
})
