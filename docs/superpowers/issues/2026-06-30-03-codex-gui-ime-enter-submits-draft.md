# 输入法组合过程中按 Enter 会提交 composer draft

日期: 2026-06-30
状态: 🟡 静态已收窄，仍需真实 IME 验证
范围: codex-gui composerTurnControl / IME 输入提交
优先级: P1

## 摘要

composer 曾在输入法组合过程中把 Enter 当作发送键处理；当前代码已通过 composing guard 和桌面 Apple WebKit 专用 suppress 分支收窄风险，但仍需要绑定最终实现的真实 IME 手动验证，尤其是 macOS Safari、Chrome 和 iOS Safari 的分支行为。

## 问题

用户反馈：输入法进行过程中，按 Enter 会立刻发送消息。

预期行为是：输入法组合态下的 Enter 应先交给输入法确认候选或完成组合，不应触发 Codex GUI 发送消息。后续调试还发现，简单地在 `compositionend` 后无条件吞掉下一次 Enter 会误伤 Chrome 和 iOS Safari 的真实发送 Enter，并可能让用户需要按两次 Enter 才发送。

## 证据

- 原因位于 `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` 的 `onKeyDown`：此前只检查 `event.key !== "Enter"` 和 `event.shiftKey`。
- `codex-gui/src/features/appShell/AppShell.tsx:18` 至 `:23` 只把 `guardCompositionEndEnter` 打开给桌面 Apple WebKit 运行时，`AppShell.tsx:77` 至 `:80` 将该分支传入 composer。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:109` 至 `:120` 在 composition 生命周期中维护 `isComposingRef`，并且只在 `guardCompositionEndEnter` 为 true 时设置 `suppressNextEnterRef`。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:123` 至 `:140` 在 `event.nativeEvent.isComposing` 或 `isComposingRef.current` 为 true 时直接返回；若 `suppressNextEnterRef` 为 true，则只吞掉下一次 Enter 并清理 guard。
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx:352` 覆盖 composing Enter 不调用 `startTurn`，并保持 draft 内容不变。
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx:402` 覆盖 guard 开启时 completed composition 后第一下 Enter 被吞掉、第二下 Enter 才发送。
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx:474` 覆盖 `keyup` 不会清理 completed composition suppress。
- 稳定事实一：Safari 最新版本中，空格确认候选后同一时间片出现的是 `keydown Space`，约 1 秒后的 `keydown Enter` 是真实发送。
- 稳定事实二：Safari 最新版本中，Enter 确认候选后 `compositionend` 紧贴 `keydown Enter`，这一下会被当前 guard 吞掉；后续再次 Enter 才真实发送。
- 稳定事实三：Chrome 中，空格确认候选后约 905ms 的 `keydown Enter` 是真实发送，但旧 guard 会误吞。
- 稳定事实四：Chrome 中，Enter 确认候选后没有紧贴 `compositionend` 的尾随 `keydown Enter`；约 520ms 后的 `keydown Enter` 是真实发送，但旧 guard 会误吞。
- 2026-07-05 补充：iOS Safari 虚拟键盘路径和 macOS Safari 硬件键盘/系统 IME 路径不能合并为同一类；浏览器/平台分支可以作为确定性条件，时间差阈值不应作为主判断依据。
- 2026-07-05 补充：回退后的代码仍是 `compositionend` 后设置 `suppressNextEnterRef`，但 `keyup` 会清掉该 guard；这会让 macOS Safari 的 `compositionend -> keyup Enter -> keydown Enter` 路径重新落到 `submit`。

## 判断

当前静态评估为已收窄，但不能升级为真实 IME 已修复。最终状态仍是 🟡：需要用真实中文、日文或韩文 IME 对最终实现重新手动验证。现有日志和当前代码支持的判断是：

- 组合态内 `isComposing` 的 Enter 必须直接交还给浏览器/输入法，不能触发 `submit()`。
- 不能在每次 `compositionend` 后无条件吞掉下一次 Enter；Chrome 和 iOS Safari 都有真实发送 Enter 被误吞的证据。
- 不应优先使用时间差阈值作为主判断，因为它会把浏览器事件模型和人类再次按 Enter 的手速混在一起。
- 当前代码已经采用确定性运行时分支：仅桌面 Apple WebKit 保留 `compositionend` 后 Enter suppress，iOS Safari 虚拟键盘和 Chrome 不走同一条 suppress 路径。
- `keyup` 不应作为清理桌面 Safari 尾随 Enter guard 的核心依据；它可能发生在需要吞掉的尾随 `keydown Enter` 之前。

## 修复记录

- `ComposerTurnControl.tsx` 的 `onKeyDown` 已在 `event.nativeEvent.isComposing` 或本地 `isComposingRef.current` 为 true 时 return，避免组合态 Enter 触发发送。
- 后续 IME suppress 行为经过真实浏览器日志复核，约束已从“`compositionend` 后无条件吞下一次 Enter”收窄为桌面 Apple WebKit 专用候选确认尾随 Enter guard。

## 验证记录

- 自动化：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx` 覆盖 composing Enter 不调用 `startTurn`，guard 开关差异，非 Enter 清理 suppress，以及 `keyup` 不清理 suppress。
- 真实浏览器日志：已完成四组稳定对照日志采集，包括 Safari + Space 确认候选、Safari + Enter 确认候选、Chrome + Space 确认候选、Chrome + Enter 确认候选。
- iOS Safari 虚拟键盘补充观察：已有远程 Web Inspector `[ime]` 日志证明无条件 `compositionend` 后 suppress 会误吞发送 Enter，但仍缺一组与最终修复方案绑定的完整稳定对照日志。

