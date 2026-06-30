# 输入法组合过程中按 Enter 会提交 composer draft

## 状态

- 已初步定位到前端键盘事件处理，未修复。

## 现象

用户反馈：输入法进行过程中，按 Enter 会立刻发送消息。

预期行为是：输入法组合态下的 Enter 应先交给输入法确认候选或完成组合，不应触发 Codex GUI 发送消息。

## 已确认事实

- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 的 `onKeyDown` 当前只检查 `event.key !== "Enter"` 和 `event.shiftKey`。
- 该处理没有检查 IME 组合态，例如 `event.nativeEvent.isComposing`。
- 在输入法组合态中拦截 Enter 并调用 `submit()`，可能导致组合中的文本尚未进入 textarea state 就被提前提交。

## 影响

- 中文输入、日文输入、韩文输入等依赖 IME 的输入流程容易误发送。
- 在手机输入法上更容易表现为消息缺字或当前 web 端消息不完整。

## 后续建议

- 在 `ComposerTurnControl` 的 Enter 提交逻辑中增加组合态保护。
- 添加浏览器测试覆盖 composing Enter 不应调用 `startTurn`。
- 验证普通 Enter 发送、Shift+Enter 换行仍保持现有行为。
