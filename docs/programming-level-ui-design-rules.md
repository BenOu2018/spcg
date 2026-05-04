# SPCG 编程关卡界面设计规则

> 适用页面：`/level/[id]`
> 参考图：`assets/art/backgrounds/ch1-mist-town/programming-main-review-v2-focused-ide.png`
> 底图：`assets/art/backgrounds/ch1-mist-town/programming-bg-clean-v1.png`

## 1. 设计目标

- 编程 IDE 是主视觉和主操作区，玩家的注意力应首先落到代码编辑器。
- 任务题目必须完整占据左栏，避免左栏下半部分被角色或装饰挤占。
- 游戏氛围只作为背景和轻量边框质感，不干扰读题、编码、运行、提交。
- 角色不出现在本页面主布局中；后续如需陪伴形象，应作为可关闭的小浮层，而不是占用题目栏空间。

## 2. 页面结构

推荐 16:9 桌面布局：

| 区域 | 占比 | 说明 |
|---|---:|---|
| 顶部状态栏 | 7-9% 高度 | Logo、章节、关卡进度、辅助入口 |
| 左侧任务栏 | 24-28% 宽度 | 题目、输入输出、样例、提示 |
| 右侧工作区 | 72-76% 宽度 | IDE、运行结果、操作按钮 |
| IDE 编辑器 | 右侧工作区的 68-75% 高度 | 页面最大组件 |
| 结果区 | 右侧工作区的 20-28% 高度 | 测试结果、输出、错误信息 |

整体容器建议：

```css
.level-page {
  min-height: 100vh;
  background-image: url("/assets/art/backgrounds/ch1-mist-town/programming-bg-clean-v1.png");
  background-size: cover;
  background-position: center;
}

.level-shell {
  height: 100vh;
  display: grid;
  grid-template-rows: 76px 1fr;
  padding: 24px;
  gap: 16px;
}

.level-main {
  display: grid;
  grid-template-columns: minmax(320px, 26%) 1fr;
  gap: 18px;
  min-height: 0;
}
```

## 3. 任务题目栏

- 左栏必须从主内容区顶部延伸到底部，内部滚动，不让页面整体滚动。
- 不放角色图、不放大装饰图、不放地图小游戏截图作为主要内容。
- 题目内容顺序固定：关卡标题、故事/任务描述、输入格式、输出格式、样例、提示。
- 样例区使用等宽字体，宽度不足时横向滚动。
- 题目栏背景用暖纸色，透明度不低于 92%，保证文字可读。

建议样式：

```css
.task-panel {
  min-height: 0;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 248, 232, 0.96);
  border: 1px solid rgba(93, 72, 38, 0.22);
  box-shadow: 0 14px 36px rgba(30, 22, 12, 0.18);
}

.task-scroll {
  height: 100%;
  overflow: auto;
  padding: 24px;
}
```

## 4. IDE 区域

- 去掉 IDE 顶部 tab 标签，不出现 `Code` tab 或 `+` tab。
- IDE 顶部只保留极简工具条：语言、运行状态、撤销/重置/设置等小图标。
- 编辑器必须是右侧最大组件，代码区高度优先，不被标题栏和装饰压缩。
- Monaco 编辑器使用深色主题，背景建议 `#10242a` 到 `#172d32`。
- 行号、代码、注释要与游戏氛围协调，但不得牺牲对比度。

建议结构：

```tsx
<section className="workbench">
  <EditorToolbar />
  <CodeEditor />
  <ResultDock />
</section>
```

```css
.workbench {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 44px minmax(0, 1fr) minmax(150px, 24%);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(12, 29, 34, 0.94);
  border: 1px solid rgba(209, 176, 113, 0.28);
  box-shadow: 0 18px 44px rgba(8, 16, 18, 0.34);
}

.editor-toolbar {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: rgba(22, 43, 48, 0.92);
}
```

## 5. 结果区与操作按钮

- 结果区固定在 IDE 下方，不弹窗覆盖代码。
- `Run` 和 `Submit` 按钮在右侧或结果区右端，按钮面积要够大，但不能高于结果区主体。
- `Run` 使用绿色，`Submit` 使用金色或琥珀色。
- 错误信息优先显示在结果区内，避免打断编码。

```css
.result-dock {
  display: grid;
  grid-template-columns: 1fr 220px;
  min-height: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.action-stack {
  display: grid;
  align-content: center;
  gap: 14px;
  padding: 20px;
}
```

## 6. 背景使用规则

- 背景图只提供氛围，不承载关键信息。
- 前端真实 UI 组件应覆盖在底图上，而不是把 IDE/题目烙进底图。
- 背景亮度需要压暗 10-18%，避免抢夺文字注意力。

```css
.level-page::before {
  content: "";
  position: fixed;
  inset: 0;
  background: rgba(12, 16, 14, 0.16);
  pointer-events: none;
}
```

## 7. 响应式底线

- v0.1 不要求完整移动端适配，但 1280px 宽度必须可用。
- 低于 1180px 时，左栏宽度固定 320px，右侧允许横向压缩。
- IDE 不允许低于 560px 宽；低于该宽度时显示“请使用更宽屏幕学习”提示。

## 8. 禁止项

- 禁止左栏放角色、插画大图或营销说明。
- 禁止 IDE 使用多 tab 视觉，除非未来真的支持多文件。
- 禁止用复杂装饰边框挤占代码区域。
- 禁止在主界面使用大段不可编辑的假代码截图。
- 禁止背景图中出现真实题目文字、按钮文字或固定 UI 状态。
