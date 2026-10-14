// 环境变量计划生成与 PATH 托管策略测试
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BLOCK_BEGIN, BLOCK_END, buildEnvPlan, extractManagedEntries, rebuildPath, renderManagedBlock } from '../src/main/services/env/planner'
import { makeVersionKey, splitVersionKey } from '../src/shared/template'

const javaEnv = {
  vars: [{ name: 'JAVA_HOME', value: '{{currentDir}}', expand: true }],
  pathDirs: ['bin']
}

describe('buildEnvPlan', () => {
  it('安装目录在用户目录下时渲染 %USERPROFILE% PATH 条目', () => {
    const toolsDir = path.join(os.homedir(), '.hienvs', 'tools')
    const plan = buildEnvPlan({
      activeTools: [{ toolId: 'java', version: '21.0.5+11', env: javaEnv }],
      scope: 'user',
      platform: 'windows',
      toolsDir
    })
    expect(plan.vars).toEqual([
      { name: 'JAVA_HOME', value: path.join(toolsDir, 'java', 'current'), expand: true }
    ])
    const rel = path.relative(os.homedir(), path.join(toolsDir, 'java', 'current', 'bin')).split(path.sep).join('\\')
    expect(plan.pathEntries).toEqual([`%USERPROFILE%\\${rel}`])
    expect(plan.rcFiles).toEqual([])
  })

  it('安装目录在用户目录外时使用绝对 PATH 条目', () => {
    const toolsDir = path.join('D:', 'dev-tools')
    const plan = buildEnvPlan({
      activeTools: [{ toolId: 'java', version: '21.0.5+11', env: javaEnv }],
      scope: 'user',
      platform: 'windows',
      toolsDir
    })
    expect(plan.pathEntries).toEqual([path.join(toolsDir, 'java', 'current', 'bin')])
  })

  it('非 Windows 使用绝对 PATH 条目', () => {
    const toolsDir = path.join('/', 'Users', 't', '.hienvs', 'tools')
    const plan = buildEnvPlan({
      activeTools: [{ toolId: 'go', version: '1.23.4', env: { vars: [{ name: 'GOROOT', value: '{{currentDir}}' }], pathDirs: ['bin'] } }],
      scope: 'user',
      platform: 'darwin',
      toolsDir
    })
    expect(plan.vars[0].value).toBe(path.join(toolsDir, 'go', 'current'))
    expect(plan.pathEntries[0]).toBe(path.join(toolsDir, 'go', 'current', 'bin'))
    expect(plan.rcFiles.length).toBeGreaterThan(0)
  })

  it('多发行商工具的 versionDir 含发行商层级，current 链接共享', () => {
    const toolsDir = path.join('D:', 'dev-tools')
    const envWithVersionDir = { vars: [{ name: 'JAVA_HOME', value: '{{versionDir}}' }], pathDirs: ['bin'] }
    const plan = buildEnvPlan({
      activeTools: [{ toolId: 'jdk', version: '21.0.5+11', dist: 'temurin', env: envWithVersionDir }],
      scope: 'user',
      platform: 'windows',
      toolsDir
    })
    expect(plan.vars[0].value).toBe(path.join(toolsDir, 'jdk', 'temurin', 'v21.0.5+11'))
    expect(plan.pathEntries[0]).toBe(path.join(toolsDir, 'jdk', 'current', 'bin'))
  })
})

describe('versionKey 复合键', () => {
  it('make/split 往返一致', () => {
    expect(makeVersionKey('temurin', '21.0.5+11')).toBe('temurin@21.0.5+11')
    expect(splitVersionKey('temurin@21.0.5+11')).toEqual({ dist: 'temurin', version: '21.0.5+11' })
  })
  it('裸版本无发行商', () => {
    expect(makeVersionKey(undefined, '3.9.9')).toBe('3.9.9')
    expect(splitVersionKey('3.9.9')).toEqual({ version: '3.9.9' })
  })
})

describe('renderManagedBlock', () => {
  it('生成带标记的托管块', () => {
    const block = renderManagedBlock({
      scope: 'user',
      platform: 'linux',
      vars: [{ name: 'JAVA_HOME', value: '/opt/java' }],
      pathEntries: ['/opt/java/bin'],
      rcFiles: []
    })
    expect(block.startsWith(BLOCK_BEGIN)).toBe(true)
    expect(block.endsWith(BLOCK_END)).toBe(true)
    expect(block).toContain('export JAVA_HOME="/opt/java"')
    expect(block).toContain('export PATH="/opt/java/bin":$PATH')
  })
  it('空计划返回空串', () => {
    expect(renderManagedBlock({ scope: 'user', platform: 'linux', vars: [], pathEntries: [], rcFiles: [] })).toBe('')
  })
})

describe('rebuildPath', () => {
  const delimiter = path.delimiter

  it('剔除托管条目并插回原托管位置', () => {
    const out = rebuildPath(['/a', '/home/.hienvs/tools/java/current/bin', '/b'].join(delimiter), ['/home/.hienvs/tools/java/current/bin'], delimiter, false)
    expect(out).toBe(['/a', '/home/.hienvs/tools/java/current/bin', '/b'].join(delimiter))
  })

  it('无托管条目时插到最前', () => {
    const out = rebuildPath(['/a', '/b'].join(delimiter), ['/new/bin'], delimiter, false)
    expect(out).toBe(['/new/bin', '/a', '/b'].join(delimiter))
  })

  it('识别 %USERPROFILE% 形式（Windows 大小写不敏感），保持原相对位置', () => {
    const current = 'C:\\tools;%USERPROFILE%\\.hienvs\\tools\\java\\current\\bin'
    const out = rebuildPath(current, ['%USERPROFILE%\\.hienvs\\tools\\java\\current\\bin'], ';', true)
    expect(out).toBe('C:\\tools;%USERPROFILE%\\.hienvs\\tools\\java\\current\\bin')
  })

  it('切换版本时旧托管条目被剔除、新条目接管原位置', () => {
    const current = ['/home/.hienvs/tools/java/current/bin', '/a'].join(delimiter)
    const out = rebuildPath(current, ['/home/.hienvs/tools/java/v11/bin'], delimiter, false)
    expect(out).toBe(['/home/.hienvs/tools/java/v11/bin', '/a'].join(delimiter))
  })
})

describe('extractManagedEntries', () => {
  it('提取包含 current 的 .hienvs 条目', () => {
    const entries = extractManagedEntries(['/a', '/h/.hienvs/tools/java/current/bin', '/h/.hienvs/cache'].join(':'), ':')
    expect(entries).toEqual(['/h/.hienvs/tools/java/current/bin'])
  })
})
