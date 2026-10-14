// 模板渲染与版本比较测试
import { describe, expect, it } from 'vitest'
import { collectVars, compareVersions, currentOsName, renderDeep, renderTemplate, safeVersionSegment } from '../src/shared/template'

describe('renderTemplate', () => {
  it('替换已知变量', () => {
    expect(renderTemplate('hello {{name}}!', { name: 'hienvs' })).toBe('hello hienvs!')
    expect(renderTemplate('{{a}}/{{b}}', { a: 1, b: 'x' })).toBe('1/x')
  })
  it('容忍空白', () => {
    expect(renderTemplate('{{ name }}', { name: 'v' })).toBe('v')
  })
  it('未知变量抛错', () => {
    expect(() => renderTemplate('{{missing}}', {})).toThrow(/无法解析/)
  })
  it('空值抛错', () => {
    expect(() => renderTemplate('{{v}}', { v: null })).toThrow()
    expect(() => renderTemplate('{{v}}', { v: undefined })).toThrow()
  })
})

describe('renderDeep', () => {
  it('递归渲染对象与数组', () => {
    const out = renderDeep({ a: '{{x}}', list: ['{{x}}', 2], nested: { b: '{{x}}' } }, { x: 'V' })
    expect(out).toEqual({ a: 'V', list: ['V', 2], nested: { b: 'V' } })
  })
  it('未知变量在深层抛错', () => {
    expect(() => renderDeep({ a: ['{{nope}}'] }, {})).toThrow(/nope/)
  })
})

describe('collectVars', () => {
  it('收集变量名', () => {
    expect(collectVars('{{a}} and {{b}} twice {{a}}')).toEqual(['a', 'b', 'a'])
    expect(collectVars('none')).toEqual([])
  })
})

describe('safeVersionSegment', () => {
  it('保留常见版本字符', () => {
    expect(safeVersionSegment('21.0.5+11')).toBe('21.0.5+11')
    expect(safeVersionSegment('1.2.3-rc.1')).toBe('1.2.3-rc.1')
  })
  it('替换不安全字符', () => {
    expect(safeVersionSegment('a/b\\c:d')).toBe('a_b_c_d')
  })
})

describe('compareVersions', () => {
  it('按数字段比较', () => {
    expect(compareVersions('1.23.4', '1.9.0')).toBe(1)
    expect(compareVersions('21.0.5', '21.0.11')).toBe(-1)
    expect(compareVersions('3.9.9', '3.9.9')).toBe(0)
  })
  it('带后缀比较', () => {
    expect(compareVersions('11.0.25+9', '11.0.25+10')).toBe(-1)
  })
})

describe('currentOsName', () => {
  it('映射进程平台名', () => {
    expect(currentOsName('win32')).toBe('windows')
    expect(currentOsName('darwin')).toBe('darwin')
    expect(currentOsName('linux')).toBe('linux')
  })
})
