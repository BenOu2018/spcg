import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

type Violation = {
  file: string
  importPath: string
  message: string
}

const repoRoot = process.cwd()
const webRoot = path.join(repoRoot, 'apps/web')
const sourceExtensions = new Set(['.ts', '.tsx'])

const legacyDirectDbImports = new Set([
  'apps/web/auth.ts',
  'apps/web/lib/admin-auth.ts',
  'apps/web/lib/admin-data.ts',
  'apps/web/app/auth/actions.ts',
  'apps/web/app/admin/imports/actions.ts',
  'apps/web/app/admin/levels/actions.ts',
  'apps/web/app/admin/problem-sets/actions.ts',
  'apps/web/app/admin/users/actions.ts',
])

const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

async function main() {
  const files = await listSourceFiles(webRoot)
  const violations: Violation[] = []

  for (const file of files) {
    const relativeFile = toRepoRelative(file)
    const content = await readFile(file, 'utf8')
    const imports = collectImports(content)

    for (const importPath of imports) {
      checkImport(relativeFile, importPath, violations)
    }
  }

  if (violations.length > 0) {
    console.error('Architecture boundary check failed:')
    for (const violation of violations) {
      console.error(`- ${violation.file} imports ${violation.importPath}: ${violation.message}`)
    }
    process.exitCode = 1
    return
  }

  console.log('Architecture boundary check passed.')
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') return []
        return listSourceFiles(fullPath)
      }

      return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : []
    }),
  )

  return files.flat()
}

function collectImports(content: string): string[] {
  const imports: string[] = []
  for (const match of content.matchAll(importPattern)) {
    const importPath = match[1] ?? match[2]
    if (importPath) imports.push(importPath)
  }
  return imports
}

function checkImport(file: string, importPath: string, violations: Violation[]) {
  if (isUiComponent(file) && isWebInternalBoundary(importPath)) {
    violations.push({
      file,
      importPath,
      message: 'UI components must not import db, repositories, or services; go through props/actions.',
    })
  }

  if (isAppEntrypoint(file) && importsDbOrRepository(importPath) && !legacyDirectDbImports.has(file)) {
    violations.push({
      file,
      importPath,
      message: 'Server Actions and API Routes must call services, not db/repositories directly.',
    })
  }

  if (isService(file) && (importPath.startsWith('@/app') || importPath.startsWith('@/components'))) {
    violations.push({
      file,
      importPath,
      message: 'Services must stay framework-light and must not depend on app routes or UI components.',
    })
  }

  if (
    isRepository(file) &&
    (importPath.startsWith('@/auth') ||
      importPath.startsWith('@/app') ||
      importPath.startsWith('@/components') ||
      importPath.startsWith('@/lib/services'))
  ) {
    violations.push({
      file,
      importPath,
      message: 'Repositories may depend on db/types only; auth, services, app routes, and UI belong above them.',
    })
  }

  if (importPath === '@/lib/db' && !canImportDb(file)) {
    violations.push({
      file,
      importPath,
      message: 'Direct db access is limited to repositories and documented legacy adapters.',
    })
  }
}

function isUiComponent(file: string): boolean {
  return file.startsWith('apps/web/components/')
}

function isAppEntrypoint(file: string): boolean {
  return file.startsWith('apps/web/app/') && (file.endsWith('/actions.ts') || file.endsWith('/route.ts'))
}

function isService(file: string): boolean {
  return file.startsWith('apps/web/lib/services/')
}

function isRepository(file: string): boolean {
  return file.startsWith('apps/web/lib/repositories/')
}

function isWebInternalBoundary(importPath: string): boolean {
  return (
    importPath === '@/lib/db' ||
    importPath.startsWith('@/lib/repositories') ||
    importPath.startsWith('@/lib/services')
  )
}

function importsDbOrRepository(importPath: string): boolean {
  return importPath === '@/lib/db' || importPath.startsWith('@/lib/repositories')
}

function canImportDb(file: string): boolean {
  return isRepository(file) || legacyDirectDbImports.has(file)
}

function toRepoRelative(file: string): string {
  return path.relative(repoRoot, file).split(path.sep).join('/')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
