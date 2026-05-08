import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(rootDir, 'node_modules', 'monaco-editor', 'min', 'vs')
const targetDir = join(rootDir, 'apps', 'web', 'public', 'monaco', 'vs')

if (!existsSync(sourceDir)) {
  throw new Error(`Monaco editor assets were not found at ${sourceDir}. Run npm install first.`)
}

rmSync(targetDir, { force: true, recursive: true })
mkdirSync(dirname(targetDir), { recursive: true })
cpSync(sourceDir, targetDir, { recursive: true })

console.log(`Prepared Monaco editor assets at ${targetDir}`)
