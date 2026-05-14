import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  collectRuntimeAssetPaths,
  formatBytes,
  publicAssetsDir,
  publicVideoDir,
  repoRoot,
  summarizeFiles,
} from './public-asset-utils.ts'

const solutionVideoEnabled = process.env.SPCG_SOLUTION_VIDEO_ENABLED === 'true'

async function main() {
  const runtimeAssets = await collectRuntimeAssetPaths()

  await fs.rm(publicAssetsDir, { recursive: true, force: true })
  await fs.rm(publicVideoDir, { recursive: true, force: true })

  for (const relativePath of [...runtimeAssets].sort()) {
    await copyRepoFile(relativePath, path.join(repoRoot, 'apps/web/public', relativePath))
  }

  if (solutionVideoEnabled) {
    await copyDirectory(path.join(repoRoot, 'assets/video'), publicVideoDir)
  }

  const copiedFiles = [...runtimeAssets].map((relativePath) => path.join(repoRoot, relativePath))
  const publicSummary = await summarizeFiles(copiedFiles)
  const videoSummary = solutionVideoEnabled
    ? await summarizeFiles(await listFiles(publicVideoDir))
    : { fileCount: 0, byteTotal: 0 }

  console.log(
    [
      `Prepared runtime public assets: ${publicSummary.fileCount} files, ${formatBytes(publicSummary.byteTotal)}`,
      `Prepared runtime public video: ${videoSummary.fileCount} files, ${formatBytes(videoSummary.byteTotal)}`,
      solutionVideoEnabled
        ? 'SPCG_SOLUTION_VIDEO_ENABLED=true, /video was generated.'
        : 'SPCG_SOLUTION_VIDEO_ENABLED is not true, /video was removed.',
    ].join('\n'),
  )
}

async function copyRepoFile(relativePath: string, targetPath: string) {
  const sourcePath = path.join(repoRoot, relativePath)
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.copyFile(sourcePath, targetPath)
}

async function copyDirectory(sourceDir: string, targetDir: string) {
  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath)
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath)
    }
  }
}

async function listFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) files.push(...(await listFiles(filePath)))
      if (entry.isFile()) files.push(filePath)
    }
    return files
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
