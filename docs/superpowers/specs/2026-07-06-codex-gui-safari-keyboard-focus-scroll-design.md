# Codex GUI Safari 键盘 focus 滚动修复设计

## 背景

Codex GUI 的 composer 当前使用 sticky 布局：

- `ComposerTurnControl` 渲染 `section[aria-label="Message composer"]`
- composer shell class 包含 `sticky bottom-0`
- 页面在软键盘打开后仍支持滚动

用户在 iPhone 和 iPad Safari 上复现：从页面其他位置切换 focus 到 composer textarea 时，软键盘有时打开，但底部输入框被键盘盖住；如果焦点已经在输入框，再次直接点击输入框，通常可以正确滚动到键盘上方。

这不是 `2026-07-02-codex-gui-ios-keyboard-composer-mask-design.md` 覆盖的问题。旧设计处理的是 composer 已在 visual viewport 底部但下方露出 transcript 内容；本设计处理的是 Safari 在 focus 转移时没有把 composer 滚入 visual viewport。

## 观察结论

通过临时日志观察两条路径：

失败路径：

- `focus:sync` 和 `focus:rAF1` 时，`visualViewport.height` 仍是完整高度，不能判断键盘态。
- `visualViewport:resize` 到来后，`visualViewport.height` 缩小，说明软键盘影响已进入 visual viewport。
- 此时 Safari 没有同步滚动页面，composer 仍停在 layout viewport 底部。
- `focus:rAF2`、`focus:+100ms`、`focus:+250ms`、`focus:+500ms` 后，`overlap` 仍为正，说明输入框持续被键盘遮住。

成功路径：

- `focus:sync` 和 `focus:rAF1` 同样不能判断键盘态。
- `visualViewport:resize` 到来时，Safari 已经滚动页面，composer 被带到 visual viewport 内。
- 后续 `visualViewport:scroll` 只进一步更新 visual viewport offset；输入框已可见。

关键结论：`visualViewport:resize` 是本问题的稳定分界点。修复不应依赖固定时间延迟，而应在 focus 后等待 `visualViewport.resize`，并在 resize 后下一帧检查 composer 是否仍被 visual viewport 底边遮住。

## 目标

- 修复 iPhone/iPad Safari 中从外部元素 focus 到 composer textarea 时，软键盘遮住输入框的偶发现象。
- 保留现有 sticky 布局和页面滚动模型。
- 成功路径不做额外滚动。
- 失败路径只补一次最小必要滚动。
- 不按设备名、平台名或浏览器 UA 做分支；只根据当前 visual viewport 和 composer 几何判断。
- 不保留临时诊断日志。

## 非目标

- 不改 composer 的 sticky 定位策略。
- 不引入固定 keyboard height、固定 bottom offset 或长期 CSS transform。
- 不改变 `meta viewport` 作为本次修复的核心手段。
- 不处理旧的 composer 底部遮罩问题。
- 不实现 VirtualKeyboard API 适配；Safari/iOS 不能依赖该 API。
- 不改变 IME Enter guard、发送、停止、QR 入口或 transcript sticky-bottom 逻辑。

## 设计

新增 composer-local hook：

```text
codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts
```

`ComposerTurnControl` 只负责持有 composer shell ref 并调用 hook：

```ts
const composerShellRef = useRef<HTMLElement | null>(null);
useRevealComposerOnViewportResize(composerShellRef);
```

hook 的职责是：当 textarea 获得 focus 后，等待本次 focus 触发的 `visualViewport.resize`；resize 到来后下一帧测量 composer 是否仍被 visual viewport 遮住；如果遮住，就补一次页面滚动。

### 事件模型

1. hook 挂载后，从 composer shell 内查询 textarea。
2. textarea `focus` 时，进入 armed 状态。
3. armed 状态只等待 `window.visualViewport.resize`。
4. 收到 `visualViewport.resize` 后，使用 `requestAnimationFrame` 延后一帧测量。
5. 如果 textarea 已失焦，退出，不滚动。
6. 如果 visual viewport 未缩小，退出，不滚动。
7. 计算：

   ```ts
   visualBottom = visualViewport.offsetTop + visualViewport.height;
   overlap = composerRect.bottom - visualBottom;
   ```

