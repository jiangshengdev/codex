# 输入法组合过程中按 Enter 会提交 composer draft

## 状态

- 已修复，并已添加浏览器回归测试。
- 仍建议在真实移动端或桌面 IME 中做一次手动验证。

## 现象

用户反馈：输入法进行过程中，按 Enter 会立刻发送消息。

预期行为是：输入法组合态下的 Enter 应先交给输入法确认候选或完成组合，不应触发 Codex GUI 发送消息。

## 已确认事实

- 原因位于 `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 的 `onKeyDown`：此前只检查 `event.key !== "Enter"` 和 `event.shiftKey`。
- 修复后，`onKeyDown` 在 `event.nativeEvent.isComposing` 为 true 时直接返回，不再拦截 Enter，也不会调用 `submit()`。
- 已在 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx` 添加回归测试，覆盖 composing Enter 不应调用 `startTurn`，并保持 draft 内容不变。

## 影响

- 中文输入、日文输入、韩文输入等依赖 IME 的输入流程容易误发送。
- 在手机输入法上更容易表现为消息缺字或当前 web 端消息不完整。

## 后续建议

- 用真实中文、日文或韩文 IME 手动验证组合态 Enter 不发送消息。
- 保持现有自动化覆盖：composing Enter 不发送，普通 Enter 发送，Shift+Enter 换行。
