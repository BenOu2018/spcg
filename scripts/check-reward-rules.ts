import { getDifficultyCoefficient, getLevelCoinReward, getLevelLabel } from '../shared/difficulty.js'
import {
  EARNED_TITLE_CATALOG,
  getEarnedTitlePoolKeyForRank,
  pickEarnedTitleFromPool,
} from '../shared/earned-titles.js'
import { generateTitle, getRankForCoins, getRankLabel } from '../shared/reward-ranks.js'

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
  [
    '0 coins starts at scrap iron',
    () => {
      assertRank(0, 'scrap_iron', '黑铁')
    },
  ],
  [
    '71 coins remains scrap iron',
    () => {
      assertRank(71, 'scrap_iron', '黑铁')
    },
  ],
  [
    '72 coins reaches bronze',
    () => {
      assertRank(72, 'bronze', '青铜')
    },
  ],
  [
    '200 coins reaches silver',
    () => {
      assertRank(200, 'silver', '白银')
    },
  ],
  [
    '8000 coins reaches server',
    () => {
      assertRank(8000, 'server', '服务器')
    },
  ],
  [
    'rank title uses new rank label',
    () => {
      const title = generateTitle({ garlicBalance: 12, rank: 'grandmaster' })
      if (title !== '宗师二分星尘守卫') throw new Error(`expected 宗师二分星尘守卫, got ${title}`)
    },
  ],
  [
    'earned title catalog has 100 normal titles',
    () => {
      if (EARNED_TITLE_CATALOG.length !== 100) {
        throw new Error(`expected 100 earned titles, got ${EARNED_TITLE_CATALOG.length}`)
      }
    },
  ],
  [
    'earned title rank pools match product mapping',
    () => {
      assertTitlePool('scrap_iron', 'scrap_iron')
      assertTitlePool('bronze', 'bronze')
      assertTitlePool('silver', 'silver')
      assertTitlePool('gold', 'gold')
      assertTitlePool('platinum', 'platinum')
      assertTitlePool('diamond', 'diamond')
      assertTitlePool('stellar', 'stellar')
      assertTitlePool('king', 'king')
      assertTitlePool('master', 'master')
      assertTitlePool('grandmaster', 'grandmaster')
      assertTitlePool('legend', 'king')
      assertTitlePool('server', 'king')
    },
  ],
  [
    'earned title selection is deterministic and skips used labels',
    () => {
      const first = pickEarnedTitleFromPool({ poolKey: 'bronze', seed: 3 })
      const second = pickEarnedTitleFromPool({ poolKey: 'bronze', seed: 3 })
      if (first.label !== second.label) {
        throw new Error(`expected stable title, got ${first.label} and ${second.label}`)
      }
      const skipped = pickEarnedTitleFromPool({ poolKey: 'bronze', seed: 0, usedLabels: ['青铜代码学徒'] })
      if (skipped.label === '青铜代码学徒') throw new Error('expected used title to be skipped')
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

function assertRank(coinTotal: number, expectedRank: ReturnType<typeof getRankForCoins>['rank'], expectedLabel: string) {
  const rank = getRankForCoins(coinTotal)
  const label = getRankLabel(rank.rank)

  if (rank.rank !== expectedRank) throw new Error(`expected rank ${expectedRank}, got ${rank.rank}`)
  if (label !== expectedLabel) throw new Error(`expected label ${expectedLabel}, got ${label}`)
}

function assertTitlePool(
  rank: Parameters<typeof getEarnedTitlePoolKeyForRank>[0],
  expectedPool: ReturnType<typeof getEarnedTitlePoolKeyForRank>,
) {
  const pool = getEarnedTitlePoolKeyForRank(rank)
  if (pool !== expectedPool) throw new Error(`expected ${rank} to use ${expectedPool}, got ${pool}`)
}
