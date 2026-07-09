# iOS 软键盘打开时 composer 底部出现异常缝隙

日期: 2026-06-30
状态: 📏 待真实 iOS 键盘复核
范围: Codex GUI / iOS Safari keyboard viewport / composer
优先级: 未定

## 摘要

iOS 软键盘打开时 composer 下方曾露出 transcript 内容；当前代码已改为 sticky composer 并加入 visualViewport reveal，但仍缺真实 iOS Safari 键盘态回归，不能静态标为已修复。

## 问题

用户提供的 iPhone 截图显示：Codex GUI 在手机输入法软键盘打开、composer textarea 聚焦时，composer 下方和键盘区域附近出现异常缝隙，底层 transcript 内容会从缝隙处露出。

## 证据

- 用户截图路径：`/Users/jiangsheng/Pictures/Photos Library.photoslibrary/resources/derivatives/1/147107C2-E9BE-4933-99F6-4A933CF278E0_1_102_o.jpeg`。
- 复现截图路径：`/tmp/codex-ios-keyboard-gap.png`。
- 截图文件本身是正常 JPEG，尺寸为 `1170x2532`，没有透明通道或明显的图片底部异常空行。
- `codex-gui/src/features/appShell/AppShell.tsx:56` 至 `:83` 的 `<main>` 当前不再通过固定底部 padding 为 fixed composer 预留空间，而是让 transcript surface、bottom sentinel 和 composer 处在同一 flex column 内。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:146` 的 composer 外壳当前使用 `composer-shell sticky bottom-0 z-10 pb-3`，不再是旧的 `fixed inset-x-0 bottom-0 ... pb-0`。
- `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts:49` 至 `:63` 在 `visualViewport.height < document.documentElement.clientHeight` 且 composer 被覆盖时调用 `window.scrollBy`，尝试把 composer reveal 到可视区域内。
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx:184` 至 `:191` 固化 composer shell 当前为 `sticky bottom-0 pb-3`，且不包含 `fixed`、`inset-x-0` 或 `pb-0`。
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx:200` 至 `:261` 覆盖 visual viewport resize 后 composer 已可见时不滚动、仍被覆盖时滚动一次。
- `codex-gui/index.html` 的 viewport meta 当前只有 `width=device-width, initial-scale=1.0`。
- 现有 browser test 模拟 visual viewport resize 和 scrollBy 行为，但没有覆盖真实 iOS Safari 软键盘、候选栏、地址提示胶囊或键盘辅助栏。
- 2026-07-01 在 iPhone 17 / iOS 26.5 Simulator / Safari 中复现问题，textarea 聚焦后 composer 下方能看到 transcript 内容、Safari 地址提示胶囊和键盘辅助栏。
- 同次 Web Inspector 采样：`window.innerHeight = 754`，`document.documentElement.clientHeight = 714`，`window.scrollY = 1873`，`visualViewport.height = 377`，`visualViewport.offsetTop = 376.984375`，`visualViewport.pageTop = 1872.65625`。
- composer `getBoundingClientRect()` 为 `{ top: 236.65625, bottom: 376.65625, height: 140, left: 0, right: 402 }`。
- textarea `getBoundingClientRect()` 为 `{ top: 256.65625, bottom: 320.65625, height: 64, left: 8, right: 394 }`。

## 判断

待真实 iOS 键盘复核。当前代码已经不再符合旧的 fixed composer 描述，并加入了 visualViewport reveal 逻辑；但该逻辑只说明网页内 composer 被 visual viewport 覆盖时会尝试滚动，不能静态证明 iOS Safari 键盘态下 transcript 不再从 composer 下方露出。

2026-07-01 的运行时采样曾基本排除「`fixed bottom-0` 未跟随 visual viewport」这一候选根因：`visualViewport.height = 377`，composer `bottom = 376.65625`，两者只差约 `0.34px`。在当前 sticky/reveal 实现下，仍需重新采样确认 Safari 可视网页区域、输入辅助区域、composer rect 和底层 transcript 露出关系。

## 影响

手机访问 Codex GUI 时，输入区聚焦状态下视觉上会出现不稳定的底部空隙。底层 transcript 内容从 composer 下方露出，影响输入体验和页面层级一致性。现有自动化测试难以及时捕获该问题，因为它依赖真实移动端键盘态 viewport 行为。

## 后续处理

下一步先做真实 iOS Safari 键盘态只读复核：记录 `visualViewport.height`、`visualViewport.offsetTop`、`document.documentElement.clientHeight`、`window.scrollY`、composer/textarea rect、访问 URL 类型和截图。若仍复现，再进入单独设计/计划阶段比较 `viewport-fit=cover`、focus/scroll 策略、composer 外壳背景覆盖或底部遮罩方案。

## 历史记录

- 不应直接按「`fixed bottom-0` 未跟随 visual viewport」设计 keyboard-aware bottom 偏移；当前实测不支持这个方向。
- 待补充的环境信息包括：发生问题的浏览器、访问 URL 类型、其他浏览器/外壳中的运行时几何、软键盘候选栏变化，以及是否只有 Safari 地址提示胶囊和键盘辅助栏出现时才暴露 transcript 内容。
- 旧代码证据曾记录 `<main>` 使用 `min-h-svh ... pb-44` 为 fixed composer 预留底部空间，composer 外壳使用 `fixed inset-x-0 bottom-0 z-10 pt-3 pb-0`；该证据已被当前 sticky/reveal 实现取代，仅作为历史定位背景保留。
