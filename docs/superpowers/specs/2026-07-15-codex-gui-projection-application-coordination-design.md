# Codex GUI Projection Application Coordination 设计

状态：已确认

## 背景

Codex GUI 重构审计的 B05 / `RA-03-001` 发现，`GuiHostConnectionBridge` 当前不只是 React connection bridge。它在同一个 `useEffect` 中同时承担：

- 启动和清理 GUI host connection；
- 根据 launch thread 创建和替换 `ProjectionIngressAdapter`；
- 接收 attach、event、delta、closed typed callbacks；
- 执行 attach identity pre-gate；
- 将 adapter outcome 映射为 Redux actions；
- 持有 B04 收敛后的唯一 snapshot replay baseline；
- 管理 projection delta 的 RAF batching、同步 flush 和卸载丢弃；
- 协调 manual reconnect 与 teardown 顺序。

B04 已删除 Redux 中未被 production 消费的 replay index，使 Bridge 成为唯一 replay baseline owner。B04 没有拆分上述其他 application coordination 职责。

这不是已复现的功能错误。本设计只调整职责和依赖边界，不改变 transport、protocol、projection ingress、Redux 或 Transcript State 的外部行为。

## 目标

- 建立一个明确、React 无关的 projection application coordination owner。
- 让 React Bridge 只负责组件生命周期、GUI host connection 挂载/卸载和 UI handoff。
- 让新的 owner 统一拥有 adapter、replay baseline、delta batching、outcome mapping 和自身清理顺序。
- 保持 `ProjectionIngressAdapter` 的 filtering、commit chain、known turn 和 reconnect 契约不变。
- 保持现有 Redux action 类型、payload、dispatch 顺序和 Transcript State 消费行为不变。
- 通过独立 characterization tests 锁定 coordination 顺序，同时保留现有 App Browser 集成覆盖。

## 非目标

- 不修改 GUI host transport、WebSocket、handshake、wire shape、runtime decoder 或 Rust app-server。
- 不修改 `ProjectionIngressAdapter` 的 outcome、cursor 或 acceptance 规则。
- 不修改 Redux action payload、Thread Runtime state、Transcript State、timeline materials、rendering、Markdown 或 scroll 行为。
- 不把 B06 单条 delta action 清理并入 B05。
- 不新增 Redux middleware、listener middleware、通用 event bus 或全局 lifecycle framework。
- 不创建宽泛的 `shared`、`common`、`utils` 或通用 controller 基础类。
- 不把 status、commands、launch token 或 AppShell React state 移入新的 coordinator。
- 不重新引入第二份 retained replay index。

## 已确认决策

### 使用 React 无关的 imperative coordinator

新增按单次 Bridge effect / connection 生命周期创建的 `ProjectionApplicationCoordinator` 实例。

它不是 hook、Redux middleware 或 singleton。React Bridge 在 effect 开始时创建实例，把 GUI host typed callbacks 转交给实例，并在 effect cleanup 中显式 dispose。

### 使用实例 class

Coordinator 使用实例 class 表达私有 retained state、typed handlers 和 `dispose()` 生命周期。Bridge 使用箭头函数转交 callbacks，不依赖未绑定的实例方法。

### 使用最小依赖注入

Coordinator 构造时接收：

- 现有 `AppDispatch`；
- 一个窄 RAF scheduler port，提供 `requestFrame(callback)` 与 `cancelFrame(handle)`。

Coordinator 直接复用现有 Redux action creators，并直接创建真实 `ProjectionIngressAdapter`。本设计不为 action mapping、adapter 或 transport 新增只服务单一实现的接口层。

## Owner 与依赖方向

目标依赖方向为：

```text
GUI host typed callbacks
          ↓
GuiHostConnectionBridge
          ↓
ProjectionApplicationCoordinator
          ↓
ProjectionIngressAdapter + Redux actions
```

`ProjectionApplicationCoordinator` 可以依赖：

- generated projection protocol payload types；
- `ProjectionIngressAdapter` 和 `ProjectionIngressOutcome`；
- thread identity 与 thread runtime action creators；
- snapshot replay 的纯类型、index 构造和分类 helpers；
- 注入的 dispatch 与 RAF scheduler。

