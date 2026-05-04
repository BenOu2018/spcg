---
id: dog-tiger-protagonist
displayName: 待命名
role: protagonist
assetRef: assets/art/characters/dog-tiger-protagonist/cute.svg
---

# 犬虎主角

## 核心设定

一只可爱的犬虎，身上只有一条很轻的老虎纹作为成长伏笔。随着学习进程推进，老虎特征会逐步增加，最终成长为更勇敢、更有力量的形态。

## 当前 v0.1 状态

- 外观：犬虎为主，保留一条额头横纹。
- 气质：可爱、专注、愿意尝试。
- 使用位置：地图主页、关卡 IDE 左下角陪伴位、通关反馈。
- 暂不做复杂动效：v0.1 使用 SVG 静态形象，后续再扩展 idle / thinking / happy / angry。

## 表情状态规划

| 状态 | 资产路径 | 使用场景 |
|---|---|---|
| cute | `assets/art/characters/dog-tiger-protagonist/cute.svg` | 地图待机、普通陪伴 |
| thinking | `assets/art/characters/dog-tiger-protagonist/thinking.svg` | 做题时看向 IDE |
| happy | `assets/art/characters/dog-tiger-protagonist/happy.svg` | AC / 通关 |
| angry | `assets/art/characters/dog-tiger-protagonist/angry.svg` | 连续出错后的认真提醒，不做责备 |

## 美术约束

- 老虎特征在 v0.1 只保留一条横纹。
- 角色不能显得攻击性强，成长感来自眼神、姿态和纹路增加。
- 做题状态的注意力应朝向 IDE，而不是书本或题目卡。
- 如果后续需要换色、骨骼动画或局部表情，必须把当前包装 SVG 重绘为路径级 SVG。
