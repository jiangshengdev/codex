# codex-gui iOS 键盘态 composer 底部遮罩设计

## 背景

`docs/superpowers/issues/2026-06-30-04-codex-gui-ios-keyboard-bottom-gap.md` 记录了 iOS Safari 软键盘打开后 composer 下方露出 transcript 内容的问题。

2026-07-01 使用 iPhone 17 / iOS 26.5 Simulator / Safari Web Inspector 复现并采样后，确认 composer 并不是没有跟随 visual viewport：

- `visualViewport.height = 377`
- composer `getBoundingClientRect().bottom = 376.65625`
- 两者只差约 `0.34px`

因此，本设计不再按 “`fixed bottom-0` 未跟随 visual viewport” 处理。更准确的问题是：composer 已停在 Safari 可视网页区域底部，但 Safari 键盘态地址提示胶囊和键盘辅助栏后方仍能看到页面下层 transcript 内容。

## 目标

在不改变 composer 定位和页面滚动架构的前提下，遮住 composer 底部之后继续露出的页面内容。键盘态下，用户应看到与 composer Surface 一致的背景，而不是 transcript 文本或消息内容。

遮罩必须满足：

- 从 composer shell 的底部继续向下延伸。
- 高度为 `100vh`，足以覆盖键盘态下 Safari 可能露出的下方区域。
- 背景色使用 `background-color: var(--surface)`，与 composer Surface 视觉一致。
- 不影响 composer 输入、按钮点击、QR 入口或 Safari 原生键盘交互。

## 非目标

- 不引入 keyboard-aware bottom offset。
- 不修改 `fixed bottom-0` 的 composer 锚定策略。
- 不调整 app shell 滚动架构。
- 不修改 `viewport-fit=cover` 或 safe-area 策略。
- 不尝试隐藏 Safari 地址提示胶囊或键盘辅助栏。
- 不解决移动端 transcript 缺失、IME Enter 提交、横向溢出等其他问题。

## 已确认决策

- 方案边界选择 A：只做 composer 下方遮罩。
- 遮罩挂载位置选择 A：挂在 composer shell 的伪元素上，不新增 DOM。
- 触发条件选择 A：遮罩始终存在。
- 验证策略选择 A：组件/browser test 覆盖样式契约，设计中记录 iOS Simulator/Safari Web Inspector 手动验证标准。

## 当前结构

`ComposerTurnControl` 当前渲染：

- 外层 composer shell：`section[aria-label="Message composer"]`
- class 包含 `fixed inset-x-0 bottom-0 z-10 pt-3 pb-0`
- 内部 Surface 面板承载 textarea、QR、Stop 和 Send 控件

`AppShell` 的 `<main>` 使用 `pb-44` 为 fixed composer 预留页面底部空间。这个页面预留仍属于 transcript 正常滚动布局，不是本设计要修改的对象。

## 设计

在 `ComposerTurnControl` 的 composer shell 上增加定位上下文和伪元素遮罩。

概念样式：

```css
.composer-shell::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 100vh;
  background-color: var(--surface);
  pointer-events: none;
}
```

Tailwind v4 class 形态应表达同等语义：

```text
relative after:absolute after:inset-x-0 after:top-full after:h-screen after:bg-[var(--surface)] after:pointer-events-none after:content-['']
```

遮罩的关键点是 `top: 100%`。它不会覆盖 composer 本体，也不会覆盖 composer 上方的 transcript；只从当前输入模块底部继续向下延伸。正常无键盘视口下，这部分通常位于 visual viewport 外，不产生可见影响。iOS Safari 键盘态下，如果浏览器辅助 UI 后方暴露页面内容，暴露内容应变成 `var(--surface)` 背景。

遮罩挂在 composer shell，而不是内部 Surface 面板，原因是遮挡边界应从整个输入模块的底部开始。挂在内部面板可能受到面板圆角、padding 或未来 overflow 变化影响。

## 层级和交互

composer shell 保持当前 `z-10` 层级。遮罩作为 shell 的 `::after` 伪元素，和 shell 一起位于 transcript 之上。

遮罩必须设置 `pointer-events: none`，避免拦截：

- textarea 聚焦和输入；
- Stop / Send 按钮点击；
- QR 入口点击；
- Safari 键盘和键盘辅助栏交互。

本设计不要求为遮罩新增 `aria-hidden`，因为伪元素不进入可访问性树。

## 测试设计

更新 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx` 中现有 composer 外壳样式契约。

测试应断言 composer shell 包含关键 class：

- `relative`
- `after:absolute`
- `after:inset-x-0`
- `after:top-full`
- `after:h-screen`
- `after:bg-[var(--surface)]`
- `after:pointer-events-none`
- `after:content-['']`

测试继续保留现有交互覆盖：

- textarea 可以输入。
- Enter/Shift+Enter 行为不变。
- composing Enter 不发送。
- Stop / Send 状态和命令 payload 不变。

不建议在本阶段新增桌面 Playwright e2e 几何测试来模拟 iOS Safari 键盘辅助栏。桌面浏览器不能真实复现 iOS Safari 键盘态地址提示和输入辅助区域，容易形成弱信号。

## 手动验证标准

实现后应在 iPhone Simulator / Safari 中手动验证：

- 打开 Codex GUI。
- 聚焦 composer textarea，让软键盘出现。
- composer 下方不再露出 transcript 文本或消息内容。
- composer 下方如有可见区域，应显示与 composer Surface 一致的 `var(--surface)` 背景。
- textarea 可继续输入。
- Stop、Send、QR 控件不受遮罩影响。
- Web Inspector 中继续确认 composer `bottom` 约等于 `visualViewport.height`，避免修复过程中意外改变定位语义。

## 验证命令

实现计划阶段应至少包含：

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
pnpm run type-check
```

如果实现只修改 `ComposerTurnControl` 的 class 和对应 browser test，不需要新增更大范围 e2e 验证作为必选项。
