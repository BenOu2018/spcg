# SPCG 算法演示页前端模版

该目录用于前端快速创建“游戏内算法演示视频”页面。

## 文件

- `algorithm-demo-page-template.html`：可直接打开的静态页面模版，包含页面结构、CSS、步骤同步 JS。
- `demo-sync-schema.json`：前端可读取的同步字段建议。
- `ui-elements/*.svg`：步骤圆点、播放控制、时间轴、视频框、追踪卡等基础元素。
- `ui-elements/*.png`：由 SVG 渲染出的备用位图资源。

## 结构约定

- 顶部栏：SPCG 标识、章节/关卡、关闭按钮。
- 左侧栏：讲解步骤，每个 step 只放标题和一句提示。
- 中央区：16:9 Manim 视频。
- 右侧栏：变量 watch 与代码高亮。
- 底部栏：上一步、播放、下一步、重播、时间轴。

## 同步规则

前端根据 `syncPoints.time` 监听 video `timeupdate`：

- 更新左侧 active step。
- 更新右侧变量 watch。
- 高亮当前代码行。
- 推进底部时间轴。

视频文件建议统一放入 `/assets/video/solutions/<chapterId>/<levelId>.mp4`，业务 URL 保持 `/video/solutions/<chapterId>/<levelId>.mp4`。