8. 如果 `overlap <= 0`，说明 Safari 已经滚到位，退出。
9. 如果 `overlap > 0`，执行一次：

   ```ts
   window.scrollBy({ top: overlap + COMPOSER_KEYBOARD_CLEARANCE_PX });
   ```

10. 完成本次检查后 disarm，避免后续地址栏变化、普通滚动或其他 viewport resize 误触发。

### 滚动策略

补救动作使用 `window.scrollBy`，而不是 `scrollIntoView` 或改写 `scrollTop`。

原因：

- 真实成功路径中 Safari 自己就是增加页面滚动量。
- `scrollBy` 能按测得的 overlap 做最小补偿。
- `scrollIntoView` 会重新进入浏览器自身的 focus/scroll heuristic，行为更不可控。
- 直接改 `document.scrollingElement.scrollTop` 比 `scrollBy` 更硬，不是首选。

clearance 只作为贴边余量，不代表键盘高度：

```ts
const COMPOSER_KEYBOARD_CLEARANCE_PX = 8;
```

成功路径中 `overlap <= 0`，不会使用该余量。

### 生命周期边界

hook 不做长期全局 keyboard adapter。它只处理 composer textarea 的 focus 转移问题：

- 只在 textarea focus 后 armed。
- 只响应 armed 期间的第一次 `visualViewport.resize`。
- 一次 focus 最多补滚一次。
- blur 后清理 armed 状态。
- 组件卸载时解绑 `focus`、`blur` 和 `visualViewport.resize` 监听。

## 测试设计

优先新增或扩展 `ComposerTurnControl.browser.test.tsx`，覆盖 hook 的行为契约。

建议测试点：

- textarea focus 后，如果没有 `visualViewport.resize`，不滚动。
- focus 后触发 `visualViewport.resize`，下一帧发现 `overlap <= 0`，不滚动。
- focus 后触发 `visualViewport.resize`，下一帧发现 `overlap > 0`，调用一次 `window.scrollBy`，滚动量为 `overlap + 8`。
- textarea blur 后再触发 `visualViewport.resize`，不滚动。
- 同一次 focus 只补滚一次。

测试应模拟 `window.visualViewport` 的 `height`、`offsetTop` 和 resize 事件，并 stub composer 的 `getBoundingClientRect()`。不要求在 CI 中模拟真实 iOS Safari 软键盘。

## 手动验证标准

在 iPhone/iPad Safari Web Inspector 中验证：

- 从页面外部区域点击 composer textarea，软键盘打开后 textarea 不被键盘遮住。
- 已聚焦 textarea 再次点击或继续输入，不发生多余跳动。
- 成功路径不出现额外向上偏移。
- 页面仍可正常滚动。
- Enter 发送、Shift+Enter 换行、IME 候选确认、Stop、Send 和 QR 控件不回退。

## 风险

- iOS Safari 的 visual viewport 事件顺序仍可能随版本变化。设计以行为条件而非设备分支兜底，降低平台漂移风险。
- 如果页面已经滚到最大仍无法露出 composer，单次 `scrollBy` 可能不足。当前日志显示成功路径本身就是页面滚动，因此先不引入临时 padding-bottom。
- Browser test 只能锁住 hook 的事件和几何判断，不能完全复现真实软键盘；最终仍需要真机手动验证。

## 验收标准

- 修复代码不保留临时诊断日志。
- `ComposerTurnControl` 只接入 hook，不承担 viewport 细节。
- 失败路径在 `visualViewport.resize` 后能补滚到 composer 可见。
- 成功路径不额外滚动。
- focused browser test 覆盖新增行为。
- `codex-gui` 的目标格式、类型和 lint 验证通过。
