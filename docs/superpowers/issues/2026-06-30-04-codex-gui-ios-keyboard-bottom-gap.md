# iOS 软键盘打开时 composer 底部出现异常缝隙

## 状态

- 已初步定位到前端移动端键盘态布局风险，未修复。

## 现象

用户提供的 iPhone 截图显示：Codex GUI 在手机输入法软键盘打开、composer textarea 聚焦时，composer 下方和键盘区域附近出现一条异常缝隙，底层 transcript 内容会从缝隙处露出。

截图路径：

`/Users/jiangsheng/Pictures/Photos Library.photoslibrary/resources/derivatives/1/147107C2-E9BE-4933-99F6-4A933CF278E0_1_102_o.jpeg`

## 已确认事实

- 截图文件本身是正常 JPEG，尺寸为 `1170x2532`，没有透明通道或明显的图片底部异常空行。
- `codex-gui/src/features/appShell/AppShell.tsx` 的 `<main>` 当前使用 `min-h-svh ... pb-44`，为固定 composer 预留底部空间。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 的 composer 外壳当前使用 `fixed inset-x-0 bottom-0 z-10 pt-3 pb-0`。
- `codex-gui/src/index.css` 和相关组件中未发现 `visualViewport`、`safe-area-inset-bottom`、`env(safe-area...)` 或 keyboard inset 处理。
- `codex-gui/index.html` 的 viewport meta 当前只有 `width=device-width, initial-scale=1.0`。
- 现有 browser test 只固化 composer 外壳 `pb-0`、无 `py-3`、panel `p-2` 等静态样式契约。
- 现有 mobile e2e 只验证 `375x667` 窄视口不横向溢出，没有模拟 iOS 软键盘打开后的 visual viewport 几何。

## 初步判断

最可疑的根因是：iOS 软键盘打开后 visual viewport 发生变化，但 composer 仍按普通 `fixed bottom-0` 锚定，导致 composer、页面底部预留空间和键盘区域之间出现露底缝隙。

当前证据还不足以排除浏览器候选栏、安全区、URL 类型或特定 iOS WebView 行为的影响。

## 影响

- 手机访问 Codex GUI 时，输入区聚焦状态下视觉上会出现不稳定的底部空隙。
- 底层 transcript 内容从 composer 下方露出，影响输入体验和页面层级一致性。
- 现有自动化测试难以及时捕获该问题，因为它依赖真实移动端键盘态 viewport 行为。

## 需要补充的信息

- 发生问题的浏览器：iOS Safari、iOS Chrome、PWA/WebView，或其他外壳。
- 访问 URL 类型：`Local`、`LAN`、`VPN` 或其他代理地址。
- 聚焦 textarea 后的运行时几何：`window.innerHeight`、`document.documentElement.clientHeight`、`visualViewport.height`、`visualViewport.offsetTop`、composer `getBoundingClientRect()`。
- 软键盘候选栏展开、收起、切换输入法时缝隙是否变化。

## 后续建议

- 先做只读真机采样，记录 keyboard open 状态下的 visual viewport 和 composer rect。
- 如果确认是 `fixed bottom-0` 未跟随 visual viewport，再设计 keyboard-aware composer 底部定位。
- 补充覆盖时优先验证几何契约，而不是只断言 Tailwind class。
