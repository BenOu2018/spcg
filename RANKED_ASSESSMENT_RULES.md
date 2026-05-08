# SPCG 段位赛题单生成规则

## 规则来源

代码级规则保存在 `shared/ranked-assessment.ts`，这是系统运行时使用的唯一规则来源。

本文档是给后台、题库导入和后续 agent 使用的人类可读说明。修改规则时必须同步更新：

- `shared/ranked-assessment.ts`
- `RANKED_ASSESSMENT_RULES.md`
- 相关导入/后台说明文档

## 当前启用级别

- SPCG 1级：`/exam/spcg-level-1`
- SPCG 2级：`/exam/spcg-level-2`
- SPCG 3级：`/exam/spcg-level-3`

后续启用新级别时，先补齐该级别题源，再更新 `RANKED_ASSESSMENT_ENABLED_LEVELS`。

## 每日同卷

- 同一天、同一 SPCG 级别只生成一份段位赛试卷。
- 同一天重复进入或重新开始，复用当天同级别题单。
- 题单 ID 和场次 ID 使用 `ranked-spcg{level}-{yyyy-mm-dd}`。

## 题单结构

每份试卷固定 6 道编程题，总分 300 分：

| 来源 | 题目角色 | 数量 | 分值 |
| --- | --- | ---: | ---: |
| 当前级别前 12 层课程题单 | 基础题 `basic` | 2 | 40 |
| 当前级别前 12 层课程题单 | 变式题 `variant` | 1 | 40 |
| 考试专用题 `exam-only` | 提高题 `advanced` | 2 | 60 |
| 考试专用题 `exam-only` | 挑战题 `challenge` | 1 | 60 |

## 题源要求

- 课程题只从当前 SPCG 级别、前 12 层、已发布、学生可见的 `problem_sets(type='lesson')` 中抽取。
- 课程题只抽 `problem_set_items.metadata.displayMode` 为 `basic` 或 `variant` 的题目。
- 考试专用题必须在 `problem_set_items.metadata.displayMode` 标记为 `exam-only`。
- 考试专用题本身的 `levels.difficulty.spcgLevel` 必须等于当前段位赛级别。
- 题源不足时不降级、不混抽其他级别，直接提示管理员补齐题源。

## 抽题方式

- 使用 `SPCG级别 + 当日日期` 作为稳定种子。
- 同一份题单内题目不重复。
- 候选题按稳定哈希排序后取前 N 道，因此同日同级别所有学生一致。

## 判题与计分

- 考试中实时提交用于快速反馈。
- 交卷后取每题最后一次实时提交，创建最终评分提交。
- 最终评分提交跑满全部测试点。
- 每题得分：`round(problemPoints * passedCases / totalCases)`。
