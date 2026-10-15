#!/usr/bin/env node
// 把 registry/<region>/** 同步到 public/<region>/**，使 dev 与 build 都能从
// /<region>/index.json、/<region>/tools/<id>.json 命中可被客户端拉取的软件源 JSON。
// 用法：node scripts/sync-registry.mjs
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const registryRoot = path.join(root, 'registry')
const publicRoot = path.join(root, 'public')

const regionsFile = path.join(registryRoot, 'regions.json')
if (!fs.existsSync(regionsFile)) {
  console.error(`✗ 未找到 ${regionsFile}`)
  process.exit(1)
}
const { regions } = JSON.parse(fs.readFileSync(regionsFile, 'utf-8'))

// 仅清理并重建由本脚本生成的地区目录，避免影响 public/ 下其它站点资源
fs.mkdirSync(publicRoot, { recursive: true })
for (const region of regions) {
  fs.rmSync(path.join(publicRoot, region.code), { recursive: true, force: true })
}

for (const region of regions) {
  const src = path.join(registryRoot, region.code)
  if (!fs.existsSync(path.join(src, 'index.json'))) {
    console.error(`✗ 地区缺少 index.json: ${region.code}`)
    process.exit(1)
  }
  fs.cpSync(src, path.join(publicRoot, region.code), { recursive: true })
  console.log(`✓ 同步地区 ${region.code} -> public/${region.code}`)
}

console.log('✅ 软件源同步完成')
