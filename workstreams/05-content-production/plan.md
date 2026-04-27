# 05 · 内容生产（12 关）

> 负责：算法老师 + AI 协同（Stephen 主导）
> 起跑日：Day 1
> 交付：12 个关卡 .md 文件 + 测试用例

---

## 流水线

```
Day 1：老师定 12 关基础信息
  - 知识点（已在 TODO.md 列出）
  - 关卡名（可微调）
  - 难度梯度
       ↓
Day 2：第 1 关老师亲笔写完整内容
  - 作为 AI 模板的"金标准"
  - 包括题面、5-10 测试用例、starter code
       ↓
Day 3-5：AI 批量生成 11 关草稿
  - 用第 1 关做 few-shot 示例
  - Claude API 一次出 2-3 关
       ↓
Day 6-12：老师 review 11 关
  - 每关 ≥ 30 分钟
  - 改题面、补 case、调难度、改童化语气
       ↓
Day 13-15：批量入库
  - scripts/seed-levels.ts 解析 .md → INSERT levels
  - 配合 03 工作流验证 DB
```

---

## 关卡列表（v0.1）

| # | 文件 | 知识点 | 难度（5★ 制） | 状态 |
|---|---|---|---|---|
| 1 | `01-早安雾镇.md` | 输出 cout | ★ | ⬜ 老师亲写 |
| 2 | `02-给袋子贴名字.md` | 变量定义与赋值 | ★ | ⬜ |
| 3 | `03-数袋子.md` | cin / cout | ★★ | ⬜ |
| 4 | `04-称重小账本.md` | 加减乘除 | ★★ | ⬜ |
| 5 | `05-切苹果.md` | 整除与取模 | ★★ | ⬜ |
| 6 | `06-雨伞要不要带.md` | 单分支 if | ★★ | ⬜ |
| 7 | `07-早餐选粥还是饭.md` | 双分支 if-else | ★★★ | ⬜ |
| 8 | `08-红绿黄三色信号.md` | 多分支 if-else if | ★★★ | ⬜ |
| 9 | `09-走十步到学校.md` | for 循环 | ★★★ | ⬜ |
| 10 | `10-数到月亮升起.md` | while 循环 | ★★★ | ⬜ |
| 11 | `11-攒糖罐.md` | 累加求和 | ★★★★ | ⬜ |
| 12 | `12-雾镇的清晨.md` | 综合（顺序+分支+循环） | ★★★★★ | ⬜ |

存储路径：`content/chapters/ch1-mist-town/levels/{nn}-{name}.md`

> 关卡名为初稿，老师可调。

---

## 关卡 .md 模板（v0.1 极简版）

> v0.2 完整模板见 [content/chapters/_template-level.md](../../content/chapters/_template-level.md)（含守护者、故事场景、跳级题）。
> v0.1 用以下精简版：

```markdown
---
levelId: ch1-01
chapterId: ch1-mist-town
order: 1
title: 早安雾镇
knowledgePoint: 输出 cout
language: cpp
timeLimitMs: 1000
memoryLimitMb: 64

# v0.2 字段（v0.1 留空）
guardianId: null
story: null
passOutProblemId: null

visibleCases:
  - input: ""
    expectedOutput: "早安雾镇！\n"

hiddenCases:
  - input: ""
    expectedOutput: "早安雾镇！\n"
  # 5-10 组隐藏用例

starterCode: |
  #include <iostream>
  using namespace std;
  int main() {
      // 在这里写下你的代码
      return 0;
  }
---

# 任务描述

帮犬虎小狗对着镜子大声说一声 `早安雾镇！`

## 输入格式

无输入。

## 输出格式

输出一行字符串：`早安雾镇！`

（无需多余的空格或标点。）

## 公开样例

### 样例 1

**输入**：
（无）

**输出**：
```
早安雾镇！
```
```

---

## AI 批量生成 prompt 模板

