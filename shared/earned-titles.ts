import type { RewardRank } from './types.js'

export type EarnedTitlePoolKey =
  | 'scrap_iron'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'stellar'
  | 'king'
  | 'master'
  | 'grandmaster'

export type EarnedTitleDefinition = {
  key: string
  label: string
  poolKey: EarnedTitlePoolKey
}

export type EarnedTitleSelection = EarnedTitleDefinition & {
  index: number
}

export const EARNED_TITLE_POOLS = {
  scrap_iron: [
    '黑铁见习生',
    '数据搬运工',
    '初级代码兵',
    '逻辑新兵',
    '字符串学徒',
    '条件判断员',
    '循环训练兵',
    '输入输出员',
    '数组巡逻兵',
    '调试新人',
  ],
  bronze: [
    '青铜代码学徒',
    '数据整理员',
    '模拟执行者',
    '变量操控员',
    '初级算法员',
    '数字探索者',
    '逻辑工程兵',
    '字符修复师',
    '数组观察者',
    '递推记录员',
  ],
  silver: [
    '白银逻辑师',
    '数据流巡查官',
    '模拟分析师',
    '枚举猎手',
    '坐标探测员',
    '二维矩阵师',
    '数学构造者',
    '条件指挥官',
    '循环掌控者',
    '运算执行官',
  ],
  gold: [
    '黄金算法师',
    '数据矩阵官',
    '规律破解者',
    'AI终端员',
    '图形分析员',
    '几何观测者',
    '逻辑战术官',
    '数学工程师',
    '结构修复师',
    '信息处理中枢',
  ],
  platinum: [
    '铂金递归术士',
    '深度探索者',
    '回溯执行官',
    '递归构造师',
    '树结构行者',
    '路径分析员',
    '搜索先遣队长',
    '算法战术师',
    '空间探测官',
    '数据追踪者',
  ],
  diamond: [
    '钻石图论使徒',
    '网络巡游者',
    '最短路指挥官',
    'BFS先锋',
    'DFS猎手',
    '路径规划师',
    '数据网络官',
    'AI节点使者',
    '信息流掌控者',
    '连接领域守卫',
  ],
  stellar: [
    '星耀状态架构师',
    '动态规划师',
    '状态推演者',
    '时间线构造者',
    '算法策略官',
    '维度分析师',
    '数据链主宰',
    '复杂系统工程师',
    '状态文明学者',
    'AI策略统帅',
  ],
  master: [
    '大师数据统领',
    '算法舰队长',
    '银河逻辑官',
    '神经网络巡游者',
    '数据文明将军',
    'AI核心护卫',
    '代码战场统帅',
    '高维结构师',
    '复杂度掌控者',
    '算法领域宗师',
  ],
  grandmaster: [
    '宗师维度构造者',
    '文明级架构师',
    '奇点工程师',
    '数据圣殿骑士',
    '算法圣者',
    'AI文明议长',
    '未来网络主宰',
    '深空计算官',
    '神经矩阵支配者',
    '超维逻辑生命体',
  ],
  king: [
    '王者文明核心',
    '终焉算法主宰',
    '超维数据皇帝',
    '银河AI统帅',
    '永恒逻辑之王',
    '数学文明继承者',
    '神级递归掌控者',
    '终极图论之神',
    '奇点架构者',
    '人类算法文明火种',
  ],
} as const satisfies Record<EarnedTitlePoolKey, readonly string[]>

export const EARNED_TITLE_CATALOG: readonly EarnedTitleDefinition[] = Object.entries(EARNED_TITLE_POOLS).flatMap(
  ([poolKey, titles]) =>
    titles.map((label, index) => ({
      key: `${poolKey}-${String(index + 1).padStart(2, '0')}`,
      label,
      poolKey: poolKey as EarnedTitlePoolKey,
    })),
)

export function getEarnedTitlePoolKeyForRank(rank: RewardRank): EarnedTitlePoolKey {
  if (rank === 'legend' || rank === 'server') return 'king'
  return rank
}

export function pickEarnedTitleFromPool(input: {
  poolKey: EarnedTitlePoolKey
  seed: number
  usedLabels?: Iterable<string>
}): EarnedTitleSelection {
  const titles = [...EARNED_TITLE_POOLS[input.poolKey]]
  const usedLabels = new Set(input.usedLabels ?? [])
  const availableTitles = titles.filter((title) => !usedLabels.has(title))
  const candidates = availableTitles.length > 0 ? availableTitles : titles
  const normalizedSeed = Math.abs(Math.trunc(input.seed))
  const pickedLabel = candidates[normalizedSeed % candidates.length] ?? titles[0]!
  const index = titles.indexOf(pickedLabel)
  return {
    key: `${input.poolKey}-${String(index + 1).padStart(2, '0')}`,
    label: pickedLabel,
    poolKey: input.poolKey,
    index,
  }
}
