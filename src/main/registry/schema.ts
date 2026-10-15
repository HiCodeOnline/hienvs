// Registry v1 zod 校验 schema（与 src/shared/registry-types.ts 同步）
import { z } from 'zod'

export const stepSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.string().min(1),
  retry: z
    .object({
      attempts: z.number().int().min(1).max(10),
      backoffMs: z.number().min(0).optional(),
      factor: z.number().min(1).optional()
    })
    .optional(),
  timeoutSec: z.number().min(1).optional(),
  onFailure: z.enum(['rollback', 'keep']).optional(),
  remove: z.boolean().optional(),
  insertBefore: z.string().optional(),
  insertAfter: z.string().optional()
}).passthrough()

export const workflowSchema = z.object({
  install: z.array(stepSchema).optional(),
  activate: z.array(stepSchema).optional(),
  uninstall: z.array(stepSchema).optional()
}).passthrough()

/** 镜像源：兼容旧版裸字符串（自动以主机名作名字）与新版本具名对象（可带 size） */
export const mirrorSourceSchema = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1), url: z.string().min(1), size: z.number().min(0).optional() }).passthrough()
])

/** 由镜像 URL 推导显示名（旧版裸字符串镜像的兜底） */
function mirrorNameFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function normalizeMirrorSource(m: z.infer<typeof mirrorSourceSchema>): { name: string; url: string; size?: number } {
  if (typeof m === 'string') return { name: mirrorNameFromUrl(m), url: m }
  return m.size !== undefined ? { name: m.name, url: m.url, size: m.size } : { name: m.name, url: m.url }
}

/** 分发格式：压缩包 / 安装包 / 单文件（与 shared/registry-types.ts 的 AssetFormat 同步） */
export const ASSET_FORMATS = [
  'zip',
  'tar.gz',
  'tar.xz',
  'exe',
  'msi',
  'msix',
  'dmg',
  'pkg',
  'rpm',
  'deb',
  'appimage',
  'raw'
] as const

export const assetSchema = z
  .object({
    url: z.string().min(1),
    sha256: z.string().min(4).optional(),
    md5: z.string().min(4).optional(),
    sha1: z.string().min(4).optional(),
    size: z.number().min(0).optional(),
    fileName: z.string().min(1).optional(),
    mirrors: z.array(mirrorSourceSchema).optional(),
    installArgs: z.array(z.string()).optional(),
    elevate: z.boolean().optional()
  })
  .passthrough()
  .transform((a) => ({
    ...a,
    mirrors: a.mirrors?.map(normalizeMirrorSource)
  }))

export const platformSchema = z.object({
  archive: z.enum(ASSET_FORMATS).optional(),
  assets: z.record(z.string().min(1), assetSchema),
  workflowOverrides: workflowSchema.optional()
}).passthrough()

export const envVarSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  expand: z.boolean().optional()
}).passthrough()

export const versionOverridesSchema = z
  .record(
    z.string().min(1),
    z
      .object({
        steps: z
          .record(z.string().min(1), stepSchema.partial().passthrough())
          .optional(),
        workflowOverrides: workflowSchema.optional()
      })
      .passthrough()
  )
  .optional()

export const distributionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  homepage: z.string().optional(),
  defaultVersion: z.string().min(1).optional(),
  platforms: z.record(z.string().min(1), platformSchema),
  versionOverrides: versionOverridesSchema
}).passthrough()

/** 分类编码：源文件可在 index.categories 中自定义（编码 + 名称），不再限定固定枚举 */
export const categoryCodeSchema = z.string().min(1).optional()

export const toolManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  name: z.string().min(1),
  description: z.string().optional(),
  category: categoryCodeSchema,
  homepage: z.string().optional(),
  defaultVersion: z.string().min(1).optional(),
  env: z
    .object({
      vars: z.array(envVarSchema).optional(),
      pathDirs: z.array(z.string().min(1)).optional()
    })
    .passthrough()
    .optional(),
  workflows: workflowSchema.optional(),
  platforms: z.record(z.string().min(1), platformSchema).optional(),
  distributions: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), distributionSchema).optional(),
  versionOverrides: versionOverridesSchema
}).passthrough().refine(
  (m) =>
    (m.platforms !== undefined && Object.keys(m.platforms).length > 0) ||
    (m.distributions !== undefined && Object.keys(m.distributions).length > 0),
  { message: 'platforms 与 distributions 至少声明其一' }
)

export const registryIndexSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().optional(),
  name: z.string().min(1),
  /** 分类配置（与 tools 平级）：编码 + 展示名称，工具箱按此渲染 GitHub 风格过滤 tab */
  categories: z
    .array(z.object({ code: z.string().min(1), name: z.string().min(1) }).passthrough())
    .optional(),
  tools: z.array(
    z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
      name: z.string().min(1),
      description: z.string().optional(),
      category: categoryCodeSchema,
      homepage: z.string().optional(),
      icon: z.string().url().optional(),
      manifest: z.string().min(1),
      manifestSha256: z.string().optional()
    }).passthrough()
  )
}).passthrough()

export type ParsedToolManifest = z.infer<typeof toolManifestSchema>
export type ParsedRegistryIndex = z.infer<typeof registryIndexSchema>
