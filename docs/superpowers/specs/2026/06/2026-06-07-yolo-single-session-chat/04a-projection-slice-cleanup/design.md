# ProjectionSlice Cleanup Design

## 目标

`04a ProjectionSlice Cleanup` 负责删除 `03 Thread Runtime Store` 之后残留的旧 `projectionSlice` truth model，让后续阶段只沿着 `ProjectionIngressAdapter -> threadRuntime -> snapshotReplay` 主线继续推进。

这一层位于 `04 Snapshot Replay` 之后、`05 Live Event Handling` 之前。它只做旧兼容路径清理，不新增 replay 行为，不解释 live event，不派生 chat view model，也不改变当前 GUI host debug panel 的 UI 形态。

完成后，GUI 仍然可以通过现有 `/gui` 连接、attach、接收 projection event，并把 accepted attach/event 写入 `threadRuntimeSlice`。区别是：`App` 不再同时把这些输入写入旧 `projectionSlice`，store 中也不再注册旧 projection reducer。

## 已确认决策

**决策 1：清理深度**

选择彻底删除旧 `projectionSlice`。

- 删除 `codex-gui/src/features/projection/projectionSlice.ts`。
- 删除 `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`。
- 移除 `codex-gui/src/app/store.ts` 中的 projection reducer 注册。
- 移除 `codex-gui/src/App.tsx` 中的 `projectionAttached` / `projectionEventReceived` import 和 dispatch。

**决策 2：删除后的验证锚点**

验证锚点是 `App -> threadRuntime -> snapshotReplay`。

- `ProjectionIngressAdapter` 仍只负责协议 outcome。
- `App` 处理 accepted attach 时只写入 `threadRuntimeAttached`。
- `App` 处理 accepted event 时只写入 `threadRuntimeEventBuffered`。
- snapshot baseline 继续通过 `snapshotReplay` 从 `threadRuntime` 派生 replay material。

测试不再围绕已删除的 `projectionSlice` 写负向断言。`projectionSlice` 作为实现文件和 slice 测试文件被删除后，不再作为后续设计或测试对象。

**决策 3：App Debug Panel**

保留当前 GUI host debug panel 原样。

`04a` 不改 UI 文案、不删除 status panel、不为聊天界面腾位置。status、attached、events、last event 这些现有连接状态展示继续由 `GuiHostStatus` 驱动。

**决策 4：Fixture 归属**

保留 `codex-gui/src/features/projection/__fixtures__` 目录。

这些 JSON fixtures 表示 app-server projection 协议 payload，当前仍被 `projectionIngress`、`threadRuntime`、`snapshotReplay` 等测试使用。`04a` 不迁移 fixture 目录，不删除仍被引用的 fixture，也不为了目录命名做 import churn。

`codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts` 可以保留，只要它验证的是 protocol fixture 可用性，而不是旧 `projectionSlice` 行为。

## 范围

这一层处理：

- 删除旧 `projectionSlice` implementation file。
- 删除旧 `projectionSlice` reducer tests。
- 移除 app store 中的 projection reducer key。
- 移除 `App` 中对旧 projection actions 的 dispatch。
- 保证 accepted projection attach/event 仍进入 `threadRuntimeSlice`。
- 保证 `snapshotReplay` 仍从 `threadRuntimeSlice` 派生 replay material。
- 保留 projection protocol fixture 目录。

这一层不处理：

- 不删除 projection protocol fixtures。
- 不迁移 `features/projection/__fixtures__` 到其他目录。
- 不改变 `ProjectionIngressAdapter` 的 outcome 模型。
- 不改变 `threadRuntimeSlice` 的状态模型。
- 不改变 `snapshotReplay` 的 material 模型。
- 不消费 live `eventBuffer`。
- 不实现 `05 Live Event Handling`。
- 不派生 chat view model。
- 不新增可见 UI。
- 不改变 GUI host debug panel 文案或布局。
- 不设计 reconnect UI。
- 不处理 composer 或 tool activity。

## 当前问题

`02 Projection Ingress Adapter` 和 `03 Thread Runtime Store` 已经建立了新主线，但 `App.tsx` 目前仍在 accepted attach/event 后同时 dispatch 两套状态：

```text
attachAccepted -> threadRuntimeAttached + projectionAttached
eventAccepted  -> threadRuntimeEventBuffered + projectionEventReceived
```

这会让后续阶段存在两个并行 truth model：

- 新主线：`threadRuntimeSlice` 保存 snapshot baseline、event buffer、active turn 和 subscription state。
- 旧主线：`projectionSlice` 继续 upsert `thread.turns` / `turn.items`，并维护自己的 `reattach` 状态。