## 影响

中文输入、日文输入、韩文输入等依赖 IME 的输入流程容易误发送。手机输入法上更容易表现为消息缺字或当前 web 端消息不完整。错误的 suppress 策略还会反向造成 Chrome 或 iOS Safari 需要按两次 Enter 才能发送，影响基础输入体验。

## 后续处理

- 用真实中文、日文或韩文 IME 手动验证最终实现：组合态 Enter 不发送，普通 Enter 发送，Shift+Enter 换行。
- 对 macOS Safari、Chrome 和 iOS Safari 分别保留验证入口；不要把三者合并成单一时间阈值策略。
- 如果真实 IME 手动验证仍发现分支差异，需单独进入设计/计划阶段，不要直接在 issue 内扩写 implementation plan。

## 历史记录

### 2026-07-04 真实浏览器调试记录

#### 稳定事实：Safari + 空格确认候选

浏览器：Safari 最新版本。输入法：macOS 自带中文拼音。输入内容：`你好呀`。操作方式：用 Space 确认候选，再按 Enter 发送。来源：用户重新发送并明确确认准确的完整日志；该组日志作为当前唯一稳定事实。

关键尾段：

1. `input` 发生在 `1039961`，随后 `change:before` 发生在 `1039961`，`change:after` 发生在 `1039962`。
2. `beforeinput` 发生在 `1039968`。
3. `input` 发生在 `1039969`，随后 `change:before` 和 `change:after` 都发生在 `1039969`。
4. `compositionend:before` 发生在 `1039971`。
5. `compositionend:after` 发生在 `1039972`。
6. 同一时间片出现 `keydown Space`，发生在 `1039972`，组件记录为 `keydown:ignored-cleared-suppress`。
7. `keyup Space` 发生在 `1040076`。
8. 约 `1118ms` 后出现 `keydown Enter`，发生在 `1041090`，组件记录为 `keydown:submit`。
9. `keyup Enter` 发生在 `1041188`。

结论：Safari 的空格确认候选不会产生紧贴 `compositionend` 的尾随 Enter。后续相隔明显时间的 Enter 是用户真实发送意图，应正常 submit。

#### 稳定事实：Safari + Enter 确认候选

浏览器：Safari 最新版本。输入法：macOS 自带中文拼音。输入内容：`你好呀`。操作方式：用 Enter 确认候选，再按 Enter 发送。来源：用户重新发送并明确确认准确的完整日志；该组日志作为当前稳定事实。

关键尾段：

