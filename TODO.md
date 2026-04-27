# SPCG v0.1 素材准备清单

> Stephen 个人需要准备/生成的资产。工程团队按 [workstreams/](workstreams/) 各自的 plan.md 推进。
> 主线计划见 [plan.md](plan.md)。
> 想法登记见 [idea.md](idea.md)。

---

## 0. 风格圣经（P0 · 第一周必须搞定）

> 没有这一步，所有 AI 出图都会风格漂移。先做这个。

- [ ] 5 张风格锚点候选图（gpt） → `assets/_style-bible/anchors/`
- [ ] 选定 1 张作为主锚点 → `assets/_style-bible/PRIMARY.png`
- [ ] 记录 gpt sref 编号 → `assets/_style-bible/STYLE.md`
- [ ] 主色板 6-8 色（hex 值）→ `assets/_style-bible/palette.md`

---

## 1. 美术素材（主图 PNG + 角色/UI SVG）

> 工程约定：大场景主图用 PNG，便于保留绘画质感；角色、关卡节点、按钮、图标、路径等界面元素用 SVG，便于缩放、换色和状态切换。v0.1 不引入 Lottie。

### 1.1 主地图

- [ ] 雾镇主地图源 PNG（3840×2160，≤ 8MB）→ `assets/art/backgrounds/ch1-mist-town/main.png`
- [ ] 网络压缩版 PNG（1920×1080，≤ 1.5MB）→ `assets/art/backgrounds/ch1-mist-town/main-web.png`
- [x] 主地图概念占位 PNG → `assets/art/backgrounds/ch1-mist-town/main-concept.png`
- [x] 12 节点位置坐标 JSON → `assets/art/backgrounds/ch1-mist-town/node-positions.json`
  - 格式：`[{ "id": "ch1-01", "x": 0.12, "y": 0.78 }, ...]`（百分比，便于响应式定位）

### 1.2 角色

- [x] 犬虎主角可爱状态 SVG → `assets/art/characters/dog-tiger-protagonist/cute.svg`
- [x] 犬虎主角源 PNG（透明背景，便于后续重绘矢量）→ `assets/art/characters/dog-tiger-protagonist/cute-source.png`
- [ ] 犬虎主角思考状态 SVG → `assets/art/characters/dog-tiger-protagonist/thinking.svg`
- [ ] 犬虎主角开心状态 SVG → `assets/art/characters/dog-tiger-protagonist/happy.svg`
- [ ] 犬虎主角生气状态 SVG → `assets/art/characters/dog-tiger-protagonist/angry.svg`

### 1.3 关卡节点

- [x] 节点·锁定状态 SVG → `assets/art/ui/nodes/locked.svg`
- [x] 节点·可挑战状态 SVG → `assets/art/ui/nodes/unlocked.svg`
- [x] 节点·当前位置 SVG → `assets/art/ui/nodes/current.svg`
- [x] 节点·已通关 1 星 SVG → `assets/art/ui/nodes/completed-1-star.svg`
- [x] 节点·已通关 2 星 SVG → `assets/art/ui/nodes/completed-2-star.svg`
- [x] 节点·已通关 3 星 SVG → `assets/art/ui/nodes/completed-3-star.svg`

### 1.4 路径

- [x] 路径切片 SVG（虚线段，可平铺）→ `assets/art/ui/path/segment.svg`

### 1.5 Logo

- [x] SPCG Logo SVG → `assets/art/ui/logo/spcg.svg`

### 1.6 按钮

- [x] 主按钮 SVG → `assets/art/ui/buttons/primary.svg`
- [x] 次按钮 SVG → `assets/art/ui/buttons/secondary.svg`

> **IDE 任务卡背景**也用 CSS 纸纹滤镜，无需出图。

---

## 2. 关卡内容（12 关）

> 详细生产流程见 [workstreams/05-content-production/plan.md](workstreams/05-content-production/plan.md)。
> 老师定 12 关知识点 + 关卡名 → AI 批量生成草稿 → 老师 review 入库。

- [ ] 1-1 知识点：输出 cout
- [ ] 1-2 变量定义与赋值
- [ ] 1-3 cin / cout
- [ ] 1-4 加减乘除
- [ ] 1-5 整除与取模
- [ ] 1-6 单分支 if
- [ ] 1-7 双分支 if-else
- [ ] 1-8 多分支 if-else if
- [ ] 1-9 for 循环
- [ ] 1-10 while 循环
- [ ] 1-11 累加求和
- [ ] 1-12 综合（顺序+分支+循环）

最终入库路径：`content/chapters/ch1-mist-town/levels/{nn}-{name}.md`

---

## 3. 文案

- [ ] 通用童化错误反馈模板（CE/RE/TLE/WA 各 3-5 句）→ `content/copy/error-messages.md`
- [ ] UI 字符串汇总（按钮文字、提示语、404 等）→ `content/copy/ui-strings.md`
- [ ] 启动页欢迎语 + 首次注册引导 → `content/copy/welcome.md`

---

## 4. 音频

- [ ] 雾镇 BGM 90s 无缝 loop（Suno 生成）→ `assets/audio/bgm/ch1-mist-town.mp3`
- [ ] 节点点击音（木铃 0.3s）→ `assets/audio/sfx/node-click.mp3`
- [ ] 提交代码音（轻翻纸 0.4s）→ `assets/audio/sfx/submit-code.mp3`
- [ ] 通关音（暖光木铃 0.8s）→ `assets/audio/sfx/level-pass.mp3`

---

## 5. 法务（最简版）

- [ ] 隐私政策（用模板改）→ `content/legal/privacy.md`
- [ ] 家长同意书模板 → `content/legal/parent-consent.md`

---

## 进度仪表盘

| 类别 | 完成 | 总计 |
|---|---|---|
| 风格圣经 | 0 | 4 |
| 美术 | 14 | 18 |
| 关卡内容 | 0 | 12 |
| 文案 | 0 | 3 |
| 音频 | 0 | 4 |
| 法务 | 0 | 2 |
| **合计** | **14** | **43** |

---

## 优先级

**第一周（Week 1）必须完成**：
1. 风格圣经 4 项
2. 老师把 12 关知识点 + 关卡名定稿
3. 第 1 关由老师亲笔写完整内容（作为 AI 模板的"金标准"）

**第二周**：
4. 美术资产（背景 PNG + 犬虎角色 SVG + 节点/路径/按钮/Logo SVG）
5. AI 批量生 11 关草稿，老师每天 review 2-3 关
6. 文案 3 项

**第三周**：
7. 音频 4 段
8. 法务 2 份

**第四周**：
9. 内测发现问题修补

---

## 已完成请打勾

进度更新规则：每次完成一项，把对应行 `- [ ]` 改为 `- [x]`，进度仪表盘的"完成"列加 1。
