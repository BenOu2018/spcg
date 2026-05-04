# SPCG 游戏内算法演示视频 UI 与 Manim 分镜

> 视觉稿：`algorithm-video-ui-review-v1.png`
> 示例算法：二分查找
> 示例关卡：第 5 关「字典里找字」
> 目标：让玩家在进入 IDE 编码前，用 60-90 秒理解算法过程。

## 1. UI 外壳设计

### 页面布局

| 区域 | 建议占比 | 作用 |
|---|---:|---|
| 顶部栏 | 8% 高度 | SPCG 标识、章节、关卡标题、关闭/返回按钮 |
| 左侧步骤栏 | 20-22% 宽度 | 当前讲解步骤、关键提示、学习目标 |
| 中央动画画布 | 54-58% 宽度 | Manim 视频主画面，算法可视化核心 |
| 右侧追踪栏 | 20-22% 宽度 | 伪代码、变量 watch、当前判断 |
| 底部控制条 | 10-12% 高度 | 播放、暂停、上一/下一步、倍速、进度 |

### 视觉规则

- 中央 Manim 画布使用深青色背景，避免纯黑，和 IDE 页面保持一致。
- 左侧步骤栏使用暖纸色，不放大段文字，每步 1-2 句。
- 右侧代码追踪栏使用深色半透明卡片，变量值高亮。
- 当前步骤使用琥珀色，成功/命中使用绿色，舍弃区间使用灰蓝低透明度。
- 不出现角色图，避免抢占学习注意力。

## 2. Manim 画面规格

### 画布

- 分辨率：`1920x1080`
- 中央动画安全区：约 `1200x680`
- 右侧 UI 追踪栏可由前端叠加，也可在 Manim 中渲染；推荐 Manim 只负责中央动画，前端负责播放器外壳。

### 配色

| Token | 颜色 | 用途 |
|---|---|---|
| `BG_DEEP_TEAL` | `#10242A` | 动画背景 |
| `PAPER` | `#FFF3D2` | 字典卡片 |
| `INK` | `#2F281D` | 卡片文字 |
| `ACTIVE_AMBER` | `#F2B552` | 当前 mid |
| `SUCCESS_GREEN` | `#79C96F` | 找到目标 |
| `DISCARDED` | `#53666B` | 被舍弃区间 |
| `RANGE_CYAN` | `#77DDE7` | low/high 区间括号 |

### 字体

- 中文说明：思源黑体 / Noto Sans CJK
- 代码/变量：JetBrains Mono
- 字典词条：Inter / 思源黑体

## 3. 视频标题

**字典里找字：为什么每次都看中间？**

## 4. Overview

- **Topic**: 二分查找
- **Hook**: 一本字典按顺序排好，为什么不用从第一页翻到最后？
- **Target Audience**: 已学数组、下标、简单循环的 10-13 岁学生
- **Estimated Length**: 75 秒
- **Key Insight**: 如果数据已经有序，每次检查中间位置，就能一次排除一半范围。

## 5. Narrative Arc

先展示“从头找”的低效，再引出“字典已经排序”这个隐藏信息。随后通过 low / mid / high 的移动，让玩家看到每一步如何安全地丢掉一半字典，最后命中目标词。

---

## Scene 1: 打开字典

**Duration**: ~8s
**Purpose**: 建立情境和目标。

### Visual Elements

- 深青色背景
- 一排 11 张字典词条卡片
- 目标词卡片悬浮在上方：`target = "moon"`
- 左上角小标题：`Binary Search`

### Content

词条从左到右按字母顺序排列。目标词 `moon` 以琥珀色标签出现，但位置暂不高亮。

### Narration Notes

“字典里的词已经按顺序排好。我们要找 moon，但不想一张一张翻。”

### Technical Notes

- Manim: `Rectangle`, `Text`, `VGroup.arrange(RIGHT)`
- 卡片使用 `RoundedRectangle`
- 初始整体 `FadeIn`，目标标签 `GrowFromCenter`

---

## Scene 2: 慢办法

**Duration**: ~10s
**Purpose**: 对比线性查找。

### Visual Elements

- 一个小放大镜/指针从第 1 张卡片向右扫过
- 已检查卡片短暂变灰
- 计数器：`checked = 1, 2, 3...`

### Content

指针依次检查前几张卡片，速度略快但显得繁琐。到第 4 张时暂停。

### Narration Notes

“当然可以从左到右找。可是如果字典有十万页，这样会很慢。”

### Technical Notes

- 指针可用 `Triangle` 或 `Arrow`
- 使用 `Transform` 更新计数文本
- 被检查卡片 `animate.set_opacity(0.35)`

---

## Scene 3: 看中间

**Duration**: ~12s
**Purpose**: 引出 mid。

### Visual Elements

- `low` 标记在最左
- `high` 标记在最右
- `mid` 指针落到中间卡片
- 公式：`mid = (low + high) // 2`

### Content

low/high 括号圈住整个数组，中间卡片放大 1.12 倍并发光。

### Narration Notes

“二分查找不先看开头，也不先看结尾。它先看当前范围的中间。”

### Technical Notes

- 区间括号：`BraceBetweenPoints` 或自定义线段
- mid 卡片：`Indicate`, `ScaleInPlace`
- 公式用 `MathTex`

---

## Scene 4: 比大小，丢一半