`04 Snapshot Replay` 已经从 `threadRuntimeSlice` 派生 replay material，不读取 `projectionSlice`。因此 `projectionSlice` 在 `04a` 之后应从代码中删除，避免 `05/06/08` 后续阶段继续读取旧 selector 或沿旧 upsert 模型设计。

## 目标架构

`04a` 完成后的数据流是：

```text
guiHostClient
  -> ProjectionIngressAdapter
     -> attachAccepted
        -> App dispatches threadRuntimeAttached
     -> eventAccepted
        -> App dispatches threadRuntimeEventBuffered
     -> manualReconnectRequired
        -> App dispatches threadRuntimeManualReconnectRequired
  -> threadRuntimeSlice
  -> snapshotReplay selector
```

不再存在：

```text
App -> projectionAttached
App -> projectionEventReceived
store.projection
projectionSlice selectors
```

`features/projection/__fixtures__` 仍然存在，但它只是 protocol fixture 目录，不是 Redux feature boundary。

## 文件边界

预期实现会修改：

- `codex-gui/src/App.tsx`
  - 删除 `projectionAttached` / `projectionEventReceived` import。
  - 删除 `attachAccepted` 分支里的 `dispatch(projectionAttached(...))`。
  - 删除 `eventAccepted` 分支里的 `dispatch(projectionEventReceived(...))`。

- `codex-gui/src/app/store.ts`
  - 删除 `projectionSlice` import。
  - 删除 `projection: projectionSlice.reducer` 或等价 reducer 注册。

预期实现会删除：

- `codex-gui/src/features/projection/projectionSlice.ts`
- `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`

预期实现会保留：

- `codex-gui/src/features/projection/__fixtures__/*.json`
- `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`

## 测试策略

`04a` 的测试重点不是证明旧 `projectionSlice` 没被使用，而是证明旧 slice 文件和 slice 测试已经删除后，新主线仍可工作。

需要保留或调整的 focused tests：

- `codex-gui/src/__tests__/App.browser.test.tsx`
  - accepted attach 仍填充 `threadRuntime`。
  - accepted event 仍进入 `threadRuntime.eventBuffer`。
  - manual reconnect outcome 仍进入 `threadRuntime.subscription`。
  - 现有 debug panel 状态仍按 `GuiHostStatus` 展示。

- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - runtime attach、event buffer、manual reconnect 行为继续通过。

- `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
  - snapshot replay 仍从 `threadRuntime` 派生 material。

- `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
  - projection attach/event/closed outcome 语义继续通过。

- `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
  - protocol fixtures 继续可被类型化和使用。

需要删除的 tests：

- `codex-gui/src/features/projection/__tests__/projectionSlice.test.ts`

常规验证命令：

```bash
pnpm --dir codex-gui exec vitest --run src/__tests__/App.browser.test.tsx
pnpm --dir codex-gui exec vitest --run src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
pnpm --dir codex-gui exec vitest --run src/features/projection/__tests__/projectionFixtures.test.ts
pnpm --dir codex-gui run type-check
```

## 验收标准

`04a` 完成后：

- `projectionSlice.ts` 已删除。
- `projectionSlice.test.ts` 已删除。
- `store.ts` 不再注册 projection reducer。
- `App.tsx` 不再 dispatch `projectionAttached` 或 `projectionEventReceived`。
- `App` accepted attach 仍写入 `threadRuntimeAttached`。
- `App` accepted event 仍写入 `threadRuntimeEventBuffered`。
- manual reconnect outcome 仍写入 `threadRuntimeManualReconnectRequired`。
- `snapshotReplay` focused tests 继续通过。
- `threadRuntime` focused tests 继续通过。
- `projectionIngress` focused tests 继续通过。
- projection fixture tests 继续通过。
- `App.browser.test.tsx` 继续通过。
- `pnpm --dir codex-gui run type-check` 通过。
- `features/projection/__fixtures__` 保持原路径。
- GUI host debug panel 视觉和文案不因 `04a` 改变。

不以以下事项作为 `04a` 验收：

- 不要求聊天 UI 出现。
- 不要求 replay material 接入 `App`。
- 不要求 live event handling。
- 不要求 reconnect button。
- 不要求 fixture 目录迁移。
- 不要求删除 `projectionFixtures.test.ts`。

## 后续阶段边界

`05 Live Event Handling` 才开始消费 `threadRuntime.eventBuffer`，并建立 live material / live handling path。`04a` 只负责保证旧 `projectionSlice` truth model 已清出主线。

`05b Incremental Chat State Boundary` 才把 attach baseline 和 accepted live notification 应用成 prepared chat facts。`06 Basic Chat Surface` 只消费这些 prepared facts 和相邻 runtime status。`04a` 不提前决定 user message、assistant message、status row 或 tool activity 的最终展示。
