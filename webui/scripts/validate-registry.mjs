#!/usr/bin/env node
// 逐地区校验 registry/ 下的软件源 JSON（结构 / 引用一致性 / URL 安全）
// 用法：node scripts/validate-registry.mjs
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const registryRoot = path.resolve(process.cwd(), 'registry')
let failed = 0
const err = (msg) => {
  console.error(`  ✗ ${msg}`)
  failed++
}
const ok = (msg) => console.log(`  ✓ ${msg}`)

const STEP_TYPES = new Set([
  'download',
  'extract',
  'move',
  'copy',
  'fs.mkdir',
  'fs.delete',
  'env.set',
  'env.path.prepend',
  'env.path.remove',
  'env.apply',
  'verify',
  'shell.run',
  'git.clone',
  'cleanup',
  'builtin.link-current',
  'builtin.unlink-current'
])

function checkCond(cond, msg) {
  if (cond) ok(msg)
  else err(msg)
}

// 平台键：`${os}` 通用 或 `${os}-${arch}` 架构专属；OS 与架构支持常见别名
const OS_KEYS = ['windows', 'win', 'win32', 'win64', 'darwin', 'mac', 'macos', 'osx', 'linux']
const ARCH_KEYS = [
  'x64',
  'x86_64',
  'x86-64',
  'amd64',
  'arm64',
  'aarch64',
  'x86',
  'ia32',
  'i386',
  'i686',
  'arm',
  'armv7l',
  'armhf'
]

function validPlatformKey(key) {
  const [os, arch] = key.toLowerCase().split('-')
  if (!OS_KEYS.includes(os)) return false
  return arch === undefined || ARCH_KEYS.includes(arch)
}

