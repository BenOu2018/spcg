import path from 'node:path'
import {
  findForbiddenPublicFiles,
  formatBytes,
  getTopFiles,
  listFilesIfExists,
  publicAssetsDir,
  publicVideoDir,
  releaseCategories,
  repoRoot,
  sourceAssetsDir,
  summarizeCategory,
  summarizeFiles,
  toRepoRelative,
} from './public-asset-utils.ts'

async function main() {
  const sourceFiles = (await listFilesIfExists(sourceAssetsDir)).map(toRepoRelative)
  const publicAssetFiles = (await listFilesIfExists(publicAssetsDir)).map(toRepoRelative)
  const publicVideoFiles = (await listFilesIfExists(publicVideoDir)).map(toRepoRelative)
  const sourceSummary = await summarizeFiles(sourceFiles.map((relativePath) => path.join(repoRoot, relativePath)))
  const publicAssetSummary = await summarizeFiles(publicAssetFiles.map((relativePath) => path.join(repoRoot, relativePath)))
  const publicVideoSummary = await summarizeFiles(publicVideoFiles.map((relativePath) => path.join(repoRoot, relativePath)))
  const forbiddenPublicFiles = await findForbiddenPublicFiles()

  console.log('# SPCG Public Asset Audit')
  console.log(`Source assets exposure before slimming: ${sourceSummary.fileCount} files, ${formatBytes(sourceSummary.byteTotal)}`)
  console.log(`Runtime /assets after slimming: ${publicAssetSummary.fileCount} files, ${formatBytes(publicAssetSummary.byteTotal)}`)
  console.log(`Runtime /video after slimming: ${publicVideoSummary.fileCount} files, ${formatBytes(publicVideoSummary.byteTotal)}`)
  console.log('')
  console.log('## Removed from public exposure')
  for (const category of releaseCategories) {
    const summary = await summarizeCategory(category.label, sourceFiles, category.test)
    console.log(`- ${category.label}: ${summary.fileCount} files, ${formatBytes(summary.byteTotal)}`)
  }
  console.log('')
  console.log('## Top source files no longer broadly exposed')
  for (const item of await getTopFiles(sourceFiles, 12)) {
    console.log(`- ${formatBytes(item.bytes)} ${item.relativePath}`)
  }
  console.log('')
  console.log('## Top runtime public files')
  for (const item of await getTopFiles(publicAssetFiles, 12)) {
    console.log(`- ${formatBytes(item.bytes)} ${item.relativePath}`)
  }
  console.log('')
  console.log('## Guardrail')
  if (forbiddenPublicFiles.length > 0) {
    console.log(`Forbidden files found in public assets: ${forbiddenPublicFiles.length}`)
    for (const filePath of forbiddenPublicFiles.slice(0, 30)) console.log(`- ${filePath}`)
    process.exitCode = 1
    return
  }
  if (publicVideoSummary.fileCount > 0 && process.env.SPCG_SOLUTION_VIDEO_ENABLED !== 'true') {
    console.log('Public video files found while SPCG_SOLUTION_VIDEO_ENABLED is not true.')
    process.exitCode = 1
    return
  }
  console.log('No forbidden public files detected.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
