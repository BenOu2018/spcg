import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const fixturePath = join(repoRoot, 'problem-bank/examples/ch1-mist-town/levels/02-给袋子贴名字.example.md')

const cases: Array<{
  name: string
  mutate: (fixture: string) => string
  expectedError: string
}> = [
  {
    name: 'reject spcgLevel 0',
    mutate: (fixture) => fixture.replace('spcgLevel: 1', 'spcgLevel: 0').replace('levelLabel: SPCG 1级', 'levelLabel: SPCG 0级'),
    expectedError: 'difficulty.spcgLevel must be an integer from 1 to 10',
  },
  {
    name: 'reject spcgLevel 11',
    mutate: (fixture) =>
      fixture.replace('spcgLevel: 1', 'spcgLevel: 11').replace('levelLabel: SPCG 1级', 'levelLabel: SPCG 11级'),
    expectedError: 'difficulty.spcgLevel must be an integer from 1 to 10',
  },
  {
    name: 'reject missing levelLabel',
    mutate: (fixture) => fixture.replace(/  levelLabel: SPCG 1级\n/, ''),
    expectedError: 'levelLabel must be a non-empty string',
  },
  {
    name: 'reject mismatched levelLabel',
    mutate: (fixture) => fixture.replace('levelLabel: SPCG 1级', 'levelLabel: SPCG 3级'),
    expectedError: 'difficulty.levelLabel must be SPCG 1级 when spcgLevel is 1',
  },
  {
    name: 'reject stars 6',
    mutate: (fixture) => fixture.replace('stars: 1', 'stars: 6'),
    expectedError: 'difficulty.stars must be an integer from 1 to 5',
  },
]

const fixture = await readFile(fixturePath, 'utf8')

for (const testCase of cases) {
  const tempDir = await mkdtemp(join(tmpdir(), 'spcg-import-validation-'))
  const levelsDir = join(tempDir, 'levels')

  try {
    await mkdir(levelsDir, { recursive: true })
    await writeFile(join(levelsDir, 'invalid.md'), testCase.mutate(fixture))

    const result = spawnSync(
      'tsx',
      ['scripts/import-levels.ts', '--dry-run', '--skip-code-check', '--dir', levelsDir],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    )
    const output = `${result.stdout}\n${result.stderr}`

    if (result.status === 0) throw new Error(`${testCase.name}: expected validation failure`)
    if (!output.includes(testCase.expectedError)) {
      throw new Error(`${testCase.name}: expected error ${JSON.stringify(testCase.expectedError)}, got:\n${output}`)
    }

    console.log(`ok - ${testCase.name}`)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

console.log(`Import difficulty validation checks passed: ${cases.length}`)
