# codex-gui event/composer 热路径设计

## 目标

降低 `codex-gui` 在 projection event 高频到达时的前端热路径成本。当前每条 projection event 除了更新 Redux runtime/transcript 外, 还会通过 GUI host status 触发 `App` 顶层 React state 更新; 同时 composer 为了拿少量字段订阅完整 `ThreadRuntimeRecord`, 会被 `eventBuffer` 高频变化带动。

本设计只处理两个已确认方向:

- 移除每事件变化的 GUI host status 对 `App` 顶层渲染路径的影响。
- 收窄 `ComposerTurnControl` 对 runtime state 的订阅。

## 已确认决策

- 方案边界选择 A: 拆 lifecycle status, 移除 per-event status, 收窄 composer selector。
- 测试契约选择 A: 测试改断言真实业务结果, 不保留替代 DOM test hook。

## 当前结构

`App` 当前持有完整 `GuiHostStatus` state, 并传给 `AppShell`。`GuiHostConnectionBridge` 把 `startGuiHostConnection` 的 `onStatus` 直接连接到 `setStatus`。

`guiHostClient` 在每个 `thread/projection/event` 和 `thread/projection/closed` 后递增 `eventCount`, 并 emit `label: "received event"` 和 `lastEventType`。`AppShell` 只把 `status.label` 写入 `data-gui-host-status`, 错误 UI 只需要 `label === "error"` 和 `message`。

`ComposerTurnControl` 当前订阅:

- `selectThreadRuntimeRecord`
- `selectThreadRuntimeActiveTurnId`
- `selectThreadRuntimeSubscription`

但 composer 实际只需要 runtime 是否存在、`threadId`, `activeTurnId`, 以及 subscription 是否 active。`eventBuffer`, `snapshotTurns`, `thread`, `sessionId` 不参与 composer 行为。

## 状态边界设计

GUI host status 应只表达 shell/composer 需要响应的生命周期状态:

- `connecting`
- `authenticated`
- `initialized`
- `attached`
- `closed`
- `error`

`error` 继续携带 `message`, 用于 `AppShell` 的错误 Alert。其他生命周期状态不携带 per-event telemetry。

projection event 不再产生进入 `App` 顶层 state 的 `"received event"` status。事件仍按现有业务通道处理:

```text
guiHostClient onProjectionEvent
-> GuiHostConnectionBridge
-> ProjectionIngressAdapter
-> Redux runtime/transcript state
```

这使 projection event 的业务效果继续保留, 但不再额外驱动顶层 shell/composer props 更新。

`eventCount` / `lastEventType` 不进入渲染路径。当前没有已确认消费者需要它们; 如后续需要开发诊断, 应另行设计非默认渲染订阅的 diagnostics 出口, 不在本阶段引入。

## Composer 订阅设计

`threadRuntimeSlice` 增加面向 composer 的窄 selector:

```ts
selectThreadRuntimeThreadId: (threadRuntime) =>
  threadRuntime.current?.threadId ?? null,

selectThreadRuntimeSubscriptionState: (threadRuntime) =>
  threadRuntime.current?.subscription.state ?? null,
```

`ComposerTurnControl` 改为订阅:

- `selectThreadRuntimeThreadId`
- `selectThreadRuntimeActiveTurnId`
- `selectThreadRuntimeSubscriptionState`
- `selectCanAdvanceThreadIdentity`

`ComposerTurnControl` 不再订阅 `selectThreadRuntimeRecord`。发送和停止命令使用 `threadId` primitive:

- `turn/start`: `threadId`
- `turn/interrupt`: `threadId` + `activeTurnId`

`composerTurnControlModel.isConnectionUsable` 的输入从完整 runtime/subscription 改为更窄的值:

```ts
type ComposerAvailabilityInput = {
  canAdvanceThreadIdentity: boolean;
  guiHostStatus: GuiHostStatus;
  threadId: string | null;
  subscriptionState: ThreadRuntimeSubscription["state"] | null;
};
```

可用性判断保持语义不变:

- thread identity 已可用。
- `threadId != null`。
- `subscriptionState === "active"`。
- GUI host 不是 `error` 或 `closed`。

这样 `eventBuffer` 仍可用于 live event handling / snapshot replay, 但不会因为每条 projection event 改变 composer 的 selector 结果。

## 测试设计

测试不再使用 `data-gui-host-status="received event"` 作为事件到达信号。

`App.browser.test.tsx` 应改为断言真实业务结果, 例如:

- projection event 被接受后进入 runtime buffer。
- `turnStarted` 后 active turn 影响 composer send/stop 状态。
- committed transcript 对可见事件正常渲染。

`codex-gui/e2e/app.spec.ts` 不再断言 `"received event"` DOM test hook。需要事件到达证明时, 优先断言用户可见结果或 JSON-RPC payload 行为。

`guiHostClient.test.ts` 应验证:

- 生命周期 status 仍按握手阶段发出。
- projection event callback 仍被调用。
- projection closed callback 仍被调用。

它不再要求每个 projection event emit GUI host status。

`composerTurnControlModel.test.ts` 应跟随 model API 更新, 直接用 `threadId` 和 `subscriptionState` 覆盖可用性判断。

`ComposerTurnControl.browser.test.tsx` 应继续覆盖:

- attach 后可发送。
- active turn 时 Stop 可用。
- manual reconnect / host error / closed 时 composer 禁用。
- `turn/start` 和 `turn/interrupt` payload 使用正确 `threadId`。

## 非目标

- 不实现 transcript 窗口化或渲染裁剪。
- 不改变 `eventBuffer` 的存在意义或 buffer 长度策略。
- 不改变 `ProjectionIngressAdapter` 的事件接受、去重或 reconnect 语义。
- 不优化 `itemStarted` 写入 `transcriptState` 的行为; 这是后续方向 4。
- 不引入 diagnostics store 或新的可见调试 UI。
- 不安装或引入新依赖。

## 验证

实现计划阶段应至少包含:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
pnpm run test:unit -- src/features/guiHost/__tests__/guiHostClient.test.ts src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
pnpm run type-check
```

如果实现触及 e2e 契约, 还应包含对应 e2e 验证。完整 `pnpm run ci` 可作为整体验证, 但不在设计阶段执行。