1. 组合态内 `keydown Enter` 发生在 `1408054`，组件随后在 `1408055` 记录为 `keydown:composing-return`。
2. `keyup Enter` 发生在 `1408091`。
3. 后续仍出现候选导航 keydown，包括 `ArrowDown`、`ArrowRight`、`ArrowLeft`。
4. 组合态内第二次 `keydown Enter` 发生在 `1409769`，组件同一时间记录为 `keydown:composing-return`。
5. `keyup Enter` 发生在 `1409819`。
6. 之后仍出现 `ArrowRight`、`ArrowLeft` 等候选导航 keydown。
7. `input` 发生在 `1411193`，随后 `change:before` 和 `change:after` 都发生在 `1411194`。
8. `beforeinput` 发生在 `1411202`。
9. `input`、`change:before`、`change:after` 都发生在 `1411203`。
10. `compositionend:before` 和 `compositionend:after` 都发生在 `1411206`。
11. 紧贴的 `keydown Enter` 发生在 `1411207`，组件记录为 `keydown:suppressed-next-enter`。
12. `keyup Enter` 发生在 `1411270`。
13. 约 `499ms` 后再次出现 `keydown Enter`，发生在 `1411705`，组件在 `1411706` 记录为 `keydown:submit`。
14. `keyup Enter` 发生在 `1411775`。

结论：Safari 的 Enter 确认候选会在 `compositionend` 后约 `1ms` 产生尾随 `keydown Enter`。这一下不是发送意图，应被吞掉；后续相隔明显时间的 Enter 才是用户真实发送。

#### 稳定事实：Chrome + 空格确认候选

浏览器：Chrome。输入法：macOS 自带中文拼音。输入内容：`你好呀`。操作方式：用 Space 确认候选，再按 Enter 发送。来源：用户重新发送的完整 Chrome 控制台日志；该组日志作为当前稳定事实。

关键尾段：

1. 最后一次 `keydown Space` 发生在 `1045694`，组件在 `1045695` 记录为 `keydown:ignored-cleared-suppress`。
2. `beforeinput` 发生在 `1045696`。
3. `input` 发生在 `1045697`，随后 `change:before` 发生在 `1045697`，`change:after` 发生在 `1045698`。
4. `compositionend:before` 和 `compositionend:after` 都发生在 `1045708`。
5. `keyup Space` 发生在 `1045771`。
6. 约 `905ms` 后出现 `keydown Enter`，发生在 `1046613`，组件记录为 `keydown:suppressed-next-enter`。
7. `keyup Enter` 发生在 `1046676`。
8. 约 `786ms` 后再次出现 `keydown Enter`，发生在 `1047494`，组件在 `1047495` 记录为 `keydown:submit`。
9. `keyup Enter` 发生在 `1047547`。

结论：Chrome 的空格确认候选后，后续相隔约 `905ms` 的 Enter 是用户真实发送意图，但当时“compositionend 后无条件吞下一次 Enter”的 guard 会误吞，导致 Chrome 下需要按两次 Enter 才发送。

#### 稳定事实：Chrome + Enter 确认候选

浏览器：Chrome。输入法：macOS 自带中文拼音。输入内容：`你好呀`。操作方式：用 Enter 确认候选，再按 Enter 发送。来源：用户重新发送的完整 Chrome 控制台日志；该组日志作为当前稳定事实。

关键尾段：

1. 组合态内 `keydown Enter` 发生在 `1082031`，组件同一时间记录为 `keydown:composing-return`。
2. 随后 `input` 发生在 `1082032`，`change:before` 和 `change:after` 都发生在 `1082033`，`keyup Enter` 发生在 `1082075`。
3. 组合态内第二次 `keydown Enter` 发生在 `1085601`，组件同一时间记录为 `keydown:composing-return`。
4. 随后 `input`、`change:before`、`change:after` 都发生在 `1085602`，`keyup Enter` 发生在 `1085650`。
5. 组合态内最后一次 `keydown Enter` 发生在 `1087020`，组件同一时间记录为 `keydown:composing-return`。
6. `beforeinput` 发生在 `1087020`。
7. `input`、`change:before`、`change:after` 都发生在 `1087021`。
8. `compositionend:before` 发生在 `1087028`，`compositionend:after` 发生在 `1087029`。
9. `keyup Enter` 发生在 `1087090`。
10. 约 `520ms` 后出现 `keydown Enter`，发生在 `1087549`，组件记录为 `keydown:suppressed-next-enter`。
11. `keyup Enter` 发生在 `1087614`。
12. 约 `980ms` 后再次出现 `keydown Enter`，发生在 `1088529`，组件在 `1088530` 记录为 `keydown:submit`。
13. `keyup Enter` 发生在 `1088570`。