它不得依赖 React、AppShell、GUI host transport implementation、WebSocket、DOM rendering 或 Transcript State reducer internals。

`ProjectionIngressAdapter` 继续只依赖 generated projection protocol types，不反向依赖 coordinator、Redux、React 或 transport。

## 组件职责

### `GuiHostConnectionBridge`

Bridge 保留：

- React `useEffect` 生命周期；
- `startGuiHostConnection` 的启动和 cleanup handle；
- `GuiHostStatus`、`GuiHostCommands` 和完整 `LaunchParams` 的 React handoff；
- connection 启动异常的 microtask、mounted guard 和错误状态；
- coordinator 与 connection 的卸载编排。

Bridge 不再持有：

- launch thread ID；
- `ProjectionIngressAdapter`；
- snapshot replay baseline；
- pending delta queue 或 RAF handle；
- outcome mapping 或 projection flush 规则。

### `ProjectionApplicationCoordinator`

Coordinator 私有持有：

- 当前 launch thread ID；
- 当前 `ProjectionIngressAdapter | null`；
- 唯一 `SnapshotReplayIndex | null`；
- pending delta notification queue；
- pending RAF handle；
- disposed 状态。

Coordinator 暴露窄 application handlers：

- `handleLaunchThread(threadId)`；
- `handleProjectionAttached(response)`；
- `handleProjectionEvent(notification)`；
- `handleProjectionDelta(notification)`；
- `handleProjectionClosed(notification)`；
- `dispose()`。

Coordinator 不接收或保存 launch token。Bridge 在 `onLaunchParams` 中先完成现有 `setLaunchParams(params)` handoff，再把 `params.threadId` 交给 coordinator。

## 数据流与顺序契约

### Launch

`startGuiHostConnection` 会在创建 WebSocket 前同步调用 `onLaunchParams`，因此 coordinator 必须在调用 `startGuiHostConnection` 前完成创建。

收到 launch params 时：

1. Bridge 调用 `setLaunchParams(params)`。
2. Bridge 调用 `coordinator.handleLaunchThread(params.threadId)`。
3. Coordinator 保存 launch thread ID。
4. Coordinator 创建新的 `ProjectionIngressAdapter`。
5. Coordinator 清除旧 replay baseline。
6. Coordinator dispatch `launchThreadIdRecorded(threadId)`。

保持当前行为：new launch 不自动清空 Redux runtime，也不 flush 或丢弃已经排队的 delta。B05 不借职责迁移重新定义该语义。

### Attach

收到 attach response 时：

1. Coordinator 先 dispatch `attachedThreadIdObserved(attachedThreadId)`。
2. 如果 attached thread 与 launch thread 不匹配，或 adapter 尚未建立，立即返回。
3. Coordinator 调用 `ProjectionIngressAdapter.handleAttach(response)`。
4. 只有 outcome 为 `attachAccepted` 时，才从 snapshot turns 构造新 replay index，并完整替换旧 baseline。
5. Coordinator 在 dispatch `threadRuntimeAttached(response)` 前同步 flush pending delta。

Mismatch attach 只更新 observed identity，不进入 adapter，不推进 runtime，也不清空或替换最后一次 accepted replay baseline。

### Event

收到 projection event 时：

1. Adapter 不存在时忽略输入。
2. Coordinator 调用 `adapter.handleEvent(notification)`。
3. `eventAccepted` 时先同步 flush pending delta。
4. 没有 replay baseline 时分类为 `live`；存在 baseline 时调用现有 `replayForProjectionEvent`。
5. Coordinator dispatch 现有 `threadRuntimeEventBuffered({ notification, replay })`。

Adapter 返回 `manualReconnectRequired` 时，Coordinator 先同步 flush pending delta，再 dispatch 现有 `threadRuntimeManualReconnectRequired`。

Adapter 返回 `ignored` 时，不 flush、不 dispatch，也不修改 replay baseline。

### Delta

收到 projection delta 时：

1. Adapter 不存在时忽略输入。
2. Coordinator 调用 `adapter.handleDelta(notification)`。
3. 只有 `deltaAccepted` 才按接收顺序进入 pending queue。
4. 尚无 pending frame 时，通过 scheduler 注册一个 RAF callback。
5. 同一 RAF 窗口内不重复注册 frame。
6. RAF callback 将当前 queue 作为一个 `threadRuntimeDeltasAccepted({ notifications })` action dispatch，并清空 queue 与 frame handle。

