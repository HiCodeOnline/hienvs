# hienvs — 跨平台开发环境管理器实现计划

## Context（背景）

用户需要一款基于最新 Electron 的跨平台桌面应用，用于统一管理开发环境（Java、Maven、Go、Node.js 等首期四项）的多版本下载、安装、切换与卸载。核心特点是**工作流编排**：每个工具的安装过程（下载→校验→解压→配环境变量→验证）由**远程 JSON 清单（registry）**驱动，主进程内置通用工作流引擎执行步骤。清单同时提供一个可托管到 GitHub/Gitee 的独立仓库（`d:\workspace\hienvs-registry`），并随应用打包一份内置清单作离线兜底。

已与用户确认的决策：
- 前端：React 19 + TypeScript + Tailwind CSS 4 + Zustand 5（UI 中文，无 router，状态切换页面）
- 首期工具：Java (Temurin)、Maven、Go、Node.js（清单驱动，后续可扩展 Python/Flutter）
- 清单：远程 URL 拉取 + 内置兜底 + 本地文件夹源，远程优先合并；额外生成 GitHub 托管仓库结构
- 环境变量：默认用户级，可选系统级（Windows UAC 提权）
- 安装目录：`~/.hienvs/tools/<toolId>/v<version>`，`current` junction/symlink 指向激活版本

## 技术栈（当前最新版本）

| 依赖 | 版本 |
|---|---|
| electron | 44.7.0（windowStatePersistence、无 clipboard 模块、仅 macOS 13+/64位） |
| electron-vite | 5.0.0（无 externalizeDepsPlugin，嵌套配置须静态对象；preload 需 `build.externalizeDeps: false` 全量打包以支持 sandbox） |
| electron-builder | 26.x |
| react / vite / typescript | 19.3 / 8.3 / 7.x（tsgo 仅类型检查，转译由 esbuild） |
| tailwindcss / @tailwindcss/vite | 4.3（CSS-first：`@import "tailwindcss"` + `@theme`，无 tailwind.config.js） |
| zustand / zod / yauzl / tar-stream / lzma-native | 最新稳定 |

## 总体架构

```
Renderer (React+sandbox) ──window.api──► Preload (contextBridge) ──IPC──► Main (窗口/IPC/设置/注册表/任务调度)
                                                                            └─ utilityProcess.fork() ► Worker（下载/解压/工作流执行）
磁盘：~/.hienvs/{tools,cache,state,logs} + resources/registry（内置清单）
```

原则：**主进程不做重 IO**，下载/解压/命令执行全部在 utilityProcess Worker 中，崩溃隔离；事件经 MessagePort→主进程→`webContents.send` 转发渲染层。

## 目录结构

```
d:\workspace\hienvs\
├─ package.json / electron.vite.config.ts / electron-builder.yml / tsconfig*.json
├─ resources/registry/{index.json, tools/{java,maven,go,node}.json}   # 内置兜底清单（extraResources 打包）
├─ src/shared/          # ipc-channels.ts, registry-types.ts, task-types.ts, tool-types.ts, template.ts（零运行时依赖）
├─ src/main/
│  ├─ index.ts / window.ts / ipc/{registry,tools,tasks,settings,env}-ipc.ts
│  ├─ core/             # paths.ts（~/.hienvs 约定）、settings.ts、installed-store.ts、logger.ts
│  ├─ registry/         # schema.ts(zod)、sources.ts、loader.ts(多源合并/ETag缓存)、resolver.ts(计划编译)
│  ├─ tasks/            # manager.ts(队列/并发2/取消)、journal.ts(步骤级断点续跑)、worker-host.ts
│  ├─ engine/           # executor.ts、context.ts(模板变量)、steps/{download,extract,move,fs-ops,env,verify,git-clone,shell-run,cleanup}.ts
│  ├─ services/         # activator.ts(junction/symlink)、detector.ts
│  └─ worker/           # index.ts(utilityProcess入口)、downloader.ts、extractor/{zip,tar,tarxz}.ts
├─ src/preload/index.ts + index.d.ts   # contextBridge 白名单 API
└─ src/renderer/src/
   ├─ pages/{Dashboard,Tools,ToolDetail,Tasks,Settings}Page.tsx
   ├─ components/{layout,tool,task,common}/
   └─ stores/{app,registry,tasks,settings}.ts   # Zustand
```

## Registry JSON Schema v1

**index.json**（发现层）：`{ schemaVersion, updatedAt, name, tools: [{ id, name, description, category, homepage, manifest: "tools/java.json", manifestSha256? }] }`

**tools/java.json**（清单层）核心结构：
```jsonc
{
  "schemaVersion": 1, "id": "java", "defaultVersion": "21.0.5+11",
  "env": { "vars": [{ "name": "JAVA_HOME", "value": "{{currentDir}}" }], "pathDirs": ["bin"] },
  "platforms": {
    "windows-x64": { "archive": "zip",
      "assets": { "21.0.5+11": { "url": "…", "sha256": "…", "size": 195000000, "mirrors": ["https://mirrors.tuna.tsinghua.edu.cn/…"] } },
      "workflowOverrides": {} }
  },
  "workflows": { "install": [/* 步骤 */], "activate": [], "uninstall": [] }
}
```