**Duration**: ~14s
**Purpose**: 展示有序性的力量。

### Visual Elements

- 中间词与 target 对比
- 如果 `middle_word < target`，左半边整体变灰并滑出一点
- `low` 移动到 `mid + 1`

### Content

假设 mid 卡片是 `kite`，因为 `kite < moon`，目标一定在右半边。左半区间被安全舍弃。

### Narration Notes

“因为字典是有序的，如果中间这个词还太小，那么它左边的词只会更小。我们可以放心丢掉左半边。”

### Technical Notes

- 文本比较可以用 `Text('"kite" < "moon"')`
- 舍弃部分 `animate.set_opacity(0.18)`
- low 标签 `animate.move_to(new_card_top)`

---

## Scene 5: 再看新中间

**Duration**: ~13s
**Purpose**: 强化循环结构。

### Visual Elements

- 新范围括号收缩
- mid 移到新范围中间
- 右侧变量表同步变化：
  - `low = 6`
  - `high = 10`
  - `mid = 8`

### Content

新 mid 如果大于目标，则右半边变灰，high 移动到 `mid - 1`。

### Narration Notes

“范围变小后，我们继续看中间。每一步都让可能范围缩小一半。”

### Technical Notes

- 变量表可用 `VGroup(Text(...))`
- 变量变化用 `TransformMatchingTex` 或替换文本
- 区间括号 `Transform`

---

## Scene 6: 命中

**Duration**: ~10s
**Purpose**: 完成算法。

### Visual Elements

- mid 卡片显示 `moon`
- 卡片发绿色光
- 成功徽章：`Found at index 6`
- low/mid/high 三个指针重合或聚焦到同一张卡片

### Content

目标词被找到。其他卡片淡出，只保留目标卡片和最终结果。

### Narration Notes

“当中间词正好等于目标，答案就找到了。”

### Technical Notes

- `SurroundingRectangle` 绿色描边
- `Flash` 或 `Indicate`
- 其他卡片 `FadeOut`

---

## Scene 7: 变成代码

**Duration**: ~12s
**Purpose**: 从动画过渡到编程。

### Visual Elements

- 左侧保留简化数组
- 右侧出现伪代码：
  ```text
  while low <= high:
      mid = (low + high) // 2
      if a[mid] == target: return mid
      if a[mid] < target: low = mid + 1
      else: high = mid - 1
  ```
- 三行核心逻辑逐行高亮

### Content

动画中的 low/mid/high 标签飞入代码中的变量位置。

### Narration Notes

“刚才移动的三个标记，在代码里就是 low、mid、high。二分查找的核心，就是不断更新它们。”

### Technical Notes

- 代码块用 `Code` 或 `Text` + monospace
- 标签到代码变量：`TransformFromCopy`
- 高亮：半透明 `Rectangle` behind line

---

## Scene 8: 结束卡

**Duration**: ~6s
**Purpose**: 给玩家进入 IDE 的行动提示。

### Visual Elements

- 中央一句：`Now code it.`
- 小字：`Use low, mid, high to shrink the search range.`
- 背景保留目标卡片淡淡发光

### Content

动画结束，前端可以显示“开始编程”按钮。

### Narration Notes

“现在轮到你把这个过程写成代码了。”

### Technical Notes

- `FadeTransform` 从代码块到结束卡
- 保持结尾 1 秒静止，方便前端接按钮状态

---

## 6. UI 状态同步建议

Manim 视频可以导出关键时间点，前端播放器按时间同步左侧步骤和右侧变量栏。

| Time | UI Step | Variables |
|---:|---|---|
| 0s | 打开字典 | low=?, mid=?, high=? |
| 18s | 看中间 | low=0, mid=5, high=10 |
| 30s | 丢左半边 | low=6, mid=5, high=10 |
| 44s | 再看中间 | low=6, mid=8, high=10 |
| 58s | 命中目标 | low=6, mid=6, high=7 |
| 68s | 变成代码 | show pseudocode |

## 7. Manim 实现建议

### 推荐文件结构

```text
manim/
  scenes/
    binary_search_dictionary.py
  assets/
    fonts/
    ui/
```

### Scene 类建议

```python
class BinarySearchDictionary(Scene):
    def construct(self):
        self.show_dictionary()
        self.show_linear_scan()
        self.show_first_mid()
        self.discard_left_half()
        self.repeat_on_new_range()
        self.show_found()
        self.transform_to_code()
        self.show_end_card()
```

### 可复用组件

- `DictionaryCard(word, index)`
- `RangeMarkers(low_card, high_card)`
- `Pointer(label, color)`
- `VariableWatch(low, mid, high, target)`
- `CodeTraceBlock(lines)`

## 8. 导入前端的字段建议

```json
{
  "id": "binary-search-dictionary-demo",
  "title": "字典里找字：二分查找",
  "durationSec": 75,
  "videoAsset": "videos/binary-search-dictionary.mp4",
  "thumbnail": "assets/art/backgrounds/ch1-mist-town/algorithm-video-ui/algorithm-video-ui-review-v1.png",
  "syncPoints": [
    { "time": 0, "step": "打开字典" },
    { "time": 18, "step": "看中间" },
    { "time": 30, "step": "丢一半" },
    { "time": 44, "step": "缩小范围" },
    { "time": 58, "step": "命中目标" },
    { "time": 68, "step": "变成代码" }
  ]
}
```