function validatePlatforms(platforms, defaultVersion, label) {
  for (const [platKey, plat] of Object.entries(platforms ?? {})) {
    checkCond(validPlatformKey(platKey), `${label}${platKey}: 平台键为 <os> 或 <os>-<arch>`)
    checkCond(
      ['zip', 'tar.gz', 'tar.xz', 'exe', 'msi', 'msix', 'dmg', 'pkg', 'rpm', 'deb', 'appimage', 'raw', undefined].includes(
        plat.archive
      ),
      `${label}${platKey}: archive 合法`
    )
    const assets = plat.assets ?? {}
    checkCond(Object.keys(assets).length > 0, `${label}${platKey}: assets 非空`)
    for (const [ver, asset] of Object.entries(assets)) {
      checkCond(/^https?:\/\//.test(asset.url ?? ''), `${label}${platKey}@${ver}: url 为 http(s)`)
      if (asset.sha256 !== undefined) {
        checkCond(/^[a-f0-9]{64}$/i.test(asset.sha256), `${label}${platKey}@${ver}: sha256 为 64 位 hex`)
      }
      if (asset.md5 !== undefined) {
        checkCond(/^[a-f0-9]{32}$/i.test(asset.md5), `${label}${platKey}@${ver}: md5 为 32 位 hex`)
      }
      if (asset.sha1 !== undefined) {
        checkCond(/^[a-f0-9]{40}$/i.test(asset.sha1), `${label}${platKey}@${ver}: sha1 为 40 位 hex`)
      }
      for (const mir of asset.mirrors ?? []) {
        const url = typeof mir === 'string' ? mir : mir?.url
        checkCond(/^https?:\/\//.test(url ?? ''), `${label}${platKey}@${ver}: 镜像 url 为 http(s)`)
        if (typeof mir !== 'string') {
          checkCond(typeof mir?.name === 'string' && mir.name.length > 0, `${label}${platKey}@${ver}: 镜像 name 非空`)
          checkCond(
            mir?.size === undefined || (typeof mir.size === 'number' && mir.size >= 0),
            `${label}${platKey}@${ver}: 镜像 size 为非负数字`
          )
        }
      }
    }
    checkCond(!defaultVersion || defaultVersion in assets, `${label}${platKey}: defaultVersion(${defaultVersion}) 在 assets 中`)
    for (const flow of ['install', 'activate', 'uninstall']) {
      for (const step of plat.workflowOverrides?.[flow] ?? []) {
        checkCond(STEP_TYPES.has(step.type), `${label}${platKey}: 步骤类型合法 ${step.type}`)
        checkCond(step.type !== 'verify' || typeof step.run === 'string', `${label}${platKey}: verify 需要带 run`)
      }
    }
  }
}

function validateIndex(regionDir) {
  const indexFile = path.join(regionDir, 'index.json')
  console.log(`\n== ${path.relative(registryRoot, indexFile)}`)
  if (!fs.existsSync(indexFile)) {
    err(`缺少 index.json`)
    return null
  }
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'))
  checkCond(index.schemaVersion === 1, 'schemaVersion === 1')
  checkCond(typeof index.name === 'string' && index.name.length > 0, 'name 非空')
  checkCond(Array.isArray(index.tools) && index.tools.length > 0, 'tools 非空')

  // categories（与 tools 平级，可选）：编码 + 名称；工具引用的分类应在此定义
  const definedCategories = new Set()
  if (index.categories !== undefined) {
    checkCond(Array.isArray(index.categories) && index.categories.length > 0, 'categories 为非空数组')
    for (const c of index.categories ?? []) {
      checkCond(typeof c?.code === 'string' && c.code.length > 0, `category code 非空: ${c?.code}`)
      checkCond(typeof c?.name === 'string' && c.name.length > 0, `category name 非空: ${c?.name}`)
      if (typeof c?.code === 'string') definedCategories.add(c.code)
    }
  }

  const ids = new Set()
  for (const t of index.tools ?? []) {
    checkCond(/^[a-z][a-z0-9-]{1,31}$/.test(t.id ?? ''), `工具 id 合法: ${t.id}`)
    if (ids.has(t.id)) err(`工具 id 重复: ${t.id}`)
    ids.add(t.id)
    checkCond(typeof t.name === 'string' && t.name.length > 0, `${t.id}: name 非空`)
    if (t.category) {
      checkCond(typeof t.category === 'string' && t.category.length > 0, `${t.id}: category 非空`)
      if (index.categories !== undefined && !definedCategories.has(t.category)) {
        console.warn(`  ⚠ ${t.id}: category(${t.category}) 未在 categories 中定义，工具箱不会显示对应过滤 tab`)
      }
    }
    checkCond(t.icon === undefined || /^https?:\/\//.test(t.icon), `${t.id}: icon 为 http(s) 链接`)
    checkCond(typeof t.manifest === 'string' && t.manifest.length > 0, `${t.id}: manifest 路径非空`)
  }
  return index
}

function validateManifest(regionDir, index, tool) {
  const file = path.join(regionDir, tool.manifest)
  console.log(`\n== ${path.relative(registryRoot, file)}`)
  if (!fs.existsSync(file)) return err(`清单文件不存在: ${tool.manifest}`)
  const m = JSON.parse(fs.readFileSync(file, 'utf-8'))
  checkCond(m.schemaVersion === 1, 'schemaVersion === 1')
  checkCond(m.id === tool.id, `id 与 index 一致 (${m.id} / ${tool.id})`)
  checkCond(/^[a-z][a-z0-9-]{1,31}$/.test(m.id ?? ''), 'id 合法')
  const hasPlatforms = m.platforms && Object.keys(m.platforms).length > 0
  const hasDists = m.distributions && Object.keys(m.distributions).length > 0
  checkCond(hasPlatforms || hasDists, 'platforms 或 distributions 至少其一')
  checkCond(!m.defaultVersion || typeof m.defaultVersion === 'string', 'defaultVersion 为字符串')

  if (hasPlatforms) validatePlatforms(m.platforms, m.defaultVersion, '')

  for (const [distId, dist] of Object.entries(m.distributions ?? {})) {
    checkCond(/^[a-z][a-z0-9-]{0,31}$/.test(distId), `发行商 id 合法: ${distId}`)
    checkCond(typeof dist.name === 'string' && dist.name.length > 0, `${distId}: name 非空`)
    const dp = dist.platforms ?? {}
    checkCond(Object.keys(dp).length > 0, `${distId}: platforms 非空`)
    validatePlatforms(dp, dist.defaultVersion, `${distId}/`)
  }

  for (const ver of Object.keys(m.versionOverrides ?? {})) {
    checkCond(typeof m.versionOverrides[ver] === 'object', `versionOverrides.${ver} 为对象`)
  }

  const env = m.env ?? {}
  checkCond(Array.isArray(env.vars ?? []), 'env.vars 为数组')
  for (const v of env.vars ?? []) {
    checkCond(typeof v.name === 'string' && v.name.length > 0, 'env var 名称非空')
    checkCond(typeof v.value === 'string', `env var ${v.name} 值为字符串`)
  }
  for (const d of env.pathDirs ?? []) {
    checkCond(!path.isAbsolute(d) && !d.includes('..'), `pathDirs 相对且安全: ${d}`)
  }
}

const regionsFile = path.join(registryRoot, 'regions.json')
if (!fs.existsSync(regionsFile)) {
  console.error(`✗ 未找到 ${regionsFile}`)
  process.exit(1)
}
const { regions } = JSON.parse(fs.readFileSync(regionsFile, 'utf-8'))
checkCond(Array.isArray(regions) && regions.length > 0, 'regions.json: regions 非空')

for (const region of regions) {
  const regionDir = path.join(registryRoot, region.code)
  console.log(`\n### 地区 ${region.code}`)
  if (!fs.existsSync(regionDir)) {
    err(`地区目录不存在: ${region.code}`)
    continue
  }
  const index = validateIndex(regionDir)
  if (!index) continue
  for (const tool of index.tools) validateManifest(regionDir, index, tool)
}

console.log(`\n${failed === 0 ? '✅ 软件源校验通过' : `❌ ${failed} 项错误`}`)
process.exit(failed === 0 ? 0 : 1)