- platform 键：`windows|darwin|linux`-`x64|arm64`，精确匹配→OS 通配回退→不可安装。
- **三层工作流合并**：tool.workflows ⊕ platform.workflowOverrides ⊕ version.overrides，按步骤 `id` 浅合并，支持 `insertBefore/insertAfter`、`"remove": true`；提交任务前静态校验（模板可解析、参数完整）。
- **模板变量**（`src/shared/template.ts`，未知变量抛错）：`{{version}} {{versionDir}} {{currentDir}} {{toolsDir}} {{hienvsHome}} {{tmpDir}} {{cacheDir}} {{asset.url}} {{asset.sha256}} {{asset.fileName}} {{os}} {{arch}} {{sep}}` 等，路径返回平台原生分隔符。

## 工作流引擎

**步骤类型**（每步必带 `id`；`retry: {attempts, backoffMs, factor}`；`timeoutSec`；`onFailure: rollback|keep`）：

| type | 幂等跳过条件 |
|---|---|
| download（url/mirrors/sha256/断点续传） | 缓存文件存在且 sha256 匹配 |
| extract（zip/tar.gz/tar.xz, stripComponents） | 目标存在 `.hienvs/extract.ok` 且哈希一致 |
| move / copy / fs.mkdir / fs.delete | 目标已存在 / 不存在 |
| env.set / env.path.prepend / env.path.remove（scope: user/system） | 旧值等于新值 / 条目已托管 |
| verify（command + expectOutputRegex / pathExists / checksum） | **永不跳过** |
| git.clone / shell.run / cleanup / builtin.link-current / builtin.reapply-env | .git 存在 / 显式标注 / — |

**executor 语义**：顺序执行 + AbortSignal 取消检查；journal 把每步状态持久化到 `state/tasks/<taskId>.json`，重试时 `done` 步骤直接跳过（断点续跑）；每步执行前登记 undo 闭包（env 类恒回滚，install 默认 keep 半成品便于续跑，最终失败时撤 env 变更并清理新建 versionDir）。

**任务管理器**：FIFO+优先级（安装 normal / 激活卸载 high），并发默认 2，单任务独占 Worker（崩溃置 failed 附 stderr）。事件：`task:updated`（快照）/`task:progress`（250ms 节流）/`task:log`（行级，全量落盘 `logs/tasks/`，内存尾 500 行）；启动时孤儿 running 任务标 `interrupted` 可"继续"。

## 下载器与解压

- **downloader**（Worker 内，undici/node:https）：`.part`+`.part.meta`（ETag/Last-Modified/已收字节）断点续传，非 206 或 ETag 变化则重来；流式 sha256 校验；mirrors 按序回退，`mirrorPolicy: auto|mainland-first|official-first`；进度 `{received,total,speed,eta}`；powerSaveBlocker 防休眠。
- **extractor**（纯 JS 优先）：zip→yauzl；tar.gz→tar-stream+zlib（POSIX 还原可执行位）；tar.xz→lzma-native 懒加载，失败回退系统 `tar -xJf`。统一防 ZipSlip（规范化校验）、stripComponents、tar symlink POSIX 重建（Windows 跳过并告警）、Windows 保留字符兜底改名、完成写 `.hienvs/extract.ok` 标记。

## 环境变量管理

| 平台 | 实现 |
|---|---|
| Windows 用户级 | `reg query/add HKCU\Environment`（**不用 setx**——1024 截断+REG_SZ 坑）；Path/含 `%` 用 REG_EXPAND_SZ；托管条目用 `%USERPROFILE%\.hienvs\tools\<id>\current\bin`；写后 PowerShell P/Invoke 广播 WM_SETTINGCHANGE |
| Windows 系统级 | 自包含 PowerShell `Start-Process -Verb RunAs` 写 HKLM + 结果落 %TEMP% 回读，UI 提示 UAC |
| macOS | 重写 `~/.zshrc`(+`~/.zprofile`) 托管标记块（`# >>> hienvs managed block v1 >>>`）；UI 说明 GUI 程序读不到 rc 的已知限制（IDE 集成终端可覆盖） |
| Linux | `~/.bashrc`+`~/.profile` 或 `~/.zshrc` 托管块 + `~/.config/environment.d/hienvs.conf`（尽力而为） |

PATH 托管策略（纯函数 path-policy，可单测）：先剔除全部托管条目再按激活顺序回插，防止膨胀。**activator**：切换 = 重指 `current`（Windows junction `fs.symlinkSync(target, path, 'junction')` 无需管理员；POSIX `ln`），激活后同步 patch 主进程 `process.env`。

