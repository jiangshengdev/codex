# Codex GUI IME Enter Guard 设计

## 背景

`docs/superpowers/issues/2026-06-30-03-codex-gui-ime-enter-submits-draft.md` 记录过一个已修复问题：输入法组合过程中按 Enter 会提交 composer draft。旧修复在 `ComposerTurnControl.tsx` 的 `onKeyDown` 中检查 `event.nativeEvent.isComposing`，当该值为 true 时不发送。

用户在 2026-07-04 重新复现：输入“你好呀”时，Enter 选择“你”正常，但最后一个词没有被选择，而是把拼音发出。联网资料和本地代码检查都指向同一类问题：真实浏览器和 IME 的事件顺序并不总是保证“确认候选的 Enter”在 `keydown` 阶段仍然带 `isComposing === true`。Safari/WebKit 等环境可能先触发 `compositionend`，再让同一个确认 Enter 进入 keydown 发送路径。

## 目标

- IME 组合中按 Enter 不发送消息。
- IME 刚结束后用于确认候选的紧邻 Enter 不发送消息。
- 用户再按一次普通 Enter 时，发送最终稳定文本。
- 普通 Enter 发送、Shift+Enter 换行、空白 draft 不发送等既有行为保持不变。
- 修复范围限制在 Codex GUI composer 输入行为，不改 app-server API、projection、host command 或协议 payload。

## 非目标

- 不取消 Enter 发送的既有交互。
- 不引入真实系统 IME 的 e2e 自动化；CI 环境通常无法稳定提供中文、日文或韩文输入法。
- 不抽象新的通用 hook；当前只有 `ComposerTurnControl` 一个使用点。
- 不修改 `@heroui/react` 的 `TextArea` 实现。

## 现状

`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 当前有三个关键点：

- `draft` 是 React state，通过 `TextArea` 的 `onChange` 更新。
- `submit()` 读取当前 `draft`，构造 plain text input，然后调用 `commands.startTurn(...)`。
- `onKeyDown` 只判断 `event.key !== "Enter"`、`event.shiftKey` 和 `event.nativeEvent.isComposing`，命中普通 Enter 后 `preventDefault()` 并调用 `submit()`。

这意味着如果真实 IME 在最后一次候选确认时已经让 `nativeEvent.isComposing` 变成 false，而 `draft` 仍包含拼音或尚未同步的文本，当前代码会把这次 Enter 当成发送 Enter。

## 设计

采用保守防误发策略：只要 Enter 可能属于 IME 候选确认，就不发送。代价是某些浏览器时序下用户需要再按一次 Enter 发送；这是可接受的，因为误发送拼音比多按一次 Enter 更糟。

在 `ComposerTurnControl.tsx` 内增加两个 ref：

- `isComposingRef`：表示组件观察到的 composition 生命周期是否仍在进行。
- `suppressNextEnterRef`：表示刚收到 `compositionend`，下一次非 Shift Enter 应被视为候选确认 Enter，而不是发送 Enter。

事件规则：

- `onCompositionStart`：
  - `isComposingRef.current = true`
  - `suppressNextEnterRef.current = false`
- `onCompositionEnd`：
  - `isComposingRef.current = false`
  - `suppressNextEnterRef.current = true`
  - `setDraft(event.currentTarget.value)`，把 textarea 当前值同步到 React state。
- `onKeyDown`：
  - 非 Enter 直接返回。
  - Shift+Enter 直接返回，保持换行。
  - `event.nativeEvent.isComposing` 为 true 时返回。
  - `isComposingRef.current` 为 true 时返回。
  - `suppressNextEnterRef.current` 为 true 时，调用 `preventDefault()`，清掉该标记，并返回。
  - 其余情况才 `preventDefault()` 并调用 `submit()`。

`suppressNextEnterRef` 只吞下一次非 Shift Enter，不使用时间窗口。这样避免用 100ms、300ms 之类阈值猜测浏览器事件顺序，也避免长期影响普通发送。

## 测试设计

使用现有 browser test 覆盖事件语义，不依赖真实系统 IME。

新增核心回归测试：

1. 渲染 attached composer。
2. 让 textarea 进入 composition。
3. 模拟组合文本最终变成中文。
4. 触发 `compositionend`。
5. 紧接着按第一次 Enter，断言不调用 `startTurn`。
6. 再按第二次 Enter，断言调用 `startTurn`，且发送最终中文文本。

保留并继续覆盖：

- `isComposing: true` 的 Enter 不发送。
- 普通 Enter 发送。
- Shift+Enter 插入换行。
- 空白 draft 不发送。

## 风险

- Browser test 对 composition 事件的模拟不等同于真实中文 IME，但能稳定锁住组件自己的事件语义。
- 如果 HeroUI `TextArea` 对 composition 事件有额外包装，测试需要使用实际渲染出的 textarea 验证事件能到达组件 handler。
- 如果未来 composer 输入框出现多个使用点，再考虑把逻辑抽成 `useImeEnterGuard`；当前不提前抽象。

## 验收标准

- 真实 IME 中确认候选的 Enter 不发送消息。
- 组合结束后的第一下 Enter 不发送，第二下普通 Enter 发送最终文本。
- 既有 composer 行为不回退。
- `ComposerTurnControl.browser.test.tsx` 的目标测试通过。
- `format:oxfmt` 通过。
