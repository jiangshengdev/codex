# Codex GUI Composer 输入队列最小交互实施计划

状态：待确认

日期：2026-08-14

实施基线：`dev @ f77aeef85111967e41fc33461137e22e6f821bad`

对应设计：[Codex GUI Composer 输入队列最小交互设计](../../../../specs/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui-design.md)

设计确认：用户已在聊天中确认初始设计，并补充确认 recovery 存在时禁用普通发送。计划获得明确确认后才进入实现。

## 目标

把已经完成的 `composerInputQueue` 纯数据 Module 接入真实 GUI 产品路径，实现最小消息排队交互：active turn 期间可提交纯文本，Composer 只显示 ordinary FIFO 数量；正常 terminal 后自动启动下一条；interruption 或确定拒绝产生 recovery 时，Composer 显示整体恢复入口，并在 recovery 处理前禁用普通发送但保留可编辑草稿。

最终必须由 Browser 纵向测试证明：

```text
Composer → queue → command → accepted projection facts → next start / recovery
```

纯 Module 单测、静态 Chip 或未消费的 effects 均不构成完成。

## 实现架构

### 单一 queue owner

`composerInputQueue` 继续独占 ordinary FIFO、pending start、active turn 与 owner 守恒。只新增同步只读 `view()`：

```ts
type ComposerInputQueueView = Readonly<{
  queuedCount: number;
}>;
```

`queuedCount` 只等于 ordinary FIFO 长度，不包含当前 claim、active turn 或 recovery。Module 不增加 subscribe、React、Redux、消息数组投影或 recovery 状态。

### transport 交付事实

现有 `GuiHostCommandError.source` 无法区分调用前 `unavailable` 与 pending request 因断线而 `unavailable`。在 transport 权威边界给每个 `TransportRequestFailure` 增加强类型交付结论：

```ts
type TransportRequestDelivery = "definitelyNotAccepted" | "deliveryUnknown";
```

机械分类：

- gateway 未 ready、request 开始前 socket 不可用、`socket.send` 同步抛错、server 明确返回 RPC error：`definitelyNotAccepted`；
- request 已成功执行 `socket.send` 后发生 pending invalidation、缺失 result、畸形 result：`deliveryUnknown`。

`GuiHostCommandError` 原样暴露该字段。协调层只能使用这个权威字段映射 `StartSettlement`，不得根据错误字符串或 source 名称二次猜测。

### thread-scoped 协调层

新建 React-independent `ComposerInputQueueCoordinator`，由 `GuiHostConnectionBridge` 在固定 `launchParams.threadId` 的 matching attach/commands 生命周期中创建并持有。协调层：

- 顺序消费每个 transition 的 effects，且每个 effect 恰好执行一次；
- 用 claim 的 message 和 `clientUserMessageId` 调用现有 `turn/start`；
- 将 command response/error 回送同一 queue 的 `settleStart`；
- 接受 ingress 已验证、且 replay 分类为 `live` 的 projection event；
- 机械映射为 `RuntimeObservation` 后调用 `observe`；
- 持有最多一个 `RecoveryBatch`；recovery 存在时拒绝普通 submit；
- 同一 transition 在 `recover` 后还有 `performStart` 时，保留该原始 effect 并暂缓执行；用户恢复现有 batch、recovery owner 释放后才执行，不重建 claim、不提前启动也不丢弃；
- 提供稳定 snapshot 与 subscribe 给 React，但不复制 FIFO 或协议状态机；
- 通过 disposed/generation guard 拒绝 cleanup 后的旧 promise/event，不把旧消息发到其他 thread。

协调层 UI snapshot 只表达 UI 自有语义：

```ts
type ComposerInputQueueCoordinatorSnapshot = Readonly<{
  queuedCount: number;
  recoveryCount: number;
  isRecovering: boolean;
}>;
```

snapshot 必须保持引用稳定，只有字段变化时才发布新对象，供 `useSyncExternalStore` 使用。

### accepted projection adapter

在 `ProjectionApplicationCoordinator` 的 `eventAccepted` 分支计算一次 replay，并向可选 sink 发送同一 accepted payload。queue 只消费 `live`：

- `turnStarted` → `turnStarted` observation；
- `turnCompleted` 且 status 非 `inProgress` → `turnCompleted` observation；
- `itemStarted` 中 `item.type === "userMessage"` 且 `clientId != null` → `userMessageCommitted` observation；
- 其他 item 事件不产生 observation。

类型从 `@codex-protocol/v2` 机械派生；不监听 raw WebSocket，不轮询 Redux `eventBuffer`，不从 transcript 反推 commit。

### React 接线