结论：Chrome 的 Enter 确认候选不会在 `compositionend` 后产生紧贴的尾随 `keydown Enter`。后续相隔约 `520ms` 的 Enter 是用户真实发送意图，但当时“compositionend 后无条件吞下一次 Enter”的 guard 会误吞，导致 Chrome 下需要按两次 Enter 才发送。

### 2026-07-04 当前可用推论

- 不能在每次 `compositionend` 后无条件吞掉下一次 Enter；至少 Safari 空格确认路径会被这种策略误伤。
- 不能只依赖“非 Enter keydown 清 guard”：Chrome 空格确认路径中，最终确认用的 `keydown Space` 发生在 `compositionend` 之前，`compositionend` 之后只有 `keyup Space`，所以仍会保留 suppress 并误吞后续 Enter。
- `compositionend` 后如果先出现非 Enter keydown，例如 Safari 空格确认路径中的 Space，应清掉尾随 Enter guard。
- 与 `compositionend` 间隔明显的后续 `keydown Enter` 应视为用户真实发送。
- Safari 中需要吞掉 `compositionend` 后极近的 `keydown Enter`，已由 Safari Enter 确认候选日志确认。
- Chrome 中 Enter 确认候选不会产生同类紧贴尾随 Enter；后续相隔约 `520ms` 的 Enter 应发送。
- 因此 guard 应按 `compositionend` 与后续 `keydown Enter` 的时间距离收窄，而不是在所有 `compositionend` 后吞下一次 Enter。

### 2026-07-05 追加到 2026-07-04 历史：iOS 与 macOS Safari 分歧

背景：用户要求在手机 Safari 远程调试界面中给 `ComposerTurnControl.tsx` 增加无条件 `[ime]` 日志，并用 iOS Safari 虚拟键盘重新观察输入法事件。

已观察到的 iOS Safari 日志尾段：

1. `compositionend:before`。
2. `compositionend:after`。
3. `keydown:suppressed-next-enter`，`key: "Enter"`。
4. 后续再次出现 `keydown:submit`，`key: "Enter"`。

结论：在 iOS Safari 虚拟键盘路径下，`compositionend` 后出现的 Enter 可能是用户发送意图；把所有 `compositionend` 后的下一次 Enter 都作为候选确认尾随事件吞掉，会导致 iOS 需要按两次发送。

随后试过的思路：用 `lastCompositionKeyRef` 只在组合态内最后一次 key 是 `Enter` 时才 suppress `compositionend` 后的 Enter。用户反馈该方向让 iOS Safari 路径恢复正常，但代码回退后，macOS Safari 又出现“按回车选词后直接发送”。

当前回退代码的风险点：

1. `onCompositionEnd` 在 `wasComposing` 时设置 `suppressNextEnterRef.current = true`。
2. `onKeyUp` 只要看到 `suppressNextEnterRef.current` 为 true 就清掉它。
3. 如果 macOS Safari 的真实顺序是 `compositionend -> keyup Enter -> keydown Enter`，`keyup` 会先清掉 guard，后续 `keydown Enter` 就会进入 `submit`。

约束更新：

- 允许使用浏览器/平台判断，因为浏览器事件模型相对确定；不要把 iOS Safari、macOS Safari 和 Chrome 合并成同一个 IME Enter 路径。
- 不应优先使用时间差阈值作为主判断，因为它会把浏览器事件模型和人类再次按 Enter 的手速混在一起。
- 后续方案应优先考虑确定性分支：例如仅对桌面 Safari 的候选确认尾随 Enter 保留 suppress，而 iOS Safari 虚拟键盘和 Chrome 不走同一条 suppress 路径。
- `keyup` 不应作为清理桌面 Safari 尾随 Enter guard 的核心依据；它可能发生在需要吞掉的尾随 `keydown Enter` 之前。

### 对照日志采集状态

已完成四组稳定对照日志采集：

1. Safari + Space 确认候选。
2. Safari + Enter 确认候选。
3. Chrome + Space 确认候选。
4. Chrome + Enter 确认候选。
5. iOS Safari 虚拟键盘补充观察：已有远程 Web Inspector `[ime]` 日志证明无条件 `compositionend` 后 suppress 会误吞发送 Enter，但仍缺一组与最终修复方案绑定的完整稳定对照日志。
