# SPCG 段位赛编程页设计规则

> 参考视觉稿：`assets/art/backgrounds/ch1-mist-town/exam-ui-kit/exam-page-review-v1.png`

## 1. 页面目标

- 段位赛页沿用普通编程页的阅读和编码体验。
- 题目栏、IDE、结果区不做结构性改动。
- 段位赛身份、题号、计时、视频监控集中在顶部状态栏。
- 监控状态要明确但克制，不能抢占 IDE 注意力。

## 2. 推荐结构

```css
.exam-page {
  height: 100vh;
  display: grid;
  grid-template-rows: 96px minmax(0, 1fr);
  gap: 10px;
  padding: 6px 30px 22px;
}

.exam-main {
  display: grid;
  grid-template-columns: minmax(410px, 32.2%) minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
}
```

## 3. 顶部段位赛栏

- 左侧保留 SPCG logo。
- 段位赛标题使用盾牌/证书感图标，文字为 `SPCG Ranked Match` 或对应段位赛名，使用木质暗金牌匾承载。
- 中间显示 `Question 03 / 12` 和倒计时，二者为独立状态牌，避免挤在一个信息块里。
- 右侧显示视频监控状态：`Camera On`、`Recording`。
- 摄像头预览可选，必须是小尺寸状态块，不得超过顶部栏高度。
- 顶栏整体必须接近视觉稿的横向木质栏效果，组件以暗木、暗青、金边为主。

## 3.1 高保真还原要点

- 题目栏使用羊皮纸底色、内描边和四角装饰，不能退化为普通白色卡片。
- IDE 区应是大面积深青黑代码画布，顶部不保留普通 tab 样式。
- 代码区右上角只保留小图标工具按钮，避免压缩代码输入空间。
- 运行结果区保持底部深色 dock，并在右下角放置 `Run` / `Submit` 主操作。
- 页面按钮用厚边框、内描边和底部阴影，呈现段位赛场景的庄重感。

## 4. 视频监控

- 默认状态色：摄像头绿色、录制红色、认证/安全青色。
- 不使用全屏监控窗，不放大人脸画面。
- 断开、遮挡、离开页面等异常再使用红色警告。
- 常态文案要平静：`Camera On`、`Recording`、`Ranked integrity active`。

## 5. 操作按钮

- 普通题内仍保留 `Run`、`Submit`。
- 额外提供 `Finish Match`，使用琥珀/棕金色，和 Submit 形成区分。
- 不在 IDE 顶部放大按钮，避免压缩代码区。

## 6. 禁止项

- 禁止将视频监控放进题目栏。
- 禁止使用巨大摄像头画面覆盖 IDE。
- 禁止重新设计题目和 IDE 主体。
- 禁止使用强烈警报风格作为常态。
- 禁止让顶部栏文字挤压或换行溢出。
