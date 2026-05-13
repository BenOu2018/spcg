import type { SpcgLevel } from './types.js'

export type GameChapterId =
  | 'ch1-mist-town'
  | 'ch2-logic-maze'
  | 'ch3-sorting-icefield'
  | 'ch4-frost-bridge'
  | 'ch5-firefly-data-sea'
  | 'ch6-recursive-abyss'
  | 'ch4-flame-stack'
  | 'ch7-rock-fortress'
  | 'ch8-shadow-network-hub'
  | 'ch9-compile-core'

export type GameChapterKind = 'main' | 'side'

export type GameLevelPlan = {
  id: string
  title: string
  knowledgePoint: string
  storyNode: string
}

export type GameMapNodePosition = {
  id: string
  x: number
  y: number
}

export type GameChapter = {
  chapterId: GameChapterId
  kind: GameChapterKind
  order: number
  spcgLevel: SpcgLevel
  displayName: string
  englishName: string
  hudTitle: string
  novelChapters: string
  guardian: string
  coreConcept: string
  storyKeywords: string
  titleExamples: string[]
  mapAsset: string
  nodePositions?: GameMapNodePosition[]
  routeSegments?: string[][]
  levelPlan: GameLevelPlan[]
}

export const GAME_CHAPTERS: GameChapter[] = [
  {
    chapterId: 'ch1-mist-town',
    kind: 'main',
    order: 1,
    spcgLevel: 1,
    displayName: '雾灯村',
    englishName: 'Mist Town',
    hudTitle: '第1级 · 雾灯村',
    novelChapters: '第1-3章',
    guardian: '铁律、星引',
    coreConcept: '基础手打、输入输出、变量、顺序分支循环',
    storyKeywords: '旧灯塔、村学、无句公屏、粮仓断能、金币农阶、蒜粒雨',
    titleExamples: ['晨雾算力学徒'],
    mapAsset: '/assets/art/backgrounds/ch1-mist-town/main-map-v1.webp',
    nodePositions: [
      { id: 'ch1-01', x: 0.18, y: 0.80 },
      { id: 'ch1-02', x: 0.21, y: 0.69 },
      { id: 'ch1-03', x: 0.29, y: 0.63 },
      { id: 'ch1-04', x: 0.38, y: 0.58 },
      { id: 'ch1-05', x: 0.47, y: 0.50 },
      { id: 'ch1-06', x: 0.56, y: 0.48 },
      { id: 'ch1-07', x: 0.64, y: 0.42 },
      { id: 'ch1-08', x: 0.72, y: 0.40 },
      { id: 'ch1-09', x: 0.80, y: 0.36 },
      { id: 'ch1-10', x: 0.73, y: 0.29 },
      { id: 'ch1-11', x: 0.70, y: 0.22 },
      { id: 'ch1-12', x: 0.83, y: 0.15 },
    ],
    levelPlan: [
      { id: 'ch1-01', title: '早安雾灯村', knowledgePoint: '输出 cout', storyNode: '犬虎在旧灯塔下写出第一句手打输出。' },
      { id: 'ch1-02', title: '贫民金币', knowledgePoint: '变量定义与赋值', storyNode: '把捡到的金币和农阶信息存进变量。' },
      { id: 'ch1-03', title: '粮仓读入', knowledgePoint: 'cin / cout', storyNode: '粮仓断能后，先把真实数量读清楚。' },
      { id: 'ch1-04', title: '灯塔记分钟', knowledgePoint: '算术表达式与时间换算', storyNode: '记录旧灯塔维护开始和结束时刻。' },
      { id: 'ch1-05', title: '粮饼分装', knowledgePoint: '整除与取模', storyNode: '村仓平均分粮，剩余也要记录。' },
      { id: 'ch1-06', title: '雾天要不要带灯', knowledgePoint: '单分支 if', storyNode: '雾厚到一定程度才带额外灯芯。' },
      { id: 'ch1-07', title: '粮仓搬运单', knowledgePoint: '双分支 if-else', storyNode: '判断雾币是否够付搬运和修车费用。' },
      { id: 'ch1-08', title: '农阶通行牌', knowledgePoint: '多分支 if-else if', storyNode: '不同农阶对应不同基础补给权限。' },
      { id: 'ch1-09', title: '一百行训练', knowledgePoint: 'for 固定次数循环', storyNode: '铁律要求犬虎按固定次数手打基础代码。' },
      { id: 'ch1-10', title: '等到公屏恢复', knowledgePoint: 'while 条件循环', storyNode: '无句公屏断能时持续检查直到恢复。' },
      { id: 'ch1-11', title: '任务金币累加', knowledgePoint: '循环累加', storyNode: '完成多项村级任务后统计总金币。' },
      { id: 'ch1-12', title: '雾灯村的一天', knowledgePoint: '顺序、分支、循环综合', storyNode: '整理村学、粮仓、灯塔和蒜粒雨前流程。' },
    ],
  },
  {
    chapterId: 'ch2-logic-maze',
    kind: 'main',
    order: 2,
    spcgLevel: 2,
    displayName: '逻辑迷宫',
    englishName: 'Logic Maze',
    hudTitle: '第2级 · 逻辑迷宫',
    novelChapters: '第4-6章',
    guardian: '迷锁',
    coreConcept: '条件判断不是相信标签，而是自己定义真假',
    storyKeywords: '岔路、真假安全门、第三条路、隐藏出口、条件树',
    titleExamples: ['判路小哨', '岔路斥候', '破迷行者', '觅路先锋'],
    mapAsset: '/assets/art/backgrounds/ch2-logic-maze/main-map-fairytale-v1.webp',
    nodePositions: [
      { id: 'ch2-01', x: 0.11, y: 0.78 },
      { id: 'ch2-02', x: 0.19, y: 0.67 },
      { id: 'ch2-03', x: 0.31, y: 0.62 },
      { id: 'ch2-04', x: 0.43, y: 0.55 },
      { id: 'ch2-05', x: 0.52, y: 0.68 },
      { id: 'ch2-06', x: 0.62, y: 0.56 },
      { id: 'ch2-07', x: 0.7, y: 0.43 },
      { id: 'ch2-08', x: 0.81, y: 0.48 },
      { id: 'ch2-09', x: 0.86, y: 0.33 },
      { id: 'ch2-10', x: 0.73, y: 0.27 },
      { id: 'ch2-11', x: 0.57, y: 0.25 },
      { id: 'ch2-12', x: 0.82, y: 0.18 },
    ],
    levelPlan: [
      { id: 'ch2-01', title: '直线石环', knowledgePoint: '流程图：顺序结构', storyNode: '把进入迷宫前的准备画成步骤。' },
      { id: 'ch2-02', title: '左右岔门', knowledgePoint: '流程图：分支结构', storyNode: '根据真实条件选择光门或暗门。' },
      { id: 'ch2-03', title: '回声石阶', knowledgePoint: '流程图：循环结构', storyNode: '重复检查石阶，直到找到标记。' },
      { id: 'ch2-04', title: '字符门牌', knowledgePoint: 'ASCII 编码', storyNode: '把门牌字符换成编号识别机关。' },
      { id: 'ch2-05', title: '变形钥匙', knowledgePoint: '强制类型转换', storyNode: '钥匙编号在整数、实数和字符间变化。' },
      { id: 'ch2-06', title: '迷宫测距', knowledgePoint: '数学库函数', storyNode: '用绝对值、平方根和取整估算距离。' },
      { id: 'ch2-07', title: '随机雾门', knowledgePoint: '随机数基础', storyNode: '雾门随机亮起，犬虎要生成一次选择。' },
      { id: 'ch2-08', title: '三层机关', knowledgePoint: '多层条件语句', storyNode: '门后还有门，条件里继续判断。' },
      { id: 'ch2-09', title: '编号转盘', knowledgePoint: 'switch / 多值分类', storyNode: '不同门牌编号触发不同动作。' },
      { id: 'ch2-10', title: '三种脚步', knowledgePoint: '循环结构对比', storyNode: '不同迷宫段选择不同循环方式。' },
      { id: 'ch2-11', title: '方阵迷宫', knowledgePoint: '多层循环', storyNode: '按行列扫描迷宫地砖。' },
      { id: 'ch2-12', title: '第三条路', knowledgePoint: '分支与循环综合', storyNode: '犬虎不走亮门也不退回，而是找到隐藏出口。' },
    ],
  },
  {
    chapterId: 'ch3-sorting-icefield',
    kind: 'main',
    order: 3,
    spcgLevel: 3,
    displayName: '冰原前哨',
    englishName: 'Icefield Outpost',
    hudTitle: '第3级 · 冰原前哨',
    novelChapters: '第7-9章',
    guardian: '寒霜、铁律',
    coreConcept: '先把雪灯、冰牌和风雪记录整理成可处理数据',
    storyKeywords: '算法纸条、雪灯巡查、最冷雪灯、二进制冰灯、补码冰纹、位灯开关、冰牌文字、风雪模拟',
    titleExamples: ['纸条译者', '雪灯记官', '位灯巡使', '枚举哨兵'],
    mapAsset: '/assets/art/backgrounds/ch3-sorting-icefield/main-map-spcg-color-v1.webp',
    nodePositions: [
      { id: 'ch3-01', x: 0.15, y: 0.85 },
      { id: 'ch3-02', x: 0.28, y: 0.68 },
      { id: 'ch3-03', x: 0.20, y: 0.50 },
      { id: 'ch3-04', x: 0.35, y: 0.55 },
      { id: 'ch3-05', x: 0.50, y: 0.66 },
      { id: 'ch3-06', x: 0.63, y: 0.68 },
      { id: 'ch3-07', x: 0.75, y: 0.83 },
      { id: 'ch3-08', x: 0.85, y: 0.88 },
      { id: 'ch3-09', x: 0.85, y: 0.68 },
      { id: 'ch3-10', x: 0.75, y: 0.50 },
      { id: 'ch3-11', x: 0.68, y: 0.30 },
      { id: 'ch3-12', x: 0.50, y: 0.20 },
      { id: 'ch3-13', x: 0.80, y: 0.18 },
    ],
    routeSegments: [
      ['ch3-01', 'ch3-02'],
      ['ch3-02', 'ch3-03'],
      ['ch3-03', 'ch3-04'],
      ['ch3-04', 'ch3-05'],
      ['ch3-05', 'ch3-06'],
      ['ch3-06', 'ch3-07'],
      ['ch3-07', 'ch3-08'],
      ['ch3-08', 'ch3-09'],
      ['ch3-09', 'ch3-10'],
      ['ch3-10', 'ch3-11'],
      ['ch3-11', 'ch3-12'],
      ['ch3-12', 'ch3-13'],
    ],
    levelPlan: [
      { id: 'ch3-01', title: '算法纸条', knowledgePoint: '自然语言、流程图、伪代码描述算法', storyNode: '把寒霜留在前哨的巡检规则翻译成可执行步骤。' },
      { id: 'ch3-02', title: '雪灯巡查', knowledgePoint: '一维数组遍历', storyNode: '按顺序检查一排雪灯是否仍然发热。' },
      { id: 'ch3-03', title: '最冷雪灯', knowledgePoint: '数组统计：最大值、最小值、计数、求和', storyNode: '从热值记录中找出最危险的低温段。' },
      { id: 'ch3-04', title: '二进制冰灯', knowledgePoint: '进制转换', storyNode: '把冰灯明暗记录在十进制和二进制之间互转。' },
      { id: 'ch3-05', title: '补码冰纹', knowledgePoint: '原码、反码、补码', storyNode: '读懂负温冰纹在机器里的真实表示。' },
      { id: 'ch3-06', title: '位灯开关', knowledgePoint: '位运算 AND/OR/XOR/NOT', storyNode: '用位运算控制一排雪灯的开关状态。' },
      { id: 'ch3-07', title: '雪盘移位', knowledgePoint: '左移与右移', storyNode: '让雪盘编号按二倍或半数规则移动。' },
      { id: 'ch3-08', title: '冰牌文字', knowledgePoint: '字符串遍历与基本函数', storyNode: '逐字符检查冰牌上的巡逻日志。' },
      { id: 'ch3-09', title: '找到裂纹', knowledgePoint: '字符串查找与截取', storyNode: '在冰桥记录中定位裂纹编号。' },
      { id: 'ch3-10', title: '整理告示', knowledgePoint: '字符串分割、替换、大小写转换', storyNode: '把前哨告示清洗成统一格式。' },
      { id: 'ch3-11', title: '全部试一遍', knowledgePoint: '枚举法', storyNode: '枚举所有可行的巡检方案，找出能通过前哨的路径。' },
      { id: 'ch3-12', title: '风雪模拟', knowledgePoint: '模拟法', storyNode: '按风雪规则一步步更新雪灯状态。' },
      { id: 'ch3-13', title: '冰原前哨', knowledgePoint: '数组、字符串、枚举、模拟综合', storyNode: '用数据结构承载完整巡检流程，抵达寒霜冰桥外环。' },
    ],
  },
  {
    chapterId: 'ch4-frost-bridge',
    kind: 'main',
    order: 4,
    spcgLevel: 4,
    displayName: '寒霜冰桥',
    englishName: 'Frost Bridge',
    hudTitle: '第4级 · 寒霜冰桥',
    novelChapters: '第10-12章',
    guardian: '寒霜',
    coreConcept: '在寒霜冰桥上理解稳定、边界、效率和日志读写',
    storyKeywords: '冰格坐标、多层冰仓、函数火把、雪线递推、稳定雪队、基础排序、风暴估时、冰原日志',
    titleExamples: ['排阵校手', '寒序校官', '稳序术士', '估时巡官'],
    mapAsset: '/assets/art/backgrounds/ch4-frost-bridge/main-map-v2.webp',
    nodePositions: [
      { id: 'ch4-01', x: 0.07, y: 0.76 },
      { id: 'ch4-02', x: 0.17, y: 0.77 },
      { id: 'ch4-03', x: 0.28, y: 0.73 },
      { id: 'ch4-04', x: 0.39, y: 0.72 },
      { id: 'ch4-05', x: 0.48, y: 0.65 },
      { id: 'ch4-06', x: 0.38, y: 0.58 },
      { id: 'ch4-07', x: 0.29, y: 0.5 },
      { id: 'ch4-08', x: 0.45, y: 0.48 },
      { id: 'ch4-09', x: 0.51, y: 0.36 },
      { id: 'ch4-10', x: 0.6, y: 0.43 },
      { id: 'ch4-11', x: 0.68, y: 0.5 },
      { id: 'ch4-12', x: 0.75, y: 0.58 },
      { id: 'ch4-13', x: 0.85, y: 0.51 },
      { id: 'ch4-14', x: 0.77, y: 0.32 },
      { id: 'ch4-15', x: 0.91, y: 0.16 },
    ],
    routeSegments: [
      [
        'ch4-01',
        'ch4-02',
        'ch4-03',
        'ch4-04',
        'ch4-05',
        'ch4-06',
        'ch4-07',
        'ch4-08',
        'ch4-09',
        'ch4-10',
        'ch4-11',
        'ch4-12',
        'ch4-13',
        'ch4-14',
        'ch4-15',
      ],
    ],
    levelPlan: [
      { id: 'ch4-01', title: '冰格坐标', knowledgePoint: '二维数组遍历', storyNode: '按行列检查寒霜冰桥的裂纹格。' },
      { id: 'ch4-02', title: '多层冰仓', knowledgePoint: '多维数组应用', storyNode: '管理多层冰仓里不同深度的雪灯记录。' },
      { id: 'ch4-03', title: '函数火把', knowledgePoint: '函数定义与调用', storyNode: '把反复使用的巡检动作封成函数。' },
      { id: 'ch4-04', title: '传值与传令', knowledgePoint: '值传递与引用传递', storyNode: '判断巡检函数能不能把修改带回原处。' },
      { id: 'ch4-05', title: '雪线递推', knowledgePoint: '递推关系', storyNode: '由上一段雪线状态推出下一段风险。' },
      { id: 'ch4-06', title: '边界第一灯', knowledgePoint: '递推初值与边界', storyNode: '给递推找到第一盏不会出错的灯。' },
      { id: 'ch4-07', title: '稳定雪队', knowledgePoint: '排序概念与稳定性', storyNode: '同热值雪灯不能打乱原始到达顺序。' },
      { id: 'ch4-08', title: '冒泡破冰', knowledgePoint: '冒泡排序', storyNode: '用相邻交换把危险值逐步推到桥边。' },
      { id: 'ch4-09', title: '插入雪签', knowledgePoint: '插入排序', storyNode: '把新雪签插进已经有序的巡检队列。' },
      { id: 'ch4-10', title: '选择冰晶', knowledgePoint: '选择排序', storyNode: '每轮选出当前最冷冰晶，固定一段安全路。' },
      { id: 'ch4-11', title: '插选雪阵', knowledgePoint: '插入排序、选择排序和应用', storyNode: '在不同雪阵里选择更合适的基础排序策略。' },
      { id: 'ch4-12', title: '结构体雪册', knowledgePoint: '结构体排序', storyNode: '按多项记录整理巡检名单和成绩册。' },
      { id: 'ch4-13', title: '风暴估时', knowledgePoint: '简单时间复杂度估算', storyNode: '判断算法能否在风暴抵达前跑完。' },
      { id: 'ch4-14', title: '冰原日志读写', knowledgePoint: '文件读写', storyNode: '把巡查结果写入日志，再从日志中复核。' },
      { id: 'ch4-15', title: '寒霜总复习', knowledgePoint: '函数、字符串、排序、前缀统计综合', storyNode: '整合前面技能，完成寒霜冰桥最终训练。' },
    ],
  },
  {
    chapterId: 'ch6-recursive-abyss',
    kind: 'main',
    order: 5,
    spcgLevel: 5,
    displayName: '递归深渊',
    englishName: 'Recursive Abyss',
    hudTitle: '第5级 · 递归深渊',
    novelChapters: '第13-15章',
    guardian: '锐齿',
    coreConcept: '层层展开、层层回收，抵抗只生成浅层答案的诱惑',
    storyKeywords: 'GCD、LCM、质数、筛法、高精度、链表、二分、递归、贪心、分治、归并、快排',
    titleExamples: ['递归行者', '分治术士', '回溯旅人', '裂层巡使'],
    mapAsset: '/assets/art/backgrounds/ch3-sorting-icefield/main-map-v2.webp',
    levelPlan: [
      { id: 'ch5-01', title: '裂谷最大公约', knowledgePoint: '最大公约数 GCD', storyNode: '用辗转相除法找到两段裂谷的共同节律。' },
      { id: 'ch5-02', title: '同频最小倍', knowledgePoint: '最小公倍数 LCM', storyNode: '计算两条安全绳再次同频的最短距离。' },
      { id: 'ch5-03', title: '质数星砂', knowledgePoint: '质数判断', storyNode: '筛出不能再拆分的星砂编号。' },
      { id: 'ch5-04', title: '深渊筛灯', knowledgePoint: '埃氏筛法', storyNode: '批量熄灭合数灯，保留质数路径。' },
      { id: 'ch5-05', title: '线性筛索', knowledgePoint: '线性筛', storyNode: '让每盏合数灯只被最小质因子标记一次。' },
      { id: 'ch5-06', title: '因数剥层', knowledgePoint: '分解质因数', storyNode: '把深渊石层拆成质因数记录。' },
      { id: 'ch5-07', title: '高精度加减', knowledgePoint: '高精度加减法', storyNode: '处理普通整数装不下的深度刻度。' },
      { id: 'ch5-08', title: '高精度乘除', knowledgePoint: '高精度乘除法', storyNode: '计算巨大安全绳长度和分段补给。' },
      { id: 'ch5-09', title: '链表绳结', knowledgePoint: '链表基础', storyNode: '用节点串起会动态变化的绳结。' },
      { id: 'ch5-10', title: '反转绳梯', knowledgePoint: '链表反转', storyNode: '把下行绳梯反向变成返回路线。' },
      { id: 'ch5-11', title: '折半寻灯', knowledgePoint: '二分查找', storyNode: '在有序深度刻度中快速找到目标灯。' },
      { id: 'ch5-12', title: '二分答案', knowledgePoint: '二分答案', storyNode: '把“最少需要多少补给”转成可判定问题。' },
      { id: 'ch5-13', title: '递归入口', knowledgePoint: '递归基础', storyNode: '把大问题拆成同结构的小问题。' },
      { id: 'ch5-14', title: '回到边界', knowledgePoint: '递归边界与复杂度', storyNode: '找到必须停止下探的边界。' },
      { id: 'ch5-15', title: '贪心补给', knowledgePoint: '贪心算法', storyNode: '每一步选择当前最能延长生存的补给。' },
      { id: 'ch5-16', title: '分治裂层', knowledgePoint: '分治算法', storyNode: '把裂层分开处理，再合并结果。' },
      { id: 'ch5-17', title: '归并快影', knowledgePoint: '归并排序与快速排序', storyNode: '用分治排序理解深渊末层的高效合并。' },
    ],
  },
  {
    chapterId: 'ch4-flame-stack',
    kind: 'main',
    order: 6,
    spcgLevel: 6,
    displayName: '烈焰堆栈',
    englishName: 'Flame Stack',
    hudTitle: '第6级 · 烈焰堆栈',
    novelChapters: '第16-18章',
    guardian: '烬语、流萤',
    coreConcept: '在火牌、熔岩队列、完全火树和火树中建立结构化秩序',
    storyKeywords: '栈、队列、循环队列、树、二叉树遍历、哈夫曼、格雷码、DFS、BFS、一维 DP、背包',
    titleExamples: ['栈火使者', '队列校官', '后进行者', '余烬术士'],
    mapAsset: '/assets/art/backgrounds/ch3-sorting-icefield/main-map-v2.webp',
    levelPlan: [
      { id: 'ch6-01', title: '火牌入栈', knowledgePoint: '栈', storyNode: '后放入的火牌必须先处理。' },
      { id: 'ch6-02', title: '熔岩队列', knowledgePoint: '队列', storyNode: '先到的矿车先穿过熔岩闸口。' },
      { id: 'ch6-03', title: '环形火轨', knowledgePoint: '循环队列', storyNode: '让有限火轨循环装载任务。' },
      { id: 'ch6-04', title: '火树根脉', knowledgePoint: '树', storyNode: '理解补给脉络的父子关系。' },
      { id: 'ch6-05', title: '遍历火树', knowledgePoint: '二叉树遍历', storyNode: '按前序、中序、后序读取火树信息。' },
      { id: 'ch6-06', title: '完全火树', knowledgePoint: '完全二叉树', storyNode: '用数组下标定位完全火树节点。' },
      { id: 'ch6-07', title: '搜索火枝', knowledgePoint: '二叉搜索树', storyNode: '在有序火枝中快速定位目标晶核。' },
      { id: 'ch6-08', title: '哈夫曼火码', knowledgePoint: '哈夫曼树', storyNode: '给频繁信号更短编码，压缩火场通信。' },
      { id: 'ch6-09', title: '灰码火门', knowledgePoint: '格雷码', storyNode: '让相邻火门状态每次只变化一位。' },
      { id: 'ch6-10', title: '深搜火廊', knowledgePoint: 'DFS', storyNode: '沿一条火廊探到底，再回退搜索。' },
      { id: 'ch6-11', title: '广搜撤离', knowledgePoint: 'BFS', storyNode: '按层推进，找到最短撤离路线。' },
      { id: 'ch6-12', title: '火树寻路', knowledgePoint: '二叉树搜索综合', storyNode: '结合树结构和搜索找到补给节点。' },
      { id: 'ch6-13', title: '余烬状态', knowledgePoint: '一维 DP', storyNode: '用状态保存每一步后的最优余烬值。' },
      { id: 'ch6-14', title: '背包蒜粒', knowledgePoint: '简单背包', storyNode: '在容量有限时选择最有效的蒜粒补给。' },
      { id: 'ch6-15', title: '烈焰堆栈', knowledgePoint: '栈、队列、树、搜索、DP 综合', storyNode: '修复火脉补给线，并开启萤光数据海副本入口。' },
    ],
  },
  {
    chapterId: 'ch7-rock-fortress',
    kind: 'main',
    order: 7,
    spcgLevel: 7,
    displayName: '磐石要塞',
    englishName: 'Rock Fortress',
    hudTitle: '第7级 · 磐石要塞',
    novelChapters: '第19-21章',
    guardian: '磐岩',
    coreConcept: '每一步都承受之前所有选择的重量',
    storyKeywords: '图遍历、哈希、数学函数、二维 DP、区间 DP、LIS、LCS、滚动数组',
    titleExamples: ['决策校官', '状态术士', '转移行者', '磐策将官'],
    mapAsset: '/assets/art/backgrounds/ch3-sorting-icefield/main-map-v2.webp',
    levelPlan: [],
  },
  {
    chapterId: 'ch8-shadow-network-hub',
    kind: 'main',
    order: 8,
    spcgLevel: 8,
    displayName: '影网枢纽',
    englishName: 'Shadow Network Hub',
    hudTitle: '第8级 · 影网枢纽',
    novelChapters: '第22-24章',
    guardian: '蚀影',
    coreConcept: '看见网络中的路径、坐标关系，区分复制答案和真正理解',
    storyKeywords: '倍增、组合计数、杨辉三角、MST、最短路、坐标几何、图论综合',
    titleExamples: ['图路使者', '网流校官', '暗边潜客', '影链行者'],
    mapAsset: '/assets/art/backgrounds/ch3-sorting-icefield/main-map-v2.webp',
    levelPlan: [],
  },
  {
    chapterId: 'ch9-compile-core',
    kind: 'main',
    order: 9,
    spcgLevel: 9,
    displayName: '编译核心',
    englishName: 'Compile Core',
    hudTitle: '第9级 · 编译核心',
    novelChapters: '第25-27章',
    guardian: '终端',
    coreConcept: '汇总前八关能力，把无句错误转化为 SPCG 新题',
    storyKeywords: '综合算法、数据结构、图论、DP、数论、SPCG',
    titleExamples: ['源码执令', '终端使者', '共生行者', '星环守卫'],
    mapAsset: '/assets/art/backgrounds/ch3-sorting-icefield/main-map-v2.webp',
    levelPlan: [],
  },
]

