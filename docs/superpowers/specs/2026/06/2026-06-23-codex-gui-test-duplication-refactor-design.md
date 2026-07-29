# codex-gui 测试重复代码重构设计

## 目标

收敛 `codex-gui/src` 中由 `jscpd` 识别出的测试重复代码，降低测试维护成本，同时保持测试的行为契约清晰可读。

本次设计只覆盖测试代码和测试支撑代码。不修改生产逻辑、不改变 UI 行为、不调整协议或状态机边界。

## 背景

对 `codex-gui/src` 运行：

```sh
jscpd /Users/jiangsheng/cnb/codex/codex-gui/src \
  --reporters console \
  --min-lines 6 \
  --min-tokens 60 \
  --ignore "**/*.po,**/*.json,**/.DS_Store"
```

结果：

- `29` 个 clones。
- `353` duplicated lines。
- 总重复率 `5.60%`。
- 重复主要集中在测试文件和测试支撑文件。
- 没有发现需要优先处理的生产 UI 大段克隆。

## 已确认决策

- 范围选择：只做测试重复收敛。
- 共享测试 helper 放置：按领域放在 `features/projection/__tests__/projectionTestBuilders.ts`。
- 测试 harness 抽象厚度：只使用薄 helper，避免隐藏测试事件顺序。
- 不追求重复率清零；保留有助于表达行为契约的显式测试代码。
- 不把 `guiHostProtocol`、`ProjectionIngressAdapter`、`threadRuntime`、`transcriptState` 的状态机逻辑合并成统一抽象。

## 重复点

### Projection 和 transcript 测试 payload builders

已有 builders 位于：

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts`

重复出现于：

- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
- `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`

重复内容包括：

- `textInput`
- `userMessage`
- `agentMessage`
- `baseTurn`
- `attachWithTurns`
- `itemStarted`
- `itemCompleted`
- `turnStarted`
- `turnCompleted`
- `runtimeFromAttach`

### GUI host client WebSocket 握手

热点文件：

- `codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`

重复内容包括：

- 创建 `RecordingWebSocket`。
- 调用 `startGuiHostConnection`。
- 构造 launch URL、`replaceState`、`MemoryStorage`、`createWebSocket`。
- 发送 id `1` 的 authenticate result。
- 发送 id `2` 的 initialize result。
- 发送 id `3` 的 attach result。
- 采集 status label 或 status message。

### App browser host harness

热点文件：

- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/appBrowserTestSupport.ts`

重复内容包括：

- 读取 `startGuiHostConnectionMock.mock.calls[0]?.[0]`。
- 调用 `onProjectionAttached`。
- 调用 attached 状态的 `onStatus`。
- 调用 `onCommandsReady`。
- 注入 projection event 或 manual reconnect 事件。

### Composer command mock 和状态断言

热点文件：

- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`

重复内容包括：

- `GuiHostCommands` mock。
- `startTurn` 返回 in-progress turn 的 response。
- `interruptTurn` 返回空 response。
- composer disabled 状态的 repeated assertions。

## 设计

### 共享 projection builders

新增：

- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`

该文件只承载跨 feature 重复使用的 projection/test payload 构造函数：

- `textInput`
- `imageInput`
- `userMessage`
- `agentMessage`
- `planItem`
- `sleepItem`
- `baseTurn`
- `attachWithTurns`
- `runtimeFromAttach`
- `itemStarted`
- `itemCompleted`
- `turnStarted`
- `turnCompleted`

迁移原则：

- 只抽 payload 构造，不抽断言对象。
- 保留测试用例中的完整期望对象。
- helper 名称保持领域语义，不使用宽泛的 `makeData` 或 `fixture` 命名。
- event builder 继续检查 fixture discriminator，fixture 漂移时应快速失败。

### GUI host client test support

修改：

- `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`

新增薄 helper：

- `startGuiHostConnectionWithSocket`
- `sendAuthenticateResult`
- `sendInitializeResult`
- `sendAttachResult`
- `sendJsonRpcResult`
- `recordStatusLabels`
- `recordStatusSummaries`

保留：

- `MemoryStorage`
- `ThrowingSetItemStorage`
- `RecordingWebSocket`
- `readRpcRequest`
- `startConnectionUntilCommandsReady`

约束：

