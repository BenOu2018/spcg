import { GAME_CHAPTERS } from '@spcg/shared/game-chapters'
import type { DifficultyLayerLabel, Level, Progress, SpcgLevel, TestCase } from '@spcg/shared/types'

type LevelSeed = {
  id: string
  chapterId: string
  order: number
  title: string
  knowledgePoint: string
  description: string
  spcgLevel: SpcgLevel
  statementImageAlt?: string
  statementImageUrl?: string
  solutionVideoUrl?: string
  stars?: 1 | 2 | 3 | 4 | 5
}

export type LevelNodePosition = {
  id: string
  x: number
  y: number
}

export const levelNodePositions: LevelNodePosition[] = [
  { id: 'ch1-01', x: 0.12, y: 0.82 },
  { id: 'ch1-02', x: 0.18, y: 0.76 },
  { id: 'ch1-03', x: 0.26, y: 0.7 },
  { id: 'ch1-04', x: 0.35, y: 0.64 },
  { id: 'ch1-05', x: 0.45, y: 0.58 },
  { id: 'ch1-06', x: 0.55, y: 0.51 },
  { id: 'ch1-07', x: 0.63, y: 0.43 },
  { id: 'ch1-08', x: 0.7, y: 0.36 },
  { id: 'ch1-09', x: 0.76, y: 0.29 },
  { id: 'ch1-10', x: 0.82, y: 0.23 },
  { id: 'ch1-11', x: 0.78, y: 0.18 },
  { id: 'ch1-12', x: 0.69, y: 0.2 },
]

const seedOverrides: Record<string, Partial<LevelSeed>> = {
  'ch1-01': {
    id: 'ch1-01',
    title: '早安雾镇',
    description: '没有输入。请输出一行：早安雾镇！',
    statementImageAlt: '早安雾镇清晨问候题目图片',
    statementImageUrl: '/assets/problems/ch1-mist-town/ch1-01/statement-main.svg',
  },
  'ch1-02': {
    id: 'ch1-02',
    title: '给袋子贴名字',
    description: '读入一个名字，把它保存到变量里，再按要求输出。',
  },
  'ch1-03': {
    id: 'ch1-03',
    title: '两盏路灯',
    description: '读入两个整数，输出它们的和。',
  },
  'ch1-04': {
    id: 'ch1-04',
    title: '雾桥宽度',
    description: '读入桥的总长和已修好的长度，输出还需要修多少。',
  },
  'ch1-05': {
    id: 'ch1-05',
    title: '星星装箱',
    description: '读入每盒星星数和盒子数，输出总数。',
  },
  'ch1-06': {
    id: 'ch1-06',
    title: '糖果平分',
    description: '读入糖果数和孩子数，输出每人几个、剩几个。',
  },
  'ch1-07': {
    id: 'ch1-07',
    title: '门牌比较',
    description: '读入两个门牌号，输出较大的一个。',
    solutionVideoUrl: '/video/solutions/ch1-mist-town/ch1-07.mp4',
  },
  'ch1-08': {
    id: 'ch1-08',
    title: '雨伞开关',
    description: '根据是否下雨和是否带伞，输出行动建议。',
  },
  'ch1-09': {
    id: 'ch1-09',
    title: '三颗萤火',
    description: '读入亮度等级，输出对应提示。',
    stars: 2,
  },
  'ch1-10': {
    id: 'ch1-10',
    title: '巡逻脚步',
    description: '读入次数，按顺序输出巡逻编号。',
    stars: 2,
  },
  'ch1-11': {
    id: 'ch1-11',
    title: '雾钟倒数',
    description: '从给定数字倒数到 1。',
    stars: 2,
  },
  'ch1-12': {
    id: 'ch1-12',
    title: '第一章出口',
    description: '综合使用输入、输出、判断和循环，完成章节出口题。',
    stars: 3,
  },
}

const seeds: LevelSeed[] = GAME_CHAPTERS.flatMap((chapter) =>
  chapter.levelPlan.map((plan, index) => {
    const base: LevelSeed = {
      id: plan.id,
      chapterId: chapter.chapterId,
      order: index + 1,
      title: plan.title,
      knowledgePoint: plan.knowledgePoint,
      description: plan.storyNode,
      spcgLevel: chapter.spcgLevel,
      stars: chapter.spcgLevel === 1 ? (index >= 11 ? 3 : index >= 8 ? 2 : 1) : chapter.spcgLevel === 2 ? 2 : 3,
    }

    return { ...base, ...seedOverrides[plan.id] }
  }),
)

export const levels: Level[] = seeds.map((seed) => buildLevel(seed))