`App` 持有协调层公开 controller 的对象 identity，使 `GuiHostConnectionBridge` 和 `AppShell` 共享同一个 thread-scoped owner。`ComposerTurnControl`：

- 用 `useSyncExternalStore` 订阅 snapshot；
- submit 调用 controller，而非直接 `commands.startTurn`；
- stop 继续使用现有 `commands.interruptTurn`；
- active turn 不再禁用普通发送；recovery 存在时发送禁用；
- TextArea 在 recovery 存在时仍可编辑；
- ordinary count 用 HeroUI `Chip`；recovery 用 HeroUI `Button`；
- 数量文案用 Lingui `Plural`，按钮用 `Trans`。

## 精确范围

允许新建或修改：

- `docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui-design.md`
- `docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui.md`
- `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`
- `codex-gui/src/features/guiHost/guiHostTransportSession.ts`
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`，仅当公共 command error 契约需要纵向断言时
- `codex-gui/src/features/composerInputQueue/composerInputQueueRuntimeObservation.ts`，新建
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueRuntimeObservation.test.ts`，新建
- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`，新建
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`，新建
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/App.tsx`
- `codex-gui/src/features/appShell/AppShell.tsx`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

若实现证明必须修改此列表外文件，停止并回到计划确认；不得借 lint、fixture 或“更整洁”扩大范围。

## 非目标

- 不实现 steer、消息内容列表、编辑、删除、清空、排序、Undo、暂停或容量上限。
- 不实现附件、持久化、刷新恢复、跨页面、跨 thread、跨客户端或跨进程恢复。
- 不新增 RPC、server-side queue、协议 DTO、validator 或生成协议产物。
- 不把 queue/recovery 复制到 Redux，不修改 transcript 或 optimistic append queued message。
- 不实现 delivery-unknown 超时、重试按钮、猜测 recovery、兼容双路径或 fallback。
- 不新增依赖、package script、浏览器二进制、E2E 或截图测试。
- 不运行 `messages:extract:clean`，不杜撰不存在的 message compile 脚本。
- 不操作 Git 远程。

## Preflight

计划确认并进入实现后，在仓库根目录只读核验：

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git diff -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui-design.md docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui.md
git diff --cached --name-only
git check-ignore -v -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui-design.md
git check-ignore -v -- docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui.md
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
```

要求：

- 当前分支预期为 `dev`，计划基线为 `f77aeef85111967e41fc33461137e22e6f821bad`。HEAD 变化时重新核验受影响文件，不盲目套用旧行号。
- 当前已知 workspace 变更只有本轮未提交设计与计划文档；出现其他修改时保留并报告，不覆盖。
- 文档不得被 ignore；禁止强制暂存 ignore 文件。
- 缺少 fnm、Node、pnpm、现有 `node_modules` 或 Browser 运行条件时停止，告知用户自行准备；助手不得安装。

在 `codex-gui` 中只读确认工具：

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

所有后续 pnpm 命令使用相同 fnm-backed 形状，cwd 为 `codex-gui`。

## 编辑、验证与失败闭环

- 普通 TypeScript/React/Markdown/PO 内容没有项目生成工具时使用 `apply_patch`；PO msgid 先由 `messages:extract` 生成，再只补 `zh-CN` 翻译。
- 格式化先限定本任务文件使用 `pnpm exec oxfmt ... --write`，再运行非 fix 检查；最终运行全树 `format:oxfmt`。
- Browser 测试使用 locator 与 `expect.element` 的可重试断言；不锁定 padding、gap、颜色、阴影等视觉数值。
- 合法 projection payload 复用或组合现有共享 builder；本计划不允许修改 shared projection fixture/builder，因此若现有 builder 不足，优先在测试内组合现有合法对象，不手写镜像协议对象。
- 当前任务引入的 test、lint、type、format 或 catalog 失败必须在同一任务范围内修正后再提交。
- 禁止用 skip、ignore、豁免、断言放宽、删除覆盖、静默兜底或修改检查基线通过验证。
- 预存或无关失败只报告，不借本任务修复。
- 行为改动提交不得包含纯 import、声明、字段、函数、组件或分支顺序调整；若确需纯重排，停止并补独立计划任务。
- 每个行为 Task 的 changed lines 目标低于 500；若达到 800 行或以上，停止并拆分计划。复杂协调 Task 应低于 500 changed lines。
- `composerInputQueue.ts` 当前为 499 行；Task 1 只允许增加最小 view，不把协调逻辑塞入该文件。略超约 500 行需在 staged review 明确记录，不为压行数制造无关重排。

## Task 0：确认并提交设计与计划文档

### 文件

- 设计文档。
- 本计划文档。

### 修改

