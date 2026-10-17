<div align="center">
  <img src="logo.png" alt="HiEnvs" width="96" />
  <h1>HiEnvs</h1>
  <p>Open, community-built trusted software registries · A cross-platform dev environment manager</p>
  <p>English · <a href="README.zh-CN.md">中文</a></p>
</div>

## Overview

HiEnvs is a cross-platform development environment manager built with Electron + TypeScript. Driven by remote JSON registries, it handles **multi-version download, installation, activation and switching** of dev tools — JDK (multiple distributions), Maven, Go, Python, Flutter, Node.js and more.

## Features

- **Multi-version management**: keep multiple versions of the same tool side by side, activate/switch with one click, environment variables applied and cleaned up on demand
- **Registry sources**: no built-in default source — add your own with mandatory validity check; multiple sources in parallel, filterable by source and category (GitHub-style tabs) in the toolbox
- **Multi-protocol downloads**: HTTP(S) direct links, BitTorrent (magnet / .torrent via webtorrent), ed2k link recognition (falls back to other mirrors automatically)
- **Reliable downloads**: resumable transfers, automatic mirror fallback, streaming md5 / SHA-1 / SHA-256 verification, proxy support (with username/password auth)
- **Platform-aware matching**: platform keys support exact `windows-x64`, arch-agnostic `windows`, and the universal `none` key; a tool entry can also be flagged `systemAgnostic` (e.g. OS images) so the client skips the current-platform check and the asset stays downloadable on every operating system
- **Workflow orchestration**: download → extract/install → activate, driven by manifest workflows; a task center with visible progress and retry on failure
- **i18n**: 16 built-in languages (EN, zh-CN, zh-TW, JA, KO, FR, DE, ES, PT, RU, PL, AR, HI, MS, BO, UG)
- **Companion registry site**: `webui/` is a Next.js static site for browsing and maintaining registries with per-region (language) views, and can serve directly as a remote source for the client

## Registries

A registry is a remote JSON manifest (`index.json` plus per-tool manifests) declaring tools, versions, platform assets, download mirrors and install workflows. Add a source URL under **Settings → Registries**; it is validated and initialized automatically.

## Development

```bash
npm install
npm run dev          # start the dev client (main-process/preload changes require a full restart)
npm run typecheck    # type checking
npm run test         # unit tests (vitest)
```

In development, the client automatically seeds the local webui source (`http://127.0.0.1:4173/zh-CN/index.json`) for registry debugging:

```bash
cd webui
npm install
npm run build && npx serve out   # build and preview as a static site (port 4173)
```

## Packaging

```bash
npm run dist:win     # Windows (NSIS installer)
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

Registry assets are bundled via `extraResources`.

Releases can also be automated via GitHub Actions: pushing a `v*` tag (e.g. `git tag v0.1.0 && git push --tags`) triggers parallel Windows / macOS / Linux builds, with artifacts uploaded to the corresponding GitHub Release (see [.github/workflows/release.yml](.github/workflows/release.yml)). Bump `package.json` `version` before tagging.

## Data Directories

| Content | Location |
| --- | --- |
| Config / cache / logs | `~/.hienvs/` |
| Downloads | `<install>/.hienvs/downloads` by default (configurable) |
| Tools | `<install>/.hienvs/tools` by default (configurable) |

## Tech Stack

Electron · electron-vite · React · Tailwind CSS v4 · zustand · zod · undici · webtorrent · Next.js 15 (static export for webui)

## License

[Apache License 2.0](LICENSE)