export const progressRecords: Progress[] = [
  {
    userId: 'demo-user',
    levelId: 'ch1-01',
    passed: false,
    attemptCount: 0,
    bestRuntimeMs: null,
    lastSubmittedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
    passedOut: false,
  },
]

export function getLevel(id: string): Level | undefined {
  return levels.find((level) => level.id === id)
}

export function buildMockJudgeCases(level: Level): TestCase[] {
  const fallbackExpected = level.publicCases[0]?.expectedOutput ?? ''
  const hiddenCases: TestCase[] = Array.from({ length: level.hiddenCount }, (_, index) => ({
    id: `mock-hidden-${String(index + 1).padStart(2, '0')}`,
    input: '',
    expectedOutput: fallbackExpected,
    visibility: 'hidden',
  }))

  return [...level.publicCases, ...hiddenCases]
}

function buildLevel(seed: LevelSeed): Level {
  const publicCases = buildPublicCases(seed)
  const difficultyLabel = buildDifficultyLabel(seed)

  return {
    id: seed.id,
    chapterId: seed.chapterId,
    order: seed.order,
    title: seed.title,
    knowledgePoint: seed.knowledgePoint,
    difficulty: {
      spcgLevel: seed.spcgLevel,
      levelLabel: `SPCG ${seed.spcgLevel}级`,
      stars: seed.stars ?? 1,
      label: difficultyLabel,
      lglevel: null,
    },
    sisterProblem: null,
    description: seed.statementImageUrl
      ? `${seed.description}\n\n![${seed.statementImageAlt ?? seed.title}](${seed.statementImageUrl})`
      : seed.description,
    statementAssets: seed.statementImageUrl
      ? [
          {
            id: 'statement-main',
            type: 'image',
            url: seed.statementImageUrl,
            alt: seed.statementImageAlt ?? seed.title,
            caption: null,
          },
        ]
      : [],
    inputFormat: seed.id === 'ch1-01' ? '无输入。' : '按题目描述读入数据。',
    outputFormat: '输出题目要求的结果。',
    publicCases,
    hiddenCount: 18,
    solutionVideoUrl: seed.solutionVideoUrl ?? null,
    hints: [
      {
        step: 1,
        title: '读清目标',
        content: '先确认输入是什么、最后要输出什么。',
      },
      {
        step: 2,
        title: '找关键词',
        content: `这题主要练习：${seed.knowledgePoint}。`,
      },
      {
        step: 3,
        title: '贴近代码',
        content: '写完后先用公开样例对照输出格式。',
      },
    ],
    solutionUnlocked: false,
    timeLimitMs: 1000,
    memoryLimitMb: 64,
    starterCode:
      '#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在这里写下你的代码\n    return 0;\n}\n',
    source: {
      type: 'original',
      name: 'SPCG 原创',
      url: null,
      author: 'Stephen',
      license: null,
      attribution: null,
      notes: 'v0.1 前端 mock 数据，ch2/ch3 暂作地图联调占位题。',
    },
    guardianId: null,
    story: null,
    passOutProblemId: null,
  }
}

function buildDifficultyLabel(seed: LevelSeed): DifficultyLayerLabel {
  if (seed.spcgLevel >= 3) return '提高'
  if ((seed.stars ?? 1) >= 2) return '基础'
  return '入门'
}

function buildPublicCases(seed: LevelSeed): TestCase[] {
  const casesByLevel: Record<string, Array<[string, string]>> = {
    'ch1-01': [
      ['', '早安雾镇！\n'],
      ['', '早安雾镇！\n'],
    ],
    'ch1-02': [
      ['Mira', 'Mira\n'],
      ['Ben', 'Ben\n'],
    ],
    'ch1-03': [
      ['7', '7\n'],
      ['12', '12\n'],
    ],
    'ch1-04': [
      ['12 5', '7\n'],
      ['100 64', '36\n'],
    ],
    'ch1-05': [
      ['6 7', '42\n'],
      ['8 9', '72\n'],
    ],
    'ch1-06': [
      ['17 5', '3 2\n'],
      ['20 6', '3 2\n'],
    ],
    'ch1-07': [
      ['3 8', '8\n'],
      ['10 4', '10\n'],
    ],
  }
  const baseCases = casesByLevel[seed.id] ?? [
    ['', `${seed.title}\n`],
    ['', `${seed.title}\n`],
  ]

  return baseCases.map(([input, expectedOutput], index) => ({
    id: `case-${String(index + 1).padStart(2, '0')}`,
    visibility: 'public',
    input,
    expectedOutput,
    note: `公开样例 ${index + 1}`,
  }))
}