- 首个验证 authenticate、initialize、attach 发送顺序的测试保留显式步骤。
- 错误路径测试可以使用 helper 进入目标状态。
- helper 不隐藏断言重点；测试仍应能看出当前正在模拟哪一步 JSON-RPC 事件。

### App browser test support

修改：

- `codex-gui/src/__tests__/appBrowserTestSupport.ts`

新增薄 helper：

- `getHostOptions`
- `attachProjection`
- `markHostAttached`
- `markCommandsReady`
- `emitProjectionEvent`
- `emitProjectionClosed`

这些 helper 只消除机械重复，不把整个 App 启动流程包装成高层 DSL。

### GuiHostCommands mock

共享 command mock 放在测试支撑文件中，返回普通 `vi.fn`：

- `createGuiHostCommands`

约束：

- 调用方可以覆写 `startTurn` 和 `interruptTurn` 的 resolve/reject 行为。
- 默认 response 保持现有测试语义。
- 不把 command mock 包装成无法直接断言 `.mock.calls` 的对象。

### Composer 状态断言

在 browser test 内使用局部薄 helper：

- `expectComposerDisabled`
- `expectComposerReadyToSend`，仅在确实减少重复时引入。

约束：

- helper 不迁到全局。
- 不隐藏按钮名称和 placeholder 这类用户可见契约。

## 不做的事

- 不修改生产代码。
- 不抽 `turnWithoutItems`。
- 不抽 projection event 分类器。
- 不合并 snapshot replay 和 transcript rebuild。
- 不合并 thread/subscription 的多层 guard。
- 不移除 root 示例组件。
- 不新增 CI gate。
- 不安装或引入新依赖。

## 应保留的重复

- reducer 和 selector 测试中的完整期望对象。
- 首个 GUI host 握手顺序测试中的显式 JSON-RPC 步骤。
- `ProjectionIngressAdapter` 测试中贴近 commit chain 和 subscription 边界的本地 helper。
- protocol、ingress、runtime、transcript 各层针对 projection event 的分支逻辑。
- UI class 相关的局部重复；本次范围不处理视觉布局。

## 实施切片

### 切片 1：迁移 projection builders

新增 `projectionTestBuilders.ts`，迁移跨 feature payload builders，然后更新相关测试导入。

预期影响：

- 降低 `CommittedTranscriptSurface.browser.test.tsx`、`snapshotReplay.test.ts`、`threadRuntimeSlice.test.ts`、`liveEventHandling.test.ts`、`composerTurnControlModel.test.ts` 的 builder 重复。
- 不改变断言形状。

### 切片 2：收敛 GUI host client 测试握手

扩展 `guiHostClientTestSupport.ts`，替换 `guiHostClient.test.ts` 中非核心握手顺序测试的重复 setup。

预期影响：

- 降低最大 clone 热点。
- 保留首个顺序测试作为协议流程可读锚点。

### 切片 3：收敛 App browser harness

扩展 `appBrowserTestSupport.ts`，替换 `App.browser.test.tsx` 中重复的 host options 和 host event 调用。

预期影响：

- 减少 `startGuiHostConnectionMock.mock.calls[0]?.[0]` 直接访问。
- App 测试仍显式表达 attach、commands ready、projection event 的顺序。

### 切片 4：收敛 composer command mock 和局部断言

共享 `createGuiHostCommands`，并在 composer browser test 内引入局部状态断言 helper。

预期影响：

- 减少 App 和 composer 测试间 command mock 重复。
- 减少 disabled 状态断言重复。

## 验收标准

- 相关测试继续通过。
- `jscpd` 报告中的 clones 数和 duplicated lines 明显下降。
- 目标是从 `29 clones / 353 duplicated lines` 降到约 `10-15 clones`，不要求清零。
- 测试文件仍能直接看出关键事件顺序和用户可见断言。
- 没有生产代码 diff。

## 验证计划

实施时按切片运行相关测试：

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- src/features/projection
pnpm run test:unit -- src/features/guiHost/__tests__/guiHostClient.test.ts
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

完成后运行：

```sh
cd /Users/jiangsheng/cnb/codex
jscpd /Users/jiangsheng/cnb/codex/codex-gui/src \
  --reporters console \
  --min-lines 6 \
  --min-tokens 60 \
  --ignore "**/*.po,**/*.json,**/.DS_Store"
```

如进入完整实现收尾，再运行 `codex-gui` 的常规校验命令：

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier
pnpm run lint
pnpm run type-check
pnpm run test:unit
```
