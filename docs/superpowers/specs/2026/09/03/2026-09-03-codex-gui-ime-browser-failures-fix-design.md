# Codex GUI IME Browser 失败修复设计

> 日期：2026-09-03
> 状态：已确认
> 依据：[11 个 IME Browser 失败根因调查](../../../research/2026/09/03/2026-09-03-codex-gui-ime-browser-failures-root-cause.md)

## 目标

修复 `ComposerTurnControlInput.browser.test.tsx` 中已稳定复现的 11 个 IME Browser 失败，同时保持既有产品语义：composition 进行中不提交；macOS Apple WebKit guard 启用时只抑制 composition 完成后的首个可提交 Enter；普通非 Enter keydown 与 `Shift+Enter` 清除这次抑制；keyup 不清除抑制。

本设计只要求 Chromium、Firefox、WebKit 的自动化 Browser Mode（Level 1）闭环。它不把 synthetic composition 事件等同于真实系统 IME，也不以此声称真实 macOS 中文输入法或 Safari 已验证。**可见桌面验收未执行。**

## 根因与修复边界

11 个失败由两个独立问题组成：

- 8 个 fixture-only 失败：TurnControl 测试只派发原生 `compositionstart` 和 `compositionend`。在 Firefox 与 Apple WebKit 下，Lexical 0.49.0 仍可能保持 composing，后续 keydown 因而不会进入命令链。
- 3 个行为回归：迁移到 Lexical `KEY_ENTER_COMMAND` 后，旧 React `onKeyDown` 中“非 Enter keydown 清除一次性 Enter 抑制”的语义没有迁移。普通按键不会进入当前仅注册 `KEY_ENTER_COMMAND` 的插件。

修复分成测试 fixture 与生产生命周期两个 owner，不通过延长 timeout、降低并发、放宽断言或删除覆盖掩盖失败。

## 设计

### 测试侧：共享 conditional composition-end bridge

在 `composerEditor/__tests__` 下抽取 ComposerEditor 专属 Browser test support，统一 synthetic composition 的完成步骤：

1. 向编辑器 root 派发原生 `compositionend`，保留 React `onCompositionEnd` 与 Lexical 原生监听器的真实测试路径。
2. 通过 `getNearestEditorFromDOMNode` 取得该 DOM root 所属的 `LexicalEditor`；root 不属于 Lexical editor 时立即报错，避免 fixture 静默失真。
3. 仅当 `editor.isComposing()` 仍为 true 时，使用同一个 `CompositionEvent` 补发 `COMPOSITION_END_COMMAND`。

这不是生产兼容层，而是 Browser Mode synthetic 事件的 test-only bridge。它复用当前 `ComposerEditorLifecycle.browser.test.tsx` 已验证的条件式行为，并由 Lifecycle 与 TurnControl 两套测试共同消费。

抽取分两个提交边界：

- T1 只创建共享 helper 并让 `ComposerEditorLifecycle.browser.test.tsx` 改用它；Lifecycle 行为和断言保持不变。
- T2 再让 `ComposerTurnControlInput.browser.test.tsx` 的 composition helper 使用同一个完成 bridge，修复 8 个 fixture-only 失败。

### 生产侧：Lexical keydown 生命周期清理

在现有 ComposerEditor Lexical plugin owner 内增加 `KEY_DOWN_COMMAND` 注册，优先级使用 `COMMAND_PRIORITY_BEFORE_EDITOR`。该 handler 只负责 suppression 生命周期清理：

- 当 keydown 不是 Enter，或是 `Shift+Enter` 时，将 `suppressNextEnterRef.current` 清为 false，并返回 false，让 Lexical 和浏览器继续处理原按键。
- ordinary Enter 与 guide Enter 不在 `KEY_DOWN_COMMAND` 中提交、阻止默认行为或消费事件；它们继续由现有 `KEY_ENTER_COMMAND` handler 唯一解释 intent、检查 composing、消费 suppression 并调用 `onSubmit`。
- keyup 不注册清理 handler，继续保持当前“keyup 不清除 suppression”的语义。
- effect cleanup 必须同时注销 `KEY_DOWN_COMMAND` 与 `KEY_ENTER_COMMAND`，避免组件卸载或 editor 身份变化后残留命令监听器。

`KEY_DOWN_COMMAND` 的清理规则与 `submitIntentForEnter` 对齐：`Shift+Enter` 不是可提交 intent，因此应像其他非提交 keydown 一样使一次性 suppression 失效；ordinary/guide Enter 则保留给 `KEY_ENTER_COMMAND` 的唯一消费路径。

## Owner 与文件范围

计划内允许的实现范围为：

- 新建 `codex-gui/src/features/composerEditor/__tests__/composerEditorCompositionBrowserTestSupport.ts`：拥有 test-only conditional bridge。
- 修改 `codex-gui/src/features/composerEditor/__tests__/ComposerEditorLifecycle.browser.test.tsx`：改用共享 helper，不改变 Lifecycle 行为。
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlInput.browser.test.tsx`：改用共享 helper，并覆盖 fixture 修复后的三浏览器路径以及 `Shift+Enter` 清除语义。
- 修改 `codex-gui/src/features/composerEditor/ComposerEditor.tsx`：在现有 Lexical command plugin 中实现 keydown suppression 生命周期清理。

生产 command owner 仍是 `ComposerEditor.tsx`；提交调用链、`ComposerTurnControl`、application、session、queue 与协议均不改变。

## 明确排除

- 不增加 timeout，不降低或串行化测试并发。
- 不恢复 React `onKeyDown`，不形成 React 与 Lexical 双 owner。
- 不在生产代码中补发 `COMPOSITION_END_COMMAND`，不改变生产 composition 生命周期。
- 不让 `KEY_DOWN_COMMAND` 成为第二个 Enter 提交或消费 owner。
- 不恢复 keyup 清除 suppression，不修改相关断言或覆盖。
- 不修改 Level 2 真实 Codex runtime 验收，也不执行需要可见窗口和系统 IME 的 Level 3 验收。

## 验收

Level 1 必须确认：

- Lifecycle focused Browser 测试在 Chromium、Firefox、WebKit 中保持通过，证明共享 helper 抽取未改变既有 fixture 行为。
- TurnControl focused Browser 测试在三浏览器中非零收集并通过；原 8 个 fixture-only 失败消失。
- 普通非 Enter keydown 与新增的 `Shift+Enter` 覆盖在三浏览器中清除 suppression；ordinary/guide Enter 仍只由 `KEY_ENTER_COMMAND` 提交或消费。
- 两个 keyup 参数化用例继续保持 suppression。
- frontend 格式化检查、lint、type-check、完整 parallel Browser suite 与完整 sequential Browser suite 通过，且目标测试不是零收集。

Level 2 不适用：本次不改变需要真实 Codex runtime 才能观察的集成、布局或交互。Level 3 与真实系统 IME 相关但按已确认边界不作为完成条件；最终报告必须保留“可见桌面验收未执行”，不得据 Level 1 宣称真实系统 IME 已验证。
