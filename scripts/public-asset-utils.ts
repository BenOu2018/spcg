import { promises as fs } from 'node:fs'
import path from 'node:path'

export type AssetSummary = {
  fileCount: number
  byteTotal: number
}

export type CategorySummary = AssetSummary & {
  label: string
}

export const repoRoot = process.cwd()
export const sourceAssetsDir = path.join(repoRoot, 'assets')
export const publicDir = path.join(repoRoot, 'apps/web/public')
export const publicAssetsDir = path.join(publicDir, 'assets')
export const publicVideoDir = path.join(publicDir, 'video')

export const forbiddenPublicPatterns = [
  /statement-main-original-/,
  /\/sources\//,
  /\/temp\//,
  /-source\./,
  /\.(gif|mp3|mp4|mov|webm)$/i,
]

export const runtimeAssetGlobs = [
  'assets/art/backgrounds/ch1-mist-town/main-map-v1.webp',
  'assets/art/backgrounds/ch1-mist-town/programming-bg-clean-v1.webp',
  'assets/art/backgrounds/ch1-mist-town/programming-ui-kit/*.svg',
  'assets/art/backgrounds/ch1-mist-town/exam-ui-kit/*.svg',
  'assets/art/backgrounds/ch1-mist-town/promote/*.svg',
  'assets/art/backgrounds/ch2-logic-maze/main-map-fairytale-v1.webp',
  'assets/art/backgrounds/ch3-sorting-icefield/main-map-spcg-color-v1.webp',
  'assets/art/backgrounds/ch3-sorting-icefield/main-map-v2.webp',
  'assets/art/backgrounds/ch4-frost-bridge/main-map-v2.webp',
  'assets/art/backgrounds/ch8-shadow-network-hub/main-map-v1.webp',
  'assets/art/characters/dog-tiger-protagonist/cute.svg',
  'assets/art/ui/buttons/*.svg',
  'assets/art/ui/effects/*.webp',
  'assets/art/ui/exam-proctors/*.webp',
  'assets/art/ui/icons/*.svg',
  'assets/art/ui/knowledge-tree/knowledge-tree-grass-base-v1.webp',
  'assets/art/ui/knowledge-tree/svg/*.svg',
  'assets/art/ui/leaderboard-rpg/podium-bg/*.webp',
  'assets/art/ui/leaderboard-rpg/svg/*.svg',
  'assets/art/ui/logo/*.svg',
  'assets/art/ui/nodes/*.svg',
  'assets/art/ui/path/*.svg',
  'assets/art/ui/rewards/*.svg',
  'assets/art/ui/rewards/rank-weapons/thumbnails/*.webp',
  'assets/art/ui/today-news/*.webp',
  'assets/problems/**/statement-main.webp',
  'assets/problems/**/statement-main.svg',
  'assets/wechat-consult.png',
]

export const releaseCategories: Array<{ label: string; test: (relativePath: string) => boolean }> = [
  {
    label: '题面未压缩原图 statement-main-original-*',
    test: (relativePath) => /\/statement-main-original-/.test(relativePath),
  },
  {
    label: '角色与素材 source 目录',
    test: (relativePath) => /\/sources\//.test(relativePath),
  },
  {
    label: '文件名带 -source 的背景/素材源图',
    test: (relativePath) => /-source\./.test(relativePath),
  },
  {
    label: 'temp 临时题目与临时视频资源',
    test: (relativePath) => /\/temp\//.test(relativePath),
  },
  {
    label: '题解视频 /video/solutions',
    test: (relativePath) => relativePath.startsWith('assets/video/solutions/') && /\.(mp4|mov|webm)$/i.test(relativePath),
  },
  {
    label: '音频与 GIF 媒体',
    test: (relativePath) => /\.(mp3|gif)$/i.test(relativePath),
  },
]

export async function collectRuntimeAssetPaths(): Promise<Set<string>> {
  const collected = new Set<string>()

  for (const glob of runtimeAssetGlobs) {
    for (const filePath of await expandAssetGlob(glob)) {
      if (isAllowedRuntimeAsset(filePath)) collected.add(filePath)
    }
  }

  for (const filePath of await collectReferencedAssetUrls()) {
    if (isAllowedRuntimeAsset(filePath)) collected.add(filePath)
  }

  return collected
}

