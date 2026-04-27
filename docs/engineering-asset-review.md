# SPCG 工程计划审核：素材格式与落地规则

> 日期：2026-04-27
> 结论：v0.1 采用「主图 PNG + 角色/UI SVG」的混合资产策略。

## 1. 审核结论

- 大场景主图继续使用 PNG：适合保留水彩、光影、纸感等绘画细节。
- 角色、关卡节点、按钮、图标、路径等使用 SVG：适合前端缩放、状态切换、换色和减少多倍率切图。
- v0.1 不接入 Lottie：避免增加动效管线复杂度，待角色定稿后再进入 v0.2/v0.3。
- 当前 `gptdocs/` 里的素材已迁入 `assets/` 作为工程占位版本，后续正式开发直接引用 `assets/`。

## 2. 已落地素材

| 类型 | 路径 | 说明 |
|---|---|---|
| 主地图概念 PNG | `assets/art/backgrounds/ch1-mist-town/main-concept.png` | 当前概念占位，未达到 3840×2160 正式规格 |
| 编程主界面概念 PNG | `assets/art/brand/programming-main-ui-concept.png` | 作为前端布局/视觉参考，不直接作为 UI 背景 |
| 犬虎主角可爱状态 SVG | `assets/art/characters/dog-tiger-protagonist/cute.svg` | 当前是嵌入透明 PNG 的 SVG 包装，视觉优先 |
| 犬虎主角源 PNG | `assets/art/characters/dog-tiger-protagonist/cute-source.png` | 后续矢量重绘或多状态生成参考 |
| 关卡节点 SVG | `assets/art/ui/nodes/*.svg` | locked / unlocked / current / completed 1-3 星 |
| 按钮 SVG | `assets/art/ui/buttons/*.svg` | primary / secondary |
| 路径 SVG | `assets/art/ui/path/segment.svg` | 地图节点连线切片 |

## 3. 需要调整的工程点

1. 前端组件命名从 `<FoxAvatar />` 改为 `<MascotAvatar />`，避免角色设定变更后继续绑死“小狐狸”。
2. `<LevelNode />` 不再切 PNG 状态图，改为按状态引用 SVG 或内联 SVG。
3. 主地图正式交付仍需补 `main.png` 与 `main-web.png`，当前 `main-concept.png` 只能做 Demo 占位。
4. 当前犬虎 SVG 是视觉保真包装版，不是可编辑路径版；如果要做换色、局部表情、动态骨骼，需要美术或后续工具重绘成真正路径 SVG。
5. 关卡按钮/节点应保持 48-72px 的稳定布局尺寸，前端不要让图标文字撑开节点。

## 4. 推荐目录规范

```text
assets/art/backgrounds/ch1-mist-town/
  main.png
  main-web.png
  main-concept.png
  node-positions.json

assets/art/characters/dog-tiger-protagonist/
  cute.svg
  thinking.svg
  happy.svg
  angry.svg
  cute-source.png

assets/art/ui/
  buttons/
  nodes/
  icons/
  path/
  frames/
```

## 5. 下一步

- 补一版 3840×2160 雾镇主地图 PNG，导出 `main.png` 和 `main-web.png`。
- 基于 `cute-source.png` 重绘路径级 SVG，先完成 `cute.svg`，再做 thinking / happy / angry。
- 前端用当前 SVG 节点完成地图状态交互 Demo，再根据实际观感微调颜色与大小。
