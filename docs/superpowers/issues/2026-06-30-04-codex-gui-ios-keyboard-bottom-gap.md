# iOS 软键盘打开时 composer 底部出现异常缝隙

日期: 2026-06-30
状态: 🔴 未修复
范围: Codex GUI / iOS Safari keyboard viewport / composer
优先级: 未定

## 摘要

iOS 软键盘打开时 composer 下方会露出 transcript 内容；已在 iOS Simulator 和 Safari Web Inspector 中复现并采样，尚未修复。

## 问题

用户提供的 iPhone 截图显示：Codex GUI 在手机输入法软键盘打开、composer textarea 聚焦时，composer 下方和键盘区域附近出现异常缝隙，底层 transcript 内容会从缝隙处露出。

## 证据

- 用户截图路径：`/Users/jiangsheng/Pictures/Photos Library.photoslibrary/resources/derivatives/1/147107C2-E9BE-4933-99F6-4A933CF278E0_1_102_o.jpeg`。
- 复现截图路径：`/tmp/codex-ios-keyboard-gap.png`。
- 截图文件本身是正常 JPEG，尺寸为 `1170x2532`，没有透明通道或明显的图片底部异常空行。
- `codex-gui/src/features/appShell/AppShell.tsx` 的 `<main>` 当前使用 `min-h-svh ... pb-44`，为固定 composer 预留底部空间。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 的 composer 外壳当前使用 `fixed inset-x-0 bottom-0 z-10 pt-3 pb-0`。
- `codex-gui/src/index.css` 和相关组件中未发现 `visualViewport`、`safe-area-inset-bottom`、`env(safe-area...)` 或 keyboard inset 处理。
- `codex-gui/index.html` 的 viewport meta 当前只有 `width=device-width, initial-scale=1.0`。
- 现有 browser test 只固化 composer 外壳 `pb-0`、无 `py-3`、panel `p-2` 等静态样式契约。
- 现有 mobile e2e 只验证 `375x667` 窄视口不横向溢出，没有模拟 iOS 软键盘打开后的 visual viewport 几何。
- 2026-07-01 在 iPhone 17 / iOS 26.5 Simulator / Safari 中复现问题，textarea 聚焦后 composer 下方能看到 transcript 内容、Safari 地址提示胶囊和键盘辅助栏。
- 同次 Web Inspector 采样：`window.innerHeight = 754`，`document.documentElement.clientHeight = 714`，`window.scrollY = 1873`，`visualViewport.height = 377`，`visualViewport.offsetTop = 376.984375`，`visualViewport.pageTop = 1872.65625`。
- composer `getBoundingClientRect()` 为 `{ top: 236.65625, bottom: 376.65625, height: 140, left: 0, right: 402 }`。
- textarea `getBoundingClientRect()` 为 `{ top: 256.65625, bottom: 320.65625, height: 64, left: 8, right: 394 }`。

## 判断

未修复。2026-07-01 的运行时采样基本排除了「`fixed bottom-0` 未跟随 visual viewport」这一候选根因：`visualViewport.height = 377`，composer `bottom = 376.65625`，两者只差约 `0.34px`。

更准确的现象是：composer 已停在 Safari 可视网页区域底部；composer 下方露出的 transcript 内容、地址提示胶囊和键盘辅助栏区域，更像 iOS Safari 键盘态浏览器 UI / 输入辅助区域覆盖下的视觉层问题，而不是网页内 composer 和 visual viewport 之间的普通 CSS gap。当前证据仍不足以排除浏览器候选栏、安全区、URL 类型、`viewport-fit=cover`、滚动/focus 策略或特定 iOS WebView 行为的影响。

## 影响

手机访问 Codex GUI 时，输入区聚焦状态下视觉上会出现不稳定的底部空隙。底层 transcript 内容从 composer 下方露出，影响输入体验和页面层级一致性。现有自动化测试难以及时捕获该问题，因为它依赖真实移动端键盘态 viewport 行为。

## 后续处理

下一步先研究 iOS Safari 键盘态辅助栏/地址提示区域与页面视觉层的关系，比较 `viewport-fit=cover`、focus/scroll 策略、composer 外壳背景覆盖或底部遮罩方案。补充覆盖时优先验证几何契约，例如 composer `bottom` 应约等于 `visualViewport.height`，并增加对键盘态可视区域下方露底风险的回归检查。

## 历史记录

- 不应直接按「`fixed bottom-0` 未跟随 visual viewport」设计 keyboard-aware bottom 偏移；当前实测不支持这个方向。
- 待补充的环境信息包括：发生问题的浏览器、访问 URL 类型、其他浏览器/外壳中的运行时几何、软键盘候选栏变化，以及是否只有 Safari 地址提示胶囊和键盘辅助栏出现时才暴露 transcript 内容。