```
你是 SPCG 算法学习平台的内容编辑。请为 10-12 岁的中国孩子设计一道 C++ 编程题。

## 输入

- 知识点：{knowledgePoint}
- 关卡名：{title}
- 难度：GESP 1 级第 {order}/12 关
- 风格参考：见下方"金标准样例"

## 金标准样例（第 1 关，老师亲写）

[此处贴入 01-早安雾镇.md 的完整内容]

## 输出要求

完全按照金标准的 markdown + frontmatter 格式输出。注意：

1. **题面用孩子能理解的语言**——避免"求解" "计算" 这类正式词
2. **故事化**——把题目包装成日常情境（早晨的、做饭的、上学路上的）
3. **5-10 组 hiddenCases**——覆盖：基本情况、边界值（0、负数、最大值）、特殊输入
4. **公开样例**只给 1-3 个，最简单的
5. **starterCode** 必须能编译（含 main 函数和必要 include）
6. **不要**写 guardianId / story / passOutProblemId（v0.1 留 null）

## 输出

直接输出完整的 markdown 文件内容（含 frontmatter），不要解释。
```

---

## 老师 review checklist

每关 review 时检查：

- [ ] 题面孩子能读懂吗？有没有歧义？
- [ ] 输入输出格式描述清楚吗？
- [ ] 公开样例够浅显吗？至少 1 个能"一眼看懂答案"
- [ ] 隐藏 case 覆盖到边界了吗？
  - 最小输入（0、空、1 个元素）
  - 最大输入（接近 int 上限 / 数组上限）
  - 特殊情况（负数、零、相等）
  - "陷阱"输入（学生容易忽略的）
- [ ] 时间限制合理吗？1 秒对 GESP 1 级是否过紧？
- [ ] starter code 能直接编译吗？有没有语法错误？
- [ ] 难度比上一关稍高吗？跳跃太大了吗？

---

## 周计划

### Week 1
- Day 1：老师定 12 关知识点 + 关卡名 + 难度（半天）
- Day 2：老师亲笔写第 1 关完整内容（金标准）
- Day 3：调试 AI prompt，第 2-3 关草稿生出来
- Day 4-5：第 4-7 关草稿生出来

### Week 2
- Day 6：第 8-10 关草稿
- Day 7：第 11-12 关草稿（综合关需要老师介入更多）
- Day 8-10：老师每天 review 2-3 关，修正

### Week 3
- Day 11-12：seed 脚本批量入库，配合 02/03 验证 API
- Day 13-15：内测发现的内容问题修正（必有）

---

## v0.2 扩展点

| 扩展 | 模板改动 |
|---|---|
| 守护者出场 | frontmatter 加 `guardianId`，老师为每关挑一位守护者 |
| 故事场景 | frontmatter 加 `story` 字段 + markdown 文件加"故事场景"章节 |
| 跳级挑战题 | 新增 frontmatter `passOutProblem` 嵌套块（含独立题面 + cases） |
| 守护者口吻文案 | AI prompt 加"用 {守护者性格} 的语气写题面" |
| 通关导师讲解 | 模板加"通关讲解"章节（200-400 字） |
| 三星标准 | frontmatter 加 `starCriteria: { time, codeQuality }` |

---

## 验收标准

- [ ] 12 关全部 .md 文件就位
- [ ] 每关至少 5 个 hiddenCases
- [ ] 每关 starter code 能编译
- [ ] 老师在每关签字（commit message 标 `reviewed-by: <name>`）
- [ ] AI 草稿 vs 老师定稿的 diff 留档（用于优化下一批 prompt）
- [ ] seed 脚本能将 12 关全部入库
- [ ] 内测 5 个孩子按顺序能通过 70% 以上（说明难度合理）

---

## 风险

| 风险 | 应对 |
|---|---|
| AI 生成的题"看着对，实际有教学瑕疵" | 老师每关亲审 ≥ 30 分钟，不能省 |
| 测试用例有边界遗漏 | 老师专门跑一遍"反 case 思路"——故意写错代码看能否被抓 |
| 难度梯度不合理 | 内测期前后两关难度比照 + 通过率监控 |
| 老师 review 拖延 | Stephen 每天督促，按周打卡 |
