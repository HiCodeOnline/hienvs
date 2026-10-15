# webui 软件源站点实施计划

## Context（背景与目标）

客户端 hienvs 通过「远程软件源」加载清单：拉取 `<源地址>/index.json`，再按其中每个工具的 `manifest` 相对路径继续拉取 `tools/*.json`（见 [sources.ts](file:///d:/workspace/hienvs/src/main/registry/sources.ts#L99-L130)）。当前仓库只有 `resources/registry`（内置离线兜底，中文）与同级的 `hienvs-registry` 仓库，没有面向浏览者的可视化站点。

本次要在项目根目录新增 `webui/`，用 **Next.js `output: 'export'` 静态导出** 搭建一个网站，实现三件事：

1. **可视化查看软件源信息**：地区/语言切换、工具目录、工具详情（版本、平台、下载源/镜像、体积等）。
2. **在站点内维护软件源 JSON**：`webui/registry/` 为源数据目录，构建时读取并生成页面。
3. **导出可被客户端直接拉取的 JSON**：构建产物中保留各地区的 `index.json` + `tools/*.json`，客户端把「远程软件源地址」配成 `<站点根>/<地区>/index.json` 即可。

并满足国际化要求：站点界面复用客户端全部 16 种语言的字典；**软件源本身也按地区（= 语言代码）区分，效果类似应用商店切换不同地区**。

## 已确认决策

- 数据组织：**按地区各维护一份完整、独立的 `index.json` + `tools/*.json`**（内容可完全不同：不同文案、不同镜像/工具）。
- UI 多语言：**完整复制客户端 16 份 locale 字典**到 webui，并叠加站点专属键（缺失回退英语，与客户端 `translate()` 行为一致）。
- 导出方式：**`scripts` 生成到 `public/<region>/`，`next build` 静态导出到 `webui/out/`**；客户端源地址即 `<站点根>/<region>/index.json`。
- 初始数据：**迁移内置清单** `resources/registry`（jdk / maven / go / node）为初始内容。

## 目录结构

```
webui/
  package.json                # 独立 npm 工程（非 workspace）
  next.config.ts              # output:'export', trailingSlash:true, images.unoptimized
  tsconfig.json / next-env.d.ts
  postcss.config.mjs          # @tailwindcss/postcss（Tailwind v4，与客户端一致）
  .gitignore                  # node_modules / .next / out / public/*
  scripts/
    validate-registry.mjs     # 逐地区结构校验（移植 hienvs-registry/scripts/validate.mjs）
    sync-registry.mjs         # registry/<region>/** -> public/<region>/**
  registry/                   # ★ 软件源 JSON 源数据（人工维护）
    regions.json              # 地区元数据：defaultRegion + [{code, nativeName, dir}]
    zh-CN/{index.json, tools/*.json}
    en/{index.json, tools/*.json}
  lib/
    regions.ts                # 读取 registry/regions.json
    registry.ts               # 构建期 fs 读取地区清单/工具，产出 UI 需要的摘要
    i18n/{index.ts, locales/*.json}   # 复制客户端 16 份字典 + 站点键
  app/
    layout.tsx                # 根布局：globals.css + Provider（语言/主题）
    page.tsx                  # 落地页：地区选择（应用商店式入口）
    [region]/page.tsx         # 地区首页：源元信息 + 搜索/分类 + 工具网格
    [region]/tool/[id]/page.tsx    # 工具详情：发行商/版本/平台/下载源/原始 JSON
  components/                 # Header、RegionSwitcher、LanguageSwitcher、ThemeToggle、
                              # ToolCard、VersionTable、SourceList、CopyButton、Badge…
  app/globals.css             # Tailwind v4 + 主题 token（网页官网风格：slate 中性 + sky 强调）
```

> 注：现有根 `.gitignore` 已有 `out/`、`node_modules/`（无前导斜杠，匹配任意层级），但 **未** 覆盖 `.next/`；webui 自带 `.gitignore` 覆盖 `.next/`、`out/`、`public/<region>`（生成物），避免把产物提交进仓库。

## 数据结构（registry/）

- `regions.json`：`{ "defaultRegion": "zh-CN", "regions": [{ "code": "zh-CN", "nativeName": "中国大陆", "dir": "ltr" }, { "code": "en", "nativeName": "Global", "dir": "ltr" }] }`
  - 地区 `code` 直接采用语言代码，客户端 URL 形如 `/zh-CN/index.json`。
  - 初始 2 个地区；后续新增地区 = 新增目录 + regions.json 追加一项。
- 每个地区目录与客户端要求 **完全同构**：`index.json`（`schemaVersion=1`、`name`、`updatedAt`、`tools[]` 含 `id/name/description/category/homepage/icon/manifest`）+ `tools/<id>.json`（`ToolManifest`）。
  - `icon` 必须为绝对 http(s) URL；`manifest` 为相对路径（客户端用 `new URL(rel, index 基准)` 解析）→ 导出后即 `/<region>/tools/<id>.json`。
- 迁移：`resources/registry` 内容（中文）作为 `zh-CN` 地区；新建 `en` 地区，把工具/发行商的 `name`/`description` 本地化为英文（assets、`mirrors`、workflow 等保持等价），体现「各地区内容独立、可按地区差异化」。

## 构建与导出流程

`webui/package.json` scripts：

```
"validate:registry": "node scripts/validate-registry.mjs"
"sync:registry":     "node scripts/sync-registry.mjs"
"predev":            "npm run sync:registry"
"dev":               "next dev"
"prebuild":          "npm run validate:registry && npm run sync:registry"
"build":             "next build"
"serve":             "npx serve out"
```

- `validate-registry.mjs`：移植并改造 `hienvs-registry/scripts/validate.mjs`（纯 node，无依赖），遍历 `registry/<region>/` 逐地区校验 id/category/icon/manifest/平台键/资源 URL/mirrors/workflow。
- `sync-registry.mjs`：把 `registry/<region>/**` 复制到 `public/<region>/**`（排除 `regions.json`），使 dev 与 build 都能从 `/<region>/index.json` 命中真实 JSON。
- `prebuild` 先校验再同步，`next build`（`output:'export'`）把 `public/` 一并输出到 `webui/out/`；最终客户端地址：`<站点根>/<region>/index.json`。

## 站点实现

**技术**：Next.js App Router（Next 15）+ React 19 + TypeScript + Tailwind CSS v4（`@tailwindcss/postcss`），`output:'export'` + `trailingSlash:true` + `images.unoptimized`。全部页面静态生成。

**构建期读数据**：`lib/registry.ts` 用 `node:fs` 读 `registry/`（`process.cwd()` = webui 根），提供 `listRegions()`、`getIndex(region)`、`getTools(region)`、`getTool(region,id)`，并把 `ToolManifest` 归纳为 UI 摘要（版本键 `dist@version`、发行商、平台可用性、体积、官方源 + 具名镜像），逻辑参考客户端 [registry-types.ts](file:///d:/workspace/hienvs/src/shared/registry-types.ts#L165-L180) 的 `VersionInfo` 形态（在 webui 内重写，不跨工程引用客户端)。

**路由**：
- `app/page.tsx`：地区选择落地页（卡片式，应用商店风格）。
- `app/[region]/page.tsx`：`generateStaticParams` 遍历地区；展示源元信息（name / updatedAt / schemaVersion / 工具数）、**客户端源地址 + 一键复制**、`原始 index.json` 链接、搜索框、分类筛选、工具网格。
- `app/[region]/tool/[id]/page.tsx`：`generateStaticParams` 为各地区×工具生成；展示头部（图标/名称/描述/分类/官网）、发行商与版本表格（版本、发行商、平台可用性、体积、下载源）、下载源明细（官方/镜像名 + URL + size）、`复制源地址` / `查看原始 JSON`。

**交互组件（client components）**：
- `LanguageSwitcher`：16 种语言，`localStorage` 持久化，切换仅影响界面文案；同时设置 `<html dir>`（ar/ug 为 rtl）。
- `RegionSwitcher`：切换地区即导航到 `/<region>`（改变清单数据），体现「切换地区」。
- `ThemeToggle`：`.dark` 类式深色模式（与客户端一致的 `@custom-variant dark`）。
- `CopyButton` / `Badge` / `ToolCard` / `VersionTable` / `SourceList`。

**样式基调**：遵循 Tailwind 官网首页风格——slate 中性色 + sky/indigo 强调色、圆角 `rounded-2xl`、细微描边 `ring-1`、柔和阴影、充足留白、渐变 hero、URL/hash 用等宽字体；字体沿用 Inter。

## 国际化

- `lib/i18n/locales/`：**复制客户端 16 份** `src/shared/i18n/locales/*.json`（en、zh-CN、zh-TW、ru、ja、ko、fr、hi、es、pt、pl、de、bo、ug、ms、ar）。
- 复用客户端 [i18n/index.ts](file:///d:/workspace/hienvs/src/shared/i18n/index.ts#L50-L135) 的 `LANGUAGES`（code/nativeName/dir）与 `resolveLanguage`/`translate`（en 回退）实现，在 webui 内重写等价逻辑。
- 叠加站点专属键：`site.title/tagline`、`region.*`、`lang.*`、`source.*`（客户端源地址/复制/复制成功/原始 JSON/使用说明/更新时间/版本/工具数）、`catalog.*`（搜索/分类全部/工具/版本数/空态）、`tool.*`（首页/发行商/平台/可用/体积/官方/镜像/下载源/原始JSON/返回）。能复用的客户端键（如 `category.*`、`common.*`、`toolDetail.homepage`）直接复用。
- 站点键在 en / zh-CN / zh-TW 补齐完整译文；其余语言尽力补齐，缺失由 en 回退兜底。

## 关键文件清单（新增，均在 webui/ 下）

- 配置：`package.json`、`next.config.ts`、`tsconfig.json`、`postcss.config.mjs`、`.gitignore`
- 脚本：`scripts/validate-registry.mjs`、`scripts/sync-registry.mjs`
- 数据：`registry/regions.json`、`registry/zh-CN/**`（迁移自 resources/registry）、`registry/en/**`（英文本地化）
- 逻辑：`lib/regions.ts`、`lib/registry.ts`、`lib/i18n/index.ts`、`lib/i18n/locales/*.json`
- 页面/组件：`app/layout.tsx`、`app/globals.css`、`app/page.tsx`、`app/[region]/page.tsx`、`app/[region]/tool/[id]/page.tsx`、`components/**`

不改动客户端源码（`resources/registry` 内置兜底保持不变）。

## 验证方式

1. `cd webui && npm install`。
2. `npm run validate:registry` → 各地区 JSON 结构校验通过。
3. `npm run build` → 检查 `webui/out/` 产物：
   - 站点页：`out/index.html`、`out/<region>/index.html`、`out/<region>/tool/<id>/index.html`；
   - 客户端 JSON：`out/<region>/index.json`、`out/<region>/tools/<id>.json`（相对路径可被 `new URL(rel, index URL)` 正确解析）。
4. `npm run serve` 启动 `out/` 静态服务，用浏览器（browser_use）访问 `http://localhost:3000`，验证：地区切换、语言切换（含 RTL）、搜索/分类、工具详情与「复制源地址」。
5. 客户端可用性端到端（可选、需用户确认）：启动客户端，在设置里新增一个 **local** 源指向 `webui/registry/<region>`（或 `webui/out/<region>`）目录，确认工具箱能正确加载该地区工具与版本，证明导出的 JSON 与客户端消费格式一致。
