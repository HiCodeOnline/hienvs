// 目录约定：状态/日志/缓存固定在 ~/.hienvs；安装目录与下载目录可配置（主进程与 Worker 共用，仅依赖 node 内置模块）
import os from 'node:os'
import path from 'node:path'

export function defaultHienvsHome(): string {
  return path.join(os.homedir(), '.hienvs')
}

export interface HienvsPaths {
  home: string
  toolsDir: string
  cacheDir: string
  downloadsDir: string
  tmpDir: string
  stateDir: string
  tasksDir: string
  logsDir: string
  appStateFile: string
  installedFile: string
}

export function buildPaths(opts: { home: string; installDir: string; downloadDir: string }): HienvsPaths {
  const { home, installDir, downloadDir } = opts
  return {
    home,
    toolsDir: installDir,
    cacheDir: path.join(home, 'cache'),
    downloadsDir: downloadDir,
    tmpDir: path.join(home, 'cache', 'tmp'),
    stateDir: path.join(home, 'state'),
    tasksDir: path.join(home, 'state', 'tasks'),
    logsDir: path.join(home, 'logs'),
    appStateFile: path.join(home, 'state', 'settings.json'),
    installedFile: path.join(home, 'state', 'installed.json')
  }
}

export const REGISTRY_DIRNAME = 'registry'
