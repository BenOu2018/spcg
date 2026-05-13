import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type KnowledgePoint = {
  tagId: string
  classification: string
  bandOrLevel: string
}

type RelationKind = 'prerequisite' | 'related'

type KnowledgePointRelation = {
  fromTagId: string
  toTagId: string
  kind: RelationKind
  strength: number
  label: string
}

type RelationFile = {
  classification: string
  version: number
  relations: KnowledgePointRelation[]
}

const repoRoot = resolve('.')
const pointPath = 'problem-bank/Knowledge_point.md'
const relationPath = 'problem-bank/Knowledge_point_relations.json'
const visibleMaxLevel = 8
const tagIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function main() {
  const [points, relationFile] = await Promise.all([readProgrammingKnowledgePoints(), readRelationFile()])
  const errors = validateRelations(points, relationFile)

  if (errors.length > 0) {
    throw new Error(`Knowledge tree relation validation failed:\n${errors.join('\n')}`)
  }

  console.log(`knowledge tree relations ok: ${relationFile.relations.length} relations`)
}

async function readProgrammingKnowledgePoints(): Promise<KnowledgePoint[]> {
  const text = await readFile(resolve(repoRoot, pointPath), 'utf8')
  const points: KnowledgePoint[] = []

  for (const line of text.split('\n')) {
    if (!line.startsWith('| ')) continue
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
    if (!tagIdPattern.test(cells[0] ?? '')) continue
    if (cells.length !== 6) continue

    const [tagId, , , , bandOrLevel] = cells
    if (!tagId || !bandOrLevel) continue
    points.push({
      tagId,
      classification: '编程算法',
      bandOrLevel,
    })
  }

  return points
}

async function readRelationFile(): Promise<RelationFile> {
  const text = await readFile(resolve(repoRoot, relationPath), 'utf8')
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed)) throw new Error(`${relationPath} must be a JSON object`)
  if (parsed.classification !== '编程算法') throw new Error(`${relationPath} classification must be 编程算法`)
  if (parsed.version !== 1) throw new Error(`${relationPath} version must be 1`)
  if (!Array.isArray(parsed.relations)) throw new Error(`${relationPath} relations must be an array`)

  return {
    classification: parsed.classification,
    version: parsed.version,
    relations: parsed.relations.map((item, index) => readRelation(item, index)),
  }
}

function readRelation(value: unknown, index: number): KnowledgePointRelation {
  if (!isRecord(value)) throw new Error(`relations[${index}] must be an object`)
  const fromTagId = readString(value.fromTagId)
  const toTagId = readString(value.toTagId)
  const kind = value.kind === 'prerequisite' || value.kind === 'related' ? value.kind : null
  const strength = typeof value.strength === 'number' ? value.strength : Number.NaN
  const label = readString(value.label)

  if (!kind) throw new Error(`relations[${index}].kind must be prerequisite or related`)

  return {
    fromTagId,
    toTagId,
    kind,
    strength,
    label,
  }
}

function validateRelations(points: KnowledgePoint[], relationFile: RelationFile): string[] {
  const errors: string[] = []
  const byTagId = new Map(points.map((point) => [point.tagId, point]))
  const seen = new Set<string>()
  const prerequisiteTargets = new Set(
    relationFile.relations
      .filter((relation) => relation.kind === 'prerequisite')
      .map((relation) => relation.toTagId),
  )

  if (relationFile.classification !== '编程算法') {
    errors.push('classification must be 编程算法')
  }

  for (const [index, relation] of relationFile.relations.entries()) {
    const label = `relations[${index}] ${relation.fromTagId}->${relation.toTagId}`
    const key = `${relation.fromTagId}:${relation.toTagId}:${relation.kind}`

    if (seen.has(key)) errors.push(`${label}: duplicate relation`)
    seen.add(key)

    if (!tagIdPattern.test(relation.fromTagId)) errors.push(`${label}: fromTagId must be lower kebab-case`)
    if (!tagIdPattern.test(relation.toTagId)) errors.push(`${label}: toTagId must be lower kebab-case`)
    if (relation.fromTagId === relation.toTagId) errors.push(`${label}: relation cannot point to itself`)
    if (relation.strength < 0.1 || relation.strength > 1) errors.push(`${label}: strength must be between 0.1 and 1`)
    if (!relation.label.trim()) errors.push(`${label}: label is required`)

    const from = byTagId.get(relation.fromTagId)
    const to = byTagId.get(relation.toTagId)
    if (!from) errors.push(`${label}: fromTagId does not exist in ${pointPath}`)
    if (!to) errors.push(`${label}: toTagId does not exist in ${pointPath}`)
    if (from && levelNumber(from.bandOrLevel) > visibleMaxLevel) errors.push(`${label}: fromTagId is outside 1-${visibleMaxLevel}级`)
    if (to && levelNumber(to.bandOrLevel) > visibleMaxLevel) errors.push(`${label}: toTagId is outside 1-${visibleMaxLevel}级`)
  }

  for (const point of points) {
    const level = levelNumber(point.bandOrLevel)
    if (level < 2 || level > visibleMaxLevel) continue
    if (!prerequisiteTargets.has(point.tagId)) {
      errors.push(`${point.tagId}: ${point.bandOrLevel} knowledge point must have at least one direct prerequisite`)
    }
  }

  return errors
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function levelNumber(value: string): number {
  const match = value.match(/(\d+)/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