export const SIDE_STORY_CHAPTERS: GameChapter[] = [
  {
    chapterId: 'ch5-firefly-data-sea',
    kind: 'side',
    order: 6,
    spcgLevel: 6,
    displayName: '萤光数据海',
    englishName: 'Firefly Data Sea',
    hudTitle: '剧情副本 · 萤光数据海',
    novelChapters: '第16-18章支线',
    guardian: '流萤',
    coreConcept: '在真实数据和真实痛苦之间寻找路径',
    storyKeywords: '水下遗迹、搜索、遍历、连通水道、病历索引、弱信号',
    titleExamples: ['寻迹行者', '深搜潜客', '广搜巡使', '萤海巡官'],
    mapAsset: '/assets/art/backgrounds/ch3-sorting-icefield/main-map-v2.webp',
    levelPlan: [],
  },
]

const ALL_GAME_CHAPTERS = [...GAME_CHAPTERS, ...SIDE_STORY_CHAPTERS]

export function getGameChapter(chapterId?: string | null): GameChapter {
  return ALL_GAME_CHAPTERS.find((chapter) => chapter.chapterId === chapterId) ?? GAME_CHAPTERS[0]!
}

export function listGameChapters(): GameChapter[] {
  return GAME_CHAPTERS
}

export function listAllGameChapters(): GameChapter[] {
  return ALL_GAME_CHAPTERS
}