- 保持设计状态为“已确认”。
- 用户明确确认本计划后，把计划状态从“待确认”改为“已确认”。
- 除状态与确认记录外不重排正文。

### 检查与提交

```bash
git diff --check -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui-design.md docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui.md
git add -- docs/superpowers/specs/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui-design.md docs/superpowers/plans/2026/08/14/2026-08-14-codex-gui-composer-input-queue-minimal-ui.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m 'docs(gui): design minimal composer queue interaction'
```

staged 文件必须恰好为两份文档。

## Task 1：增加 ordinary queue 最小只读投影

### 文件

- 修改 `composerInputQueue.ts`。
- 修改现有 `composerInputQueue.test.ts`。

### 修改与测试

- 新增 `ComposerInputQueueView` 和同步 `view()`。
- `view()` 只返回 `{ queuedCount: ordinary.length }`；不暴露消息、claim、recovery 或 runtime phase。
- 断言完整 view 对象：初始/idle submit 为 0；busy submit 递增；completed/failed drain 递减；delivery unknown 保持；definite rejection 后 drain 递减；interruption 清零且 recovery 顺序不变。
- 不测试 runtime freeze，不加 subscribe 或 test-only helper。

### 验证与提交

在 `codex-gui`：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts --cache
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

在仓库根目录只暂存两个文件，检查 staged diff 后提交：

```bash
git add -- codex-gui/src/features/composerInputQueue/composerInputQueue.ts codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached
git commit -m 'feat(gui): expose composer queue count'
```

## Task 2：建立 command 交付结论

### 文件

- 修改 `guiHostTransportSession.ts`、`guiHostCommandGateway.ts`。
- 修改对应两个测试；只有公共 commands 纵向断言必要时才修改 `guiHostCommands.test.ts`。

### 修改与测试

- 在 `TransportRequestFailure` 增加 delivery 字段，并在失败产生位置机械赋值。
- `GuiHostCommandError` 保留 source，同时公开 delivery。
- 分别测试：gateway 未 ready、pre-send unavailable、send throw、RPC error 为 definite；pending invalidation、missing result、malformed result 为 unknown。
- 证明 callback 与 Promise rejection 只结算一次；不根据 message text 分类。

### 验证与提交

在 `codex-gui` 对上述文件运行限定 oxfmt、Vitest、oxlint、eslint，再运行 `pnpm run type-check`。定向测试：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts
```

只暂存本 Task 实际修改的 guiHost 文件，检查 staged 范围和 diff 后提交：

```bash
git commit -m 'fix(gui): classify command delivery failures'
```

## Task 3：实现 runtime adapter 与 thread-scoped queue coordinator

### 文件

- 新建 runtime observation adapter 及 sibling test。
- 新建 queue coordinator 及 sibling test。

### 修改与测试

- adapter 对 generated protocol union 使用 exhaustive switch，机械映射 live accepted facts；不复制协议 DTO。
- coordinator 接收固定 thread id、active turn、start command executor；公开 submit、recover、observeAcceptedEvent、getSnapshot、subscribe、dispose 的最小 surface。
- effect runner 严格按 transition effects 数组顺序运行；异步 settlement 仍回到原 claim。
- submit 被 queue 接受后返回可供 Composer 安全清草稿的结果；recovery 存在时拒绝普通 submit但不触碰草稿。
- recover 按 batch 原顺序重新 submit；过程中 snapshot 标记 `isRecovering` 并防重复点击；全部交回 queue owner 后释放 recovery，再执行同一原 transition 中被暂缓的后续 `performStart`。
- 测试 projection 先于 settlement、accepted/definite/unknown、delivery unknown 阻塞、completed/failed drain、interruption recovery、definite rejection recovery、`recover` 后 start 暂缓并在恢复后恰好执行一次、snapshot 稳定、dispose 后旧 promise/event 无效。
- 若暂缓机制之外仍可能在旧 batch 未处理时产生第二 recovery，测试必须暴露并停止实现；禁止合并或覆盖。

### 验证与提交

在 `codex-gui` 对四个新文件运行限定 oxfmt、Vitest、oxlint、eslint 和 type-check。只暂存四个文件，确保复杂 Task changed lines 低于 500 后提交：

```bash
git commit -m 'feat(gui): coordinate composer input queue'
```

## Task 4：接入 accepted projection 与生产 connection 生命周期

### 文件

- 修改 `projectionApplicationCoordinator.ts` 及其测试。
- 修改 `GuiHostConnectionBridge.tsx`、`App.tsx`。
- 只有现有 App Browser host harness 无法覆盖 connection lifecycle 时才修改 `appBrowserTestSupport.ts` 与 `App.browser.test.tsx`；不得在本 Task 提前接入 Composer。

### 修改与测试

- Projection coordinator 对 accepted event 只计算一次 replay，并把 `{ notification, replay }` 送到可选 sink；dispatch 语义保持不变。
- Bridge 只为固定 launch thread 的 matching attach 建立 queue coordinator，并在 commands ready 后通过 setter 发布 controller；commands unavailable 不丢弃 owner，cleanup 才 dispose。
- App 在本 Task 只持有 controller identity，暂不传给 AppShell/Composer；Task 5 直接切换 Composer consumer，不保留旧新提交双路径。
- 不匹配 attach、snapshot duplicate、cleanup 后旧事件/settlement不得触发 queue start。
- Projection coordinator 单测覆盖 accepted sink 与 replay；若修改 App Browser harness，只验证 matching attach/cleanup 的 controller 生命周期，不伪造 Composer submit 入口。

### 验证与提交

运行 projection coordinator unit test、限定 lint/type-check；只有本 Task 实际修改 App Browser 文件时才运行定向 Browser 命令：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/__tests__/App.browser.test.tsx
```