## IPC API（invoke / 事件）

- 注册表：`registry:list` / `registry:refresh` → RegistrySnapshot
- 工具：`tools:detail(toolId)`、`tools:install|activate|uninstall({toolId,version}) → {taskId}`、`tools:detectSystem`
- 任务：`tasks:list/get/cancel/resume/remove/getLog({taskId,offset})`
- 设置：`settings:get/set(patch)`；环境：`env:snapshot`、`env:preview(toolId)`（安装确认框展示 env diff）；系统：`app:info`、`app:openPath('logs'|'tools'|'installDir')`
- 事件：`task:updated` / `task:progress` / `task:log` / `registry:updated` / `env:changed`
- 安全：contextIsolation + sandbox + CSP；preload 白名单转发；`will-navigate` 拦截，外链 `shell.openExternal`

## 渲染层 UI（5 页，Tailwind 4）

- **仪表盘**：欢迎向导、"我的环境"卡片（激活版本+关键变量+健康徽标）、进行中任务、系统 PATH 冲突检测提示
- **工具管理**：卡片网格（状态 Badge/筛选/搜索）→ **工具详情**：版本列表（安装/激活/卸载）、安装确认弹窗（scope + env diff + 镜像策略）
- **任务中心**：任务列表 + **StepTimeline**（步骤时间线：pending/running/done/failed/skipped，下载节点内嵌进度条，Zustand selector 局部订阅）+ **LogViewer**（虚拟滚动、级别着色、`navigator.clipboard.writeText` 复制）+ 失败任务"继续/重试"
- **设置**：清单源管理（remote/local/built-in、启用、刷新）、下载与镜像、环境变量 scope、关于
- 主题：`@theme` 设计令牌，暗色模式 `@custom-variant dark`

## hienvs-registry 清单仓库（d:\workspace\hienvs-registry，独立仓库）

```
index.json + schema/registry-v1.schema.json + tools/{java,maven,go,node}.json
+ scripts/validate.mjs（结构+URL 可达+sha256 抽查）+ .github/workflows/validate.yml + README.md
```

工具清单要点（真实官方 URL + TUNA/阿里云镜像，sha256 结构完整以 `<占位>` 标注）：
- **java**：Temurin 21；Windows zip（stripComponents:1）；macOS tar.gz 需 `move Contents/Home → versionDir`（体现平台级覆盖）；linux tar.gz
- **maven**：3.9.9，全平台 zip/tar.gz（strip 1），TUNA/阿里镜像
- **go**：1.23.x，`GOROOT={{currentDir}}`，阿里/TUNA 镜像
- **node**：22 LTS，linux 用 tar.xz（触发 xz 通道），`nodejs-release` 镜像

## 里程碑与验证

| 里程碑 | 内容 | 验证 |
|---|---|---|
| M0 脚手架 | electron-vite 5 + React 19 + Tailwind 4 + 窗口 + preload 打通 `app:info` | `npm run dev` 出窗口，`build` 产物可启动 |
| M1 数据层 | paths/settings/installed-store/logger/template.ts | vitest 单测 template |
| M2 注册表 | zod schema、多源加载合并、resolver | 断网回落内置清单；坏源被隔离；三层合并单测 |
| M3 下载器 | Worker 骨架 + downloader（续传/校验/镜像/进度/取消） | Go zip 中断后续传；篡改字节校验失败 |
| M4 解压 | zip/tar.gz/tar.xz + stripComponents + ZipSlip 防护 | 三格式各装一个工具；恶意 zip 被拒 |
| M5 工作流引擎 | executor/journal/manager/全部步骤 | Java 全流程安装成功；中途取消后"继续"跳过已完成步骤 |
| M6 激活+环境变量 | activator、三平台 env、UAC、env:preview | Windows 装 v1→切 v2 新终端 `java -version` 立变；PATH 无膨胀 |
| M7 渲染层 UI | 5 页 + StepTimeline + LogViewer + 确认弹窗 | 手动走查全部页面与交互 |
| M8 registry 仓库 | 四工具清单 + validate 脚本 + CI | `node scripts/validate.mjs` 全绿；应用添加该源版本数增加 |
| M9 打包 | electron-builder（NSIS/dmg/AppImage）+ extraResources | 安装包离线可列出并安装工具 |

关键风险预案：lzma-native 与 Electron 44 ABI → 懒加载+系统 tar 兜底；Windows PATH 长度 → reg.exe 不经 shell + 写前 diff 最小化；镜像漂移 → refresh 失败不阻断（回落缓存/内置）；Worker 崩溃 → 任务 failed 可续跑。

## 实现说明

- 脚手架手写（不依赖 create 模板），从 M0 开始按里程碑顺序实现；每个里程碑完成后立即验证再进入下一个。
- 应用默认注册表指向内置清单；设置页可添加 `d:\workspace\hienvs-registry` 本地文件夹源与任意远程 URL。