export async function collectReferencedAssetUrls(): Promise<Set<string>> {
  const sourceRoots = ['apps/web', 'shared'].map((entry) => path.join(repoRoot, entry))
  const files = new Set<string>()
  for (const root of sourceRoots) {
    for (const filePath of await listFiles(root)) {
      if (filePath.includes(`${path.sep}apps${path.sep}web${path.sep}public${path.sep}`)) continue
      if (filePath.includes(`${path.sep}.next${path.sep}`)) continue
      if (/\.(ts|tsx|css|mjs|js|json)$/.test(filePath)) files.add(filePath)
    }
  }

  const urls = new Set<string>()
  const assetUrlPattern = /\/assets\/[^'"`)\s]+/g
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8')
    for (const match of content.matchAll(assetUrlPattern)) {
      const assetPath = match[0].split(/[?#]/)[0]
      const relativePath = assetPath.replace(/^\//, '')
      if (!relativePath.includes('${') && (await fileExists(path.join(repoRoot, relativePath)))) urls.add(relativePath)
    }
  }

  return urls
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}

export function isAllowedRuntimeAsset(relativePath: string): boolean {
  if (!relativePath.startsWith('assets/')) return false
  if (forbiddenPublicPatterns.some((pattern) => pattern.test(relativePath))) return false
  if (relativePath.startsWith('assets/problems/temp/')) return false
  if (/\.(png)$/i.test(relativePath) && relativePath !== 'assets/wechat-consult.png') return false
  return true
}

export async function expandAssetGlob(glob: string): Promise<string[]> {
  const normalized = glob.replaceAll('\\', '/')
  if (normalized.includes('**/')) {
    const [prefix, suffix] = normalized.split('**/')
    const baseDir = path.join(repoRoot, prefix)
    const suffixPattern = globSuffixToRegExp(suffix)
    const files = await listFilesIfExists(baseDir)
    return files
      .map((filePath) => toRepoRelative(filePath))
      .filter((relativePath) => suffixPattern.test(path.posix.basename(relativePath)))
  }

  if (normalized.includes('*')) {
    const directory = normalized.slice(0, normalized.lastIndexOf('/'))
    const filePattern = globSuffixToRegExp(normalized.slice(normalized.lastIndexOf('/') + 1))
    const entries = await listFilesIfExists(path.join(repoRoot, directory))
    return entries
      .filter((filePath) => !filePath.slice(path.join(repoRoot, directory).length + 1).includes(path.sep))
      .map((filePath) => toRepoRelative(filePath))
      .filter((relativePath) => filePattern.test(path.basename(relativePath)))
  }

  try {
    await fs.access(path.join(repoRoot, normalized))
    return [normalized]
  } catch {
    return []
  }
}

export async function listFilesIfExists(directory: string): Promise<string[]> {
  try {
    return await listFiles(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(filePath)))
    } else if (entry.isFile()) {
      files.push(filePath)
    }
  }
  return files
}

export async function summarizeFiles(files: string[]): Promise<AssetSummary> {
  let byteTotal = 0
  for (const filePath of files) {
    byteTotal += (await fs.stat(filePath)).size
  }
  return { fileCount: files.length, byteTotal }
}

export async function summarizeCategory(
  label: string,
  files: string[],
  test: (relativePath: string) => boolean,
): Promise<CategorySummary> {
  const matched = files.filter((relativePath) => test(relativePath))
  return { label, ...(await summarizeFiles(matched.map((relativePath) => path.join(repoRoot, relativePath)))) }
}

export async function findForbiddenPublicFiles(): Promise<string[]> {
  const files = await listFilesIfExists(publicAssetsDir)
  return files
    .map((filePath) => toRepoRelative(filePath))
    .filter((relativePath) => forbiddenPublicPatterns.some((pattern) => pattern.test(relativePath)))
}

export async function getTopFiles(files: string[], limit: number): Promise<Array<{ relativePath: string; bytes: number }>> {
  const rows = await Promise.all(
    files.map(async (relativePath) => ({
      relativePath,
      bytes: (await fs.stat(path.join(repoRoot, relativePath))).size,
    })),
  )
  return rows.sort((a, b) => b.bytes - a.bytes).slice(0, limit)
}

export function toRepoRelative(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/')
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function globSuffixToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${escaped}$`)
}