Delta 不推进 adapter commit head；该契约继续完全由 `ProjectionIngressAdapter` 定义。

### Closed 与 manual reconnect

`onProjectionClosed` 表示 projection subscription backpressure，不等于 WebSocket close 或 connection teardown。

Coordinator 将 closed notification 交给 adapter。Matching closed 返回 `manualReconnectRequired("backpressure")` 时：

1. 同步 flush pending delta；
2. dispatch `threadRuntimeManualReconnectRequired`；
3. 保持 transport 与 commands 连接不变。

Adapter 进入 manual reconnect 闭锁后，后续 event、delta 和 closed outcome 为 `ignored`；replacement attach 继续按现有 adapter 契约重置闭锁。

## RAF 与 flush 契约

以下 outcome 是同步 flush boundary：

- `attachAccepted`；
- `eventAccepted`；
- `manualReconnectRequired`，包括 commit mismatch、missing turn 和 backpressure closed。

`ignored` 不是 flush boundary。

Flush 必须：

1. 在相应 structural/runtime action 前发生；
2. 保持 notification 接收顺序；
3. 清空 queue；
4. 取消尚未执行的 pending frame；
5. 最多 dispatch 一个 batch action。

空 queue flush 只负责取消可能残留的 frame handle，不 dispatch 空 batch。

## Dispose 与 teardown

Coordinator 的 `dispose()` 必须幂等，并执行：

1. 标记实例已 disposed；
2. 丢弃 pending delta queue，不做最后一次 flush；
3. 取消 pending RAF；
4. 清除 frame handle。

Dispose 后收到的旧 callback 输入全部忽略，不能重新创建 adapter、调度 frame 或 dispatch action。该约束只保护已经结束的 effect 生命周期，不改变有效连接期间的业务语义。

Bridge effect cleanup 保持当前外部顺序：

1. `isMounted = false`；
2. `setCommands(null)`；
3. `setLaunchParams(null)`；
4. `coordinator.dispose()`；
5. `cleanupConnection?.()`。

Coordinator 不负责 connection cleanup。Transport cleanup 继续由 `startGuiHostConnection` 返回的 handle 完成。

## 错误处理

- `startGuiHostConnection` 的同步异常继续由 Bridge 捕获。
- Bridge 继续通过 microtask 避免在 effect 初始化过程中同步更新错误 UI。
- `isMounted` 继续阻止卸载后的启动异常 microtask 更新错误状态；connection cleanup 继续负责移除 transport handlers，阻止后续 commands handoff。
- Coordinator 不捕获、翻译或显示 transport/protocol 错误。
- Adapter 的 ignored/manual reconnect outcome 继续作为正常 application result 处理，不转换为异常。

## 测试设计

### Coordinator characterization tests

新增与 coordinator 同 owner 的独立 Vitest 测试。测试使用：

- 记录 action 顺序的 fake dispatch；
- 可显式运行和取消 callback 的 fake RAF scheduler；
- 现有合法 projection fixtures/builders；
- 真实 `ProjectionIngressAdapter`。

定向覆盖：

- launch 创建或替换 adapter、清除 baseline 并记录 identity；
- accepted attach 前 flush pending delta；
- accepted event 前 flush pending delta；
- closed、commit mismatch 和 missing turn 的 reconnect action 前 flush；
- `ignored` outcome 不 flush、不 dispatch；
- 同一 frame 的 delta 合并、顺序和单次 batch dispatch；
- accepted replacement attach 完整替换 replay baseline；
- mismatch attach 保留最后一次 accepted baseline；
- new launch 清除 baseline，但保持当前 pending delta 行为；
- manual reconnect 后的 notification suppression 与 replacement attach reset；
- dispose 丢弃 queue、取消 frame、保持幂等且拒绝迟到输入。

这些测试锁定 action 与 scheduler 顺序，不重复测试 Transcript State reducer 内部结果。

### App Browser integration tests

保留现有 `App.browser.test.tsx` 覆盖，继续验证：

