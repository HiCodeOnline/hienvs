// platform-match 单元测试：架构归一化与平台键匹配
import { describe, expect, it } from 'vitest'
import { matchPlatform, normalizeArch, parsePlatformKey } from '../src/main/registry/platform-match'

describe('normalizeArch', () => {
  it('归一化常见 process.arch 值', () => {
    expect(normalizeArch('x64')).toBe('x64')
    expect(normalizeArch('arm64')).toBe('arm64')
    expect(normalizeArch('ia32')).toBe('x86')
    expect(normalizeArch('arm')).toBe('arm')
  })

  it('未知架构原样透传', () => {
    expect(normalizeArch('loong64')).toBe('loong64')
  })
})

describe('parsePlatformKey', () => {
  it('解析裸 OS 键', () => {
    expect(parsePlatformKey('windows')).toEqual({ os: 'windows' })
    expect(parsePlatformKey('linux')).toEqual({ os: 'linux' })
  })

  it('OS 别名归一化', () => {
    expect(parsePlatformKey('mac')).toEqual({ os: 'darwin' })
    expect(parsePlatformKey('win32')).toEqual({ os: 'windows' })
    expect(parsePlatformKey('osx')).toEqual({ os: 'darwin' })
  })

  it('解析 OS-ARCH 组合键（含别名）', () => {
    expect(parsePlatformKey('darwin-arm64')).toEqual({ os: 'darwin', arch: 'arm64' })
    expect(parsePlatformKey('linux-aarch64')).toEqual({ os: 'linux', arch: 'arm64' })
    expect(parsePlatformKey('windows-amd64')).toEqual({ os: 'windows', arch: 'x64' })
    expect(parsePlatformKey('win-ia32')).toEqual({ os: 'windows', arch: 'x86' })
  })

  it('非法键返回 null', () => {
    expect(parsePlatformKey('sunos-x64')).toBeNull()
    expect(parsePlatformKey('windows-x64-extra')).toBeNull()
  })
})

describe('matchPlatform', () => {
  const platforms = {
    'windows-x64': { assets: { '1.0': { url: 'https://a/x64.zip' } } },
    'windows-x86': { assets: { '1.0': { url: 'https://a/x86.zip' } } },
    windows: { assets: { '1.0': { url: 'https://a/generic.zip' } } },
    'linux-arm64': { assets: { '1.0': { url: 'https://a/arm64.tar.gz' } } }
  }

  it('优先精确架构键', () => {
    expect(matchPlatform(platforms, 'windows', 'x64')).toBe(platforms['windows-x64'])
    expect(matchPlatform(platforms, 'windows', 'x86')).toBe(platforms['windows-x86'])
  })

  it('无精确键时回退通用键', () => {
    expect(matchPlatform(platforms, 'windows', 'arm64')).toBe(platforms.windows)
  })

  it('绝不跨架构回退：arm64 机器不匹配 x64 专属键', () => {
    const noGeneric = { 'linux-x64': { assets: { v: { url: 'https://a/x' } } } }
    expect(matchPlatform(noGeneric, 'linux', 'arm64')).toBeUndefined()
  })

  it('undefined 平台表安全返回', () => {
    expect(matchPlatform(undefined, 'windows', 'x64')).toBeUndefined()
  })
})
