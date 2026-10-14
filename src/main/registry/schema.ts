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

/** 镜像源：兼容旧版裸字符串（自动以主机名作名字）与新版本具名对象 */
export const mirrorSourceSchema = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1), url: z.string().min(1) }).passthrough()
])

/** 由镜像 URL 推导显示名（旧版裸字符串镜像的兜底） */
function mirrorNameFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function normalizeMirrorSource(m: z.infer<typeof mirrorSourceSchema>): { name: string; url: string } {
  return typeof m === 'string' ? { name: mirrorNameFromUrl(m), url: m } : { name: m.name, url: m.url }
}

export const assetSchema = z
  .object({
    url: z.string().min(1),
    sha256: z.string().min(4).optional(),
    size: z.number().min(0).optional(),
    fileName: z.string().min(1).optional(),
    mirrors: z.array(mirrorSourceSchema).optional()
  })
  .passthrough()
  .transform((a) => ({
    ...a,
    mirrors: a.mirrors?.map(normalizeMirrorSource)
  }))

export const platformSchema = z.object({
  archive: z.enum(['zip', 'tar.gz', 'tar.xz']).optional(),
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

export const toolManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['language', 'build-tool', 'runtime', 'sdk', 'vcs']).optional(),
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
  tools: z.array(
    z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(['language', 'build-tool', 'runtime', 'sdk', 'vcs']).optional(),
      homepage: z.string().optional(),
      icon: z.string().url().optional(),
      manifest: z.string().min(1),
      manifestSha256: z.string().optional()
    }).passthrough()
  )
}).passthrough()

export type ParsedToolManifest = z.infer<typeof toolManifestSchema>
export type ParsedRegistryIndex = z.infer<typeof registryIndexSchema>
