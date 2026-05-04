import { getDifficultyCoefficient, getLevelCoinReward, getLevelLabel } from '../shared/difficulty.js'

const checks: Array<[string, () => void]> = [
  [
    'SPCG 1级 1层 rewards 1 coin',
    () => {
      assertDifficulty({ spcgLevel: 1, stars: 1 }, 1, 'SPCG 1级')
    },
  ],
  [
    'SPCG 2级 5层 rewards 10 coins',
    () => {
      assertDifficulty({ spcgLevel: 2, stars: 5 }, 10, 'SPCG 2级')
    },
  ],
  [
    'SPCG 10级 5层 rewards 50 coins',
    () => {
      assertDifficulty({ spcgLevel: 10, stars: 5 }, 50, 'SPCG 10级')
    },
  ],
]

for (const [name, check] of checks) {
  check()
  console.log(`ok - ${name}`)
}

console.log(`Reward checks passed: ${checks.length}`)

function assertDifficulty(input: { spcgLevel: number; stars: number }, expected: number, expectedLabel: string) {
  const coefficient = getDifficultyCoefficient(input)
  const reward = getLevelCoinReward(input)
  const label = getLevelLabel(input.spcgLevel)

  if (coefficient !== expected) throw new Error(`expected coefficient ${expected}, got ${coefficient}`)
  if (reward !== expected) throw new Error(`expected reward ${expected}, got ${reward}`)
  if (label !== expectedLabel) throw new Error(`expected label ${expectedLabel}, got ${label}`)
}