- Bridge 启动 connection 并转交 typed callbacks；
- accepted attach/event/delta 最终进入真实 Redux 与 UI；
- RAF batching 和 structural event 前 flush；
- replay baseline replacement、new launch 与 mismatch；
- manual reconnect、composer gate 和后续 event suppression；
- unmount cleanup 与 pending frame cancellation；
- connection 启动异常、commands 和 status handoff。

本设计不要求把所有 coordinator 顺序断言复制到 Browser 测试。Coordinator tests 拥有精确 ordering 契约，Browser tests 保持 production wiring 与外部行为覆盖。

本次没有用户可见 UI 变化，因此不新增或更新 UI snapshot。

## 未采用方案

### Custom hook 作为 owner

只把当前 effect 搬入 hook 会隐藏代码，但 adapter、baseline、RAF 和 Redux coordination 仍依附 React。它不能形成独立 application owner，也使 teardown 顺序继续依赖 effect 结构。

### Closure factory

Closure factory 可以封装同样的状态，但本设计选择实例 class，让多个 typed handlers、私有 retained state 与幂等 dispose 在一个显式实例上可见。Bridge 仍使用闭包箭头函数完成 callback handoff。

### 纯 state machine 与 effect interpreter

当前流程需要同步调用可变 adapter、同步 flush/dispatch，并只把 delta 延迟到 RAF。完整纯化需要新增 command/effect union、同步 interpreter 和 frame handle 回流，复杂度超过本次职责抽取。

### Redux listener middleware

GUI host typed callbacks 不是 Redux action 输入；先把输入转换成中间 action 再由 middleware 协调会增加中转层，并模糊 adapter、baseline 与 frame resource 的 owner。

### 扩展 `ProjectionIngressAdapter`

把 replay、Redux mapping 或 RAF batching 放入 adapter 会破坏其现有 filtering/commit-chain/reconnect 边界，并引入对 application infrastructure 的反向依赖。

## 建议文件边界

预期 production 边界为：

- 新增 `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`；
- 修改 `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`，只保留 connection/React wiring；
- 新增 coordinator owner-local tests；
- 保留现有 adapter、thread runtime、thread identity、Transcript State 和 GUI host client API。

具体任务拆分、测试命令和提交边界属于后续 implementation plan，不在本设计中展开。

## 风险与控制

- **Flush 顺序漂移：** 使用 fake dispatch 与 scheduler 精确断言 delta batch 在 attach/event/reconnect action 前发生。
- **Replay baseline 重复或漂移：** baseline 只存在于 coordinator；保留 B04 replacement、new launch 和 mismatch 覆盖。
- **Teardown 竞态：** `dispose()` 先丢弃 queue、再 cancel frame，并拒绝迟到 callbacks；Bridge 随后 cleanup connection。
- **Strict Mode 重挂载：** 每个 effect 创建独立 coordinator 和 connection，不使用模块级 singleton 或跨 effect retained instance。
- **过度抽象：** 只注入 dispatch 与 scheduler；不新增 adapter factory、action ports 或通用 controller framework。
- **范围扩大：** 任何 adapter outcome、Redux payload、replay 值域、transport callback 或 Transcript State 行为变化都视为超出 B05，必须停止并重新确认设计。

## 接受标准

- `GuiHostConnectionBridge` 不再持有 adapter、replay baseline、delta queue、RAF handle 或 outcome mapping。
- `ProjectionApplicationCoordinator` 是上述 application coordination state 和顺序的唯一 owner。
- Bridge 只负责 React/connection lifecycle、UI handoff、typed callback forwarding 和联合 teardown。
- `ProjectionIngressAdapter` 的 public contract 与测试语义不变。
- B04 的 replay baseline 单一 owner 约束继续成立。
- Redux action 类型、payload、顺序及 Transcript State 外部行为不变。
- Delta batching、flush boundaries、manual reconnect suppression、mismatch 与 teardown 行为保持不变。
- Coordinator 独立 tests 与现有 App Browser tests 共同覆盖职责迁移。
- 不修改 transport、wire protocol、Rust、timeline、Transcript State 或 UI。

## 参考

- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md`
- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/03-projection-ingress-and-thread-runtime.md`
- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md`
- `docs/superpowers/specs/2026-07-15-codex-gui-replay-index-owner-design.md`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/__tests__/App.browser.test.tsx`
