---
templateVersion: spcg-level-v0.1
levelId: ch1-01
chapterId: ch1-mist-town
order: 1
title: 早安雾灯村
knowledgePoint: 输出 cout
difficulty:
  spcgLevel: 1
  levelLabel: SPCG 1级
  stars: 1
  label: 入门
  lglevel: null
assets:
  - id: statement-main
    type: image
    url: /assets/problems/ch1-mist-town/ch1-01/statement-main.webp
    alt: 早安雾灯村题目图片
    caption: null
defaultLanguage: cpp14
timeLimitMs: 1000
memoryLimitMb: 64

guardianId: null
story: null
passOutProblemId: null
sisterProblem: null

inputFormat: |
  无输入。

outputFormat: |
  输出一行指定文字。

testCases:
  - id: case-01
    visibility: public
    input: ""
    expectedOutput: |
      早安雾灯村！
  - id: case-02
    visibility: public
    input: ""
    expectedOutput: |
      早安雾灯村！
  # case-03 到 case-20 必须补齐；visibility 通常为 hidden。

hints:
  - step: 1
    title: 看看要做什么
    content: 第一件事是确认题目要你输出哪一行文字。
  - step: 2
    title: 想想 cout
    content: C++ 里可以用 cout 把文字打印到屏幕上。
  - step: 3
    title: 注意符号
    content: 中文感叹号也要和题目完全一样，最后可以输出换行。

solution:
  explanation: |
    这道题没有输入，只需要在 main 函数里用 cout 输出指定文字。
  keyPoints:
    - 使用 #include <iostream>
    - 使用 cout 输出字符串
    - 输出内容要和题目要求完全一致
  complexity:
    time: $O(1)$
    memory: $O(1)$

solutionVideoUrl: /video/solutions/ch1-mist-town/ch1-01.mp4

starterCode: |
  #include <iostream>
  using namespace std;

  int main() {
      // 在这里写下你的代码
      return 0;
  }

officialCode: |
  #include <iostream>
  using namespace std;

  int main() {
      cout << "早安雾灯村！" << endl;
      return 0;
  }

source:
  type: original
  name: SPCG 原创
  url: null
  author: Stephen
  license: null
  attribution: null
  notes: v0.1 自有题目
  originalPublicSamples: null
---

# 任务描述

在这里写给学生看的题面。语言要短、清楚、适合 10-12 岁孩子。

主角统一叫“犬虎”。不要写成“犬虎小狗”或“小狗”；如果题目不需要主角，也可以不出现犬虎。

![早安雾灯村题目图片](/assets/problems/ch1-mist-town/ch1-01/statement-main.webp)

## 题目图片规则

- 默认使用 `imagegen` 生成与题意匹配的题目图片。
- 图片比例固定为 16:9，推荐 `1280x720`。
- 图片格式推荐 `webp`，文件名固定为 `statement-main.webp`。
- 单张图片必须控制在 `100KB` 以内。
- 未压缩原图必须保留一份，命名为 `statement-main-original-{levelId}.png`。
- 题目 `assets[].url` 只引用压缩图，不引用未压缩原图。
- 图片只服务题意理解，不放答案代码，不放复杂长文字。
- 题目图片不限制角色，不要求出现犬虎或任何固定角色；根据题目意思自由创作即可。
- frontmatter 的 `assets[].url` 和正文图片链接必须完全一致。

## 姐妹题规则

如果本题配置姐妹题，仍默认在 frontmatter 中填写 `sisterProblem: null`。姐妹题关系只通过 `-s1` 题号内部识别。姐妹题要求：

- 姐妹题和本题同知识点、同难度、同算法、同复杂度。
- 姐妹题必须是独立完整题目文件，拥有自己的 `levelId`、`order`、标题、图片、20 个测试点、3 个提示、题解和代码。
- 姐妹题 `levelId` 保留 `-s1` 标记，例如 `ch1-04-s1`；文件名可保留 `S` 标记。
- 姐妹题只轻微修改规则、数字、输入输出字段或故事包装，不引入新的核心知识点。
- 题目标题、题面、题解、`source.notes` 和题解视频中不要写“姐妹题”或“对应 ch1-xx”。

## 输入格式

和 frontmatter 里的 `inputFormat` 保持一致。

## 输出格式

和 frontmatter 里的 `outputFormat` 保持一致。

## LaTeX 数学符号规则

- 题面、输入输出格式、提示、题解和复杂度里的编程数学表达统一使用 LaTeX。
- 变量、数组、上下标示例：`$n$`、`$a_i$`、`$p_1, p_2, \ldots, p_n$`。
- 比较式、区间、复杂度示例：`$1 \le n \le 10^6$`、`$[l,r]$`、`$O(n \log n)$`。
- 不要写 `p_i`、`1..n`、`<=`、`>=`、`!=`、`O(n)` 或用反引号包数学表达。
- 使用 `$\oplus$`、`$\le$`、`$\ne$`、`$\ldots$`、`$\bmod$`、`$\sum$` 等特殊符号时，在题目底部增加 `## 符号说明`。

## 公开样例

只展示 `visibility: public` 的 2-3 个样例。完整 20 个测试点只在导入和判题中使用。

改编自洛谷或 Codeforces 的题目必须重写公开样例，并在 `source.originalPublicSamples` 记录原题公开样例，不能直接搬运原题公开样例。