只暂存本 Task 文件，检查 staged diff 后提交：

```bash
git commit -m 'feat(gui): connect composer queue runtime'
```

## Task 5：实现 Composer 最小 UI、恢复交互与翻译

### 文件

- 修改 Composer 组件、model 及现有测试。
- 修改 `AppShell.tsx`，把 Task 4 已持有的 controller identity 传给 Composer，并删除 Composer 直接 start 的旧提交路径。
- 修改 `App.browser.test.tsx`，增加 recovery 纵向路径。
- 通过生成流程修改 `en.po`，补充 `zh-CN.po` 翻译。

### 修改与测试

- active turn 不再阻止发送；connection、非空、同次 submit 防重保持。
- recovery count 大于零时发送禁用，但 TextArea 不 disabled，可继续编辑。
- queued count 大于零时显示低强调 HeroUI `Chip`；不显示内容或空占位。
- recovery 显示 `N 条消息尚未发送` 与唯一主操作 HeroUI `Button`；用 `onPress`、`isPending/isDisabled` 防重，非 danger variant。
- submit 接受后只清除仍等于 submitted draft 的内容；recovery 不清空或覆盖草稿。
- 用 `Plural` 处理两个数量文案，用 `Trans` 处理 `继续发送`；运行 `messages:extract` 后补中文翻译。
- Composer Browser 覆盖可访问文案、active send、count、recovery 时发送禁用/TextArea 可编辑、重复恢复防重与草稿保持。
- App Browser 覆盖 interruption 不自动 start、恢复按 FIFO 重新交回、恢复后发送重新可用。
- App Browser 同时覆盖 active turn submit → queued count → terminal accepted event → 恰好一次下一 `turn/start`，并断言 queued message 在 commit 前不进入 transcript。

### 生成、验证与提交

在 `codex-gui`：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

对本 Task TS/TSX 文件运行限定 oxfmt、oxlint、eslint；PO 必须由 extract 生成 msgid，不手写新增 msgid。只暂存本 Task 文件并检查 catalog diff 没有无关清理后提交：

```bash
git commit -m 'feat(gui): show queued composer messages'
```

## Task 6：最终全量验证

本 Task 不预期修改文件，也不创建空提交。先确认工作树只包含已提交计划范围，然后在 `codex-gui` 执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

若格式检查失败，使用限定到计划文件的 `pnpm exec oxfmt ... --write` 修正，并将修正提交到引入问题的对应 Task；不得把多个行为任务合并为一个“最终修复”提交。其他本次变更引入的失败同样回到对应 Task 边界闭环。预存或无关失败只报告。

最终在仓库根目录检查：

```bash
git status --short
git log --oneline -6
git diff HEAD~6..HEAD --check
git diff HEAD~6..HEAD --stat
```

## 最终验收

- Task 0–5 恰好各有一个独立本地提交；Task 6 不创建提交。
- 没有行为提交夹带纯代码顺序调整，没有临时双路径或 fallback。
- queue 仍是 FIFO/claim/owner 的唯一权威来源；React/Redux 不保存消息副本。
- transport 明确区分 definite 与 unknown；delivery unknown 不重试、不 drain。
- queue 只消费 ingress accepted 且 live 的权威 projection facts。
- active turn 可排队，Chip 只显示 ordinary count。
- recovery 存在时发送禁用、草稿可编辑；继续发送按批内 FIFO 恢复且防重复。
- queued message 在权威 commit 前不进入 transcript。
- fixed launch thread、cleanup 与旧异步结果不会造成跨 thread start。
- fnm-backed format、lint、type-check、unit、完整 Browser matrix 全部通过。
- 未安装依赖、未生成协议 validator、未操作 Git 远程。
