# assets/

二进制美术与音频素材根目录。**所有由 AI 生成或外包交付的文件放这里**。

## 子目录速查

| 路径 | 用途 |
|---|---|
| `_style-bible/` | 风格圣经：5 张锚点图 + sref 编号 + 色板。**这是其它一切出图的"参考标准"** |
| `art/backgrounds/` | 章节大背景插画（每章 1 张主图 + PSD 分层） |
| `art/characters/dog-tiger-protagonist/` | 主角犬虎的 SVG 立绘与状态素材 |
| `art/characters/fox-protagonist/` | 旧主角目录，暂保留兼容历史文档，正式实现优先使用 dog-tiger-protagonist |
| `art/characters/cat-master/` | 算法导师·白猫先生立绘 |
| `art/characters/wolf-wanderer/` | 游学者狼隼（v0.3 才用） |
| `art/characters/guardians/` | 15 位关卡守护者立绘，按 `ch{1,2}-{nn}/` 分子目录 |
| `art/ui/` | 界面元素 SVG（节点、按钮、框、图标） |
| `art/effects/` | 粒子动效（萤火、飘叶等） |
| `art/transitions/` | 过场动画素材 |
| `art/brand/` | App 图标、启动页 KV 等品牌物料 |
| `audio/bgm/` | 背景音乐 |
| `audio/sfx/` | 音效 |
| `fonts/` | 字体文件（思源宋/黑、JetBrains Mono 等） |

## 命名规范

- 文件名小写 + 短横线（`current-pin.svg` 而非 `currentPin.svg` 或 `当前位置.svg`）
- 章节用 `ch1-` `ch2-` 前缀
- 守护者目录命名：`ch1-01/` 到 `ch1-12/`、`ch2-01/` 到 `ch2-03/`
- 同一资产多版本：`main.png` / `main-web.png`（带 `-web` 后缀的是网络压缩版）

## 提交前自检

- [ ] 是否对齐了 `_style-bible/` 的风格锚点？
- [ ] 主图是否使用 PNG，并提供高清版与 `-web` 压缩版？
- [ ] 角色、节点、按钮、图标是否使用 SVG？
- [ ] 透明 PNG 源图是否仅作为重绘/追溯素材，不直接当作 UI 控件？
- [ ] 音频是否归一化到 -14 LUFS？
- [ ] 文件是否 < 5MB（背景大图除外）？
