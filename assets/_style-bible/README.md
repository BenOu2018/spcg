# 风格圣经 / Style Bible

> **没有这个，所有 AI 出图都会风格漂移**。这是整个项目的"美术宪法"。

## 它是什么

5 张精心挑选的参考图 + 1 个色板 + 1 个 Midjourney sref 编号。
所有后续出图（背景、角色、UI、过场）都必须**显式引用这里的锚点**才能出图。

## 怎么生成（建议流程）

### Step 1：跑 30 张候选（半天）

用 Midjourney v7（或即梦/纳米香蕉），多个 prompt 各跑 5-10 张：

```
ghibli watercolor village at golden hour, soft mist rising from lake,
warm beige and muted sage palette, hand-painted texture, paper grain,
gentle morning light, no text --ar 16:9 --v 7 --s 250
```

```
miyazaki style misty mountain town, watercolor brushstrokes,
soft pastel sky, fox character silhouette in distance,
calm contemplative mood --ar 16:9 --v 7
```

把 30 张全部下载到 `anchors/_candidates/`。

### Step 2：从 30 张选 1 张主锚点

挑标准：
- 色调最像 mockup `gptdocs/spcg-game-main-map.png`
- 明度对比适中（不刺眼也不闷）
- 笔触感清晰但不嘈杂
- 能看出"这是给孩子看的"

复制到 `PRIMARY.png`（根目录）。

### Step 3：拿到 sref 编号

把 PRIMARY.png 上传给 Midjourney（拖到 prompt 框），让它返回一个 `--sref <数字>` 编号。
记到 `STYLE.md`。

之后所有 Midjourney 出图必须加：
```
... --sref <你的编号> --sw 100
```

即梦的"风格一致性"功能也用类似思路：上传 PRIMARY.png 作为参考。

### Step 4：抽取色板

从 PRIMARY.png 用取色器（Coolors / Adobe Color）提 6-8 种主色：
- 主背景色（米白/雾蓝）
- 强调色（暖橘/落霞）
- 辅助绿（雾松绿）
- 阴影色
- 高光色
- 错误反馈色（暖琥珀，**不用红**）
- 文字色（深暖灰，不用纯黑）

写入 `palette.md`，含十六进制和 RGB 双格式。

## 目录结构

```
_style-bible/
├── README.md            ← 你正在看的这份
├── PRIMARY.png          ← 主锚点图（仅 1 张）
├── STYLE.md             ← sref 编号、prompt 模板、AI 平台参数
├── palette.md           ← 6-8 色板
└── anchors/
    ├── 01.png           ← 5 张候选锚点（含主锚点）
    ├── 02.png
    ├── 03.png
    ├── 04.png
    ├── 05.png
    └── _candidates/     ← 30 张原始候选（不入仓库，仅本地保留）
```

## 何时更新

- v0.1 上线前**冻结**这里的所有内容
- v0.2 之后如果要扩展新章节，可以补充 `anchors/06.png` 等，但 PRIMARY.png 不动
