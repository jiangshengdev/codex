# Codex GUI 多代理 DAG Runtime 与多 Thread Ingestion 实施计划

日期：2026-07-28
状态：待确认

设计依据：

- `docs/superpowers/specs/2026-07-28-codex-gui-multi-agent-dag-view-design.md`
- `docs/superpowers/plans/2026-07-28-codex-gui-multi-agent-dag-view/00-overview.md`

## 唯一目标

使用 `02` 提供的 `AgentDagSource` 驱动一个连接生命周期内持久存在的 `AgentDagRuntime`，把 Root 与全部后代 Thread 的分页历史、projection subscription 和实时 notification 按确定性顺序提交给 `03` 的同一 replay frontier，并通过 `04` 的 Redux action 分帧生成 scene；同时保证 Root notification 继续进入既有聊天 coordinator，后代 notification 不覆盖 `threadRuntime.current`。

## 输入依赖与开始门禁

开始本任务前，`02`、`03`、`04` 必须已经完成各自聚焦验证并形成独立本地提交，且下列接口已经存在：

- `src/features/agentDagSource/agentDagSource.ts`
  - `AgentDagSource.listDescendants(rootThreadId)`；
  - `AgentDagSource.listTurns(threadId)`；
  - `AgentDagSource.attach(threadId)`；
  - `AgentDagSource.detach(threadId)`。
- `src/features/agentDagSource/appServerAgentDagSource.ts`
  - 只使用 generated request descriptors、validators 与 `GuiHostCommands`，不暴露通用 request。
- `src/features/agentDagSource/inMemoryAgentDagSource.ts`
  - 可控制分页、请求完成顺序、attach lease、detach 和失败。
- `src/features/agentDag/agentDagEventModel.ts`
  - `AgentDagHistoryThread`、`AgentDagReplayEntry` 及单 Thread 权威输入类型。
- `src/features/agentDag/agentDagCausalReplay.ts`
  - `buildAgentDagReplaySequence(histories, rootThreadId)`；
  - `createAgentDagReplayFrontier(rootThreadId)`；
  - `advanceAgentDagReplay(frontier, input)`；
  - frontier 内部独占稳定去重、因果 ready-set、tie-break 与 recipient-turn batch accumulator；历史便利函数内部也必须经过同一 frontier。
- `src/features/agentDag/agentDagSlice.ts`
  - `agentDagSceneOpened({ rootThreadId })`；
  - `agentDagReplayEntriesApplied({ rootThreadId, entries })`；
  - `agentDagLoadStateUpdated({ rootThreadId, loadState })`；
  - `agentDagSceneDisposed({ rootThreadId })`；retry reset 通过 dispose 旧 Root scene 后重新 open 表达；
  - `04` 已固定的 normalized scene state 与 selectors。

若上述真实名称或语义在前置任务中发生变化，应先同步修改本计划并重新确认；不得在 `05` 内创建临时 DTO、第二套排序器或兼容 adapter 绕过前置接口。

## 非目标

- 不修改 Rust、app-server protocol、generated artifacts、validator profile 或 initialize capability。
- 不解析 inter-agent 文本信封，不读取或保存消息 payload、encrypted content。
- 不修改五类事件转换、稳定 ID、Kahn 排序、batch merge、activation、lane、颜色、坐标或 edge 语义。
- 不新增 React Flow、Tabs、DAG panel、工具栏、viewport、高亮、节点样式、视觉基线或依赖。
- 不把现有 `ProjectionApplicationCoordinator` 改成多 Thread 数组，不让后代 attach/event 写入 `threadRuntime.current` 或 transcript state。
- 不把网络 page 返回顺序或跨 subscription 到达顺序声称为真实全局顺序。
- 不把 `turnCompleted`、最后观测点、snapshot 结尾或 `FINAL_ANSWER` 当成 Thread 关闭；`turnCompleted` 在本层只作为 recipient batch 的封口输入。
- 不在 DAG surface 隐藏时 dispose runtime；只在任务/连接 owner 销毁、retry generation 替换或明确 source failure 清理时回收资源。

## 已核验的当前 seam

- `src/features/appShell/GuiHostConnectionBridge.tsx`
  - 当前每个 effect 创建一个聊天 `ProjectionApplicationCoordinator`；
  - `onProjectionAttached/Event/Delta/Closed` 是 Root fanout 的准确入口；
  - cleanup 顺序当前为 coordinator dispose 后 connection cleanup。
- `src/features/guiHost/guiHostClient.ts`
  - 单一 WebSocket 已分类并回调三种 `thread/projection/*` notification；
  - notification 包含 generated `threadId` 与 `subscriptionId`，无需新增 transport router；
  - `onProjectionAttached` 发生在 `onCommandsReady` 之前，因此 Bridge 必须缓存初始 Root attach，待 DAG source/runtime 建立后补交。
- `src/features/projectionIngress/projectionIngressAdapter.ts`
  - 已按 `threadId + subscriptionId` 拒绝 foreign/stale notification；
  - 已处理 duplicate commit、commit chain mismatch、missing turn 与 backpressure；
  - 本任务为每个 Thread 建独立实例，不复制其规则。
- `src/features/projectionCoordination/projectionApplicationCoordinator.ts`
  - 现有聊天 coordinator 已有可注入 RAF scheduler 和幂等 dispose；
  - 本任务复用 scheduler 形状，但 DAG replay frame 与 transcript delta frame 相互独立。
- `src/features/appRuntime/AppRuntimeLayout.tsx` 与 `AppRuntimeContext.tsx`
  - 当前是跨聊天/设置页面持久 owner；DAG runtime value 应与 `commands` 一样由 Bridge 建立并通过此 context 暴露，而不是进入 Redux。
- `src/__tests__/appBrowserTestSupport.ts`、`src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx`
  - 已能驱动 attach、commands-ready、projection event/delta/closed，并验证连接不重建与 transcript 持续更新；这里是 Root fanout 和 teardown 的现成 Browser seam。

## 精确文件边界

新增：

- `codex-gui/src/features/agentDagRuntime/agentDagRuntime.ts`
  - 深模块 owner；拥有 generation、per-thread ingress/lease/cursor、历史 worker pool、live FIFO、opaque replay frontier 与 pending frame。
- `codex-gui/src/features/agentDagRuntime/__tests__/agentDagRuntime.test.ts`
  - 使用真实 reducer、`InMemoryAgentDagSource` 和 fake frame scheduler 覆盖全部 runtime 状态机。
- `codex-gui/src/features/agentDagRuntime/__tests__/agentDagRuntimeTestSupport.ts`
  - 只提供可控 frame queue、deferred page、通知 envelope 与 runtime harness；合法 projection payload 仍从共享 builders 构造。

修改：

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - 缓存初始 Root attach；commands ready 后创建 production source/runtime；Root 回调 fanout 给聊天 coordinator 与 DAG runtime；后代只被 DAG keyed ingress 接受；cleanup 时先 dispose runtime。
- `codex-gui/src/features/appRuntime/AppRuntimeContext.tsx`
  - 增加 `agentDagRuntime: AgentDagRuntimeValue | null`；只暴露 `open(rootThreadId)` 与 `retry(rootThreadId)`。
- `codex-gui/src/features/appRuntime/AppRuntimeLayout.tsx`
  - 保存 runtime value，并向 Bridge 传入设置 callback；不根据 Chat/DAG panel 切换重建 runtime。
- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - 扩展 generated `GuiHostCommands` mock，使 production `AppServerAgentDagSource` 的 list/attach/detach 可控；不手写协议 DTO。
- `codex-gui/src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx`
  - 增加连接内 runtime 创建、Root 双路 fanout、后代隔离及 unmount disposal 的 Browser characterization。
- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
  - 仅在现有 builder 缺少时增加合法多 Thread attach、parent/ancestor、分页 Turn 与 projection envelope 的机械派生 builder。

明确不修改：

- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/guiHost/guiHostTransportSession.ts`
- `codex-gui/src/features/guiHost/guiHostHandshakeController.ts`
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- `codex-gui/src/features/agentDag/agentDagSlice.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagSlice.test.ts`
- `codex-gui/src/features/threadRuntime/**`
- `codex-gui/src/features/transcriptState/**`
- `codex-gui/src/generated/**`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`

若实现证明必须修改“明确不修改”文件，应触发停止条件，不得顺手扩大。

## Runtime 不变量

### Generation 与 lease

- `open(rootThreadId)` 总是建立新 generation；旧 generation 的 deferred response、notification、frame callback 均通过 generation token 失效。
- 初始 Root attach 是聊天 coordinator 拥有的 borrowed lease：DAG runtime 可建立自己的 keyed ingress，但不得 detach 或替换该 subscription。
- 后代 attach 是 DAG runtime 拥有的 owned lease：retry、source failure 清理和 dispose 必须成组 detach。
- `dispose()` 幂等；先标记 disposed、abort 请求、清空未提交 history/live、取消 frame，再发起 owned detach。

### 历史与实时

- descendants 全部分页完成前不开始全局 replay；Root 始终显式加入集合，谱系只使用 `parentThreadId`。
- 每个 Thread 在有限并发 worker 中读取全部 `listTurns` page；后代必须先建立 keyed attach/ingress，读取期间 live notification 只进入该 Thread FIFO。
- 初始 Root attach snapshot、后代 attach snapshot 与 `listTurns` 的重叠只通过 `03` 的稳定 persistent identity 去重；不得以数组位置、时间戳或临时计数器去重。
- 全部历史输入先通过 `createAgentDagReplayFrontier` 与 `advanceAgentDagReplay` 建立可继续接收 live 的 frontier；`buildAgentDagReplaySequence(histories, rootThreadId)` 作为同输入的一次性等值 oracle。产生的 entries 再按固定上限分帧 dispatch `agentDagReplayEntriesApplied`；不同 page 返回顺序和不同 frame batch 切分必须得到相同最终 scene。
- 历史 frame 尚未清空时，live 只增加 `queuedLive`，不能插入 scene；历史清空后按 per-thread 权威顺序喂给同一 replay frontier。
- live `turnCompleted` 只封口对应 recipient turn batch；不生成关闭节点，不阻止该 Thread 以后继续输入。
- `started` 指向尚未加载的新 child 时，先为 child 建 owned attach、补齐历史并建立直接父关系；child 补齐期间，其 notification 继续进入 keyed FIFO。

### 路由与错误

- Bridge 对 Root notification 固定执行“聊天 coordinator + DAG runtime”双路 fanout；现有 coordinator 仍只接受 launch Root。
- DAG runtime 按 `threadId + subscriptionId` 查找 per-thread `ProjectionIngressAdapter`；unknown thread、stale subscription、disposed generation 直接忽略且不 dispatch。
- commit mismatch、missing turn、backpressure、attach/validator failure 进入 `sourceError(source: "subscription")`；descendants 和 history 分别进入对应 source。
- `sourceError` 保留已经生成的 scene并明确标记不完整，绝不 dispatch `caughtUp`。
- `retry(rootThreadId)` detach 旧 owned leases、取消旧 generation、清空旧 scene，重新从权威历史构建；旧 generation 任何迟到结果不得混入新 scene。

## 实施步骤

### Step 1：先锁定 `04` 已提供的 Redux runtime 状态契约

在 `agentDagRuntime.test.ts` 的真实 store harness 中先写失败测试，完整比较以下状态迁移：

- `idle -> discovering -> loadingHistory -> replaying -> caughtUp`；
- discovered/loaded/applied/total/queuedLive 数量更新；
- `sourceError` 保留当前 scene 与 revision，但记录 source/message；
- retry 先 dispatch `agentDagSceneDisposed`，再 dispatch `agentDagSceneOpened`，清空旧 scene、diagnostics、frontier-visible counters 与 error；
- stale generation action 不改变 state。

runtime 只使用 `agentDagSceneOpened`、`agentDagReplayEntriesApplied`、`agentDagLoadStateUpdated` 与 `agentDagSceneDisposed`；不得修改 `agentDagSlice.ts` 或增加平行的 reset/batch/load action。`agentDagReplayEntriesApplied` 继续进入 `04` 的同一增量 layout reducer，不复制 scene mutation。

### Step 2：用测试 harness 先定义 runtime 外部行为

先创建 `agentDagRuntimeTestSupport.ts`：

- fake scheduler 明确记录 requested/canceled frame，并允许逐帧执行；
- deferred AsyncIterable page 可控制 descendants/history 的完成顺序和失败；
- harness 使用 `makeStore()` 和 `InMemoryAgentDagSource`，不 mock Redux reducer；
- notification 使用 `projectionTestBuilders.ts` 的 generated-type 派生 builder。

随后在 `agentDagRuntime.test.ts` 先写失败测试，至少覆盖：

- descendants 与每个 Thread 的全部 history page 被消费，Root 自动加入；
- history 最大并发不超过注入上限，某 worker 完成后才启动下一 Thread；
- page 返回顺序不同得到相同 replay entries 与完整 scene；
- history 未完成和 replay frame 未清空时，live 只进入 keyed FIFO；
- replay 跨多个 frame，逐帧更新 applied count，最后才 flush live 并进入 `caughtUp`；
- attach snapshot 与 history cut 重叠不重复节点/边；
- 同一 recipient turn 的多 author reply 直到 `turnCompleted` 才产生唯一 merge；
- `turnCompleted` 后同一 agent 新 activation 仍可进入，不被当成 closed；
- live `started` 发现子子代理后先 attach/补 history，再开放其 live FIFO；
- foreign thread、stale subscription、duplicate commit 被忽略；
- commit mismatch、missing turn、backpressure 分别进入 subscription source error，且不进入 `caughtUp`；
- descendants/history/attach 失败的 source 分类准确且保留部分 scene；
- retry 创建新 generation、detach 旧 owned lease、清空旧 scene，迟到 page/notification/frame 均无效；
- dispose 幂等、取消 pending frame、清空 FIFO、detach 全部 owned lease，borrowed Root lease 不 detach。

RED gate：测试必须因 runtime 行为尚不存在而失败；若 `04` 的现有 action 无法表达这些测试，立即停止并回到对应前置计划，不在 `05` 增加本地替身 action。

### Step 3：实现 generation、发现与有限并发历史读取

在 `agentDagRuntime.ts` 建立一个 React-independent class：

- 构造参数只注入 `AgentDagSource`、`AppDispatch`、frame scheduler、history concurrency 与 replay batch size；
- `open`/`retry` 为 fire-and-track 公共命令，内部异步错误统一进入 typed source error；
- generation 持有 AbortController、borrowed/owned lease、per-thread ingress、history pages、live FIFO 与 frame ID；
- descendants 完整枚举后用 `parentThreadId` 验证直接谱系；禁止读取 `forkedFromId`；
- worker pool 限制 Thread history 并发，结果按 threadId 保存而不是按 Promise 完成顺序提交。

先跑 runtime 聚焦测试，只闭环本步骤的 discovery/history/concurrency/generation 用例。

### Step 4：接入同一 replay frontier 与分帧 scheduler

- 历史全部取齐后创建一个 frontier，并把完整 `AgentDagHistoryThread[]` 作为同一 history-complete 输入交给 `advanceAgentDagReplay`；保留返回的 opaque frontier 供 live 续接；
- 在测试中用 `buildAgentDagReplaySequence(histories, rootThreadId)` 校验 history-complete 产生的 entries 完全相同，防止 runtime 形成第二条历史路径；
- 每帧最多取构造参数给出的固定数量 entries，dispatch 一次 `agentDagReplayEntriesApplied`；
- live notification 先经对应 `ProjectionIngressAdapter`，accepted event 再转换为 `advanceAgentDagReplay` 的 generated structured input；
- `advanceAgentDagReplay` 返回零个或多个 ready entries，runtime 只负责排队/分帧 dispatch，不理解排序、merge 或 layout；
- replay 队列清空且 live FIFO 已按 frontier 追平后才 dispatch `caughtUp`；
- delta 仍走 keyed ingress 以拒绝 stale/foreign subscription，但 DAG 不保存文本 delta，也不产生 scene entry。

不得在 runtime 中按 timestamp 排序、解析 `Message Type`、生成 merge ID 或重新实现 `03` 的 comparator。

### Step 5：实现 source error、retry 与 dispose

- 将 descendants/history/subscription 错误映射为设计规定的三个 source；
- 首次 source error 后冻结该 generation 的 scene ingestion，取消 pending frame并清理 owned subscription；
- retry 先使旧 generation 失效，依次 dispatch `agentDagSceneDisposed` 与 `agentDagSceneOpened`，再开始新 generation；
- dispose 与 retry 共用同一内部 teardown，差别只在是否启动新 generation；
- 所有 Promise continuation、AsyncIterable loop 和 frame callback 在写状态前检查 generation/disposed。

完成后运行完整 runtime 与 slice 聚焦测试。

### Step 6：接入 App runtime owner 和 Root fanout

按现有真实回调顺序修改 Bridge：

1. effect 创建聊天 coordinator，并初始化 `initialRootAttach` 与 `agentDagRuntime` 局部 owner。
2. `onProjectionAttached` 始终先交给聊天 coordinator；保存初始 Root attach；若 DAG runtime 已建立，再以 borrowed lease 注册。
3. `onCommandsReady` 创建 `AppServerAgentDagSource` 与 `AgentDagRuntime`，补交缓存的 Root attach，再同时设置 commands 与 context runtime value。
4. event/delta/closed 始终交给聊天 coordinator，并在 runtime 存在时同时交给 runtime；后代通知由聊天 ingress 自然以 wrong-thread 忽略。
5. commands unavailable 时立即清除 context value并本地 dispose；unmount cleanup 先 dispose runtime，再 dispose聊天 coordinator，最后 cleanup connection。

`AppRuntimeContext` 只暴露稳定 `{ open, retry }` value；不得暴露 source、subscription、dispatch、scheduler 或 scene。

### Step 7：扩展 Browser seam，锁定跨 owner 边界

在 `AppRuntimeLayout.browser.test.tsx` 增加测试：

- 初始 attach 先于 commands-ready 时，runtime 建立后仍取得 borrowed Root lease；
- Root projection event 同时更新现有 transcript/thread runtime 与 DAG load/replay state；
- descendant notification 只更新 DAG，不改变 `threadRuntime.current`、attached Root identity 或 transcript；
- 从聊天切到设置再返回不重建连接、不 dispose runtime，隐藏期间 notification 仍被 runtime 接收；
- unmount 只 cleanup 一次连接，取消 DAG pending frame并 detach owned descendants，不 detach borrowed Root。

Browser 测试只断言公开 Redux/context 结果和 command 调用，不断言 runtime 私有 Map、Promise 顺序或 React 私有结构。

### Step 8：格式化与聚焦验证

所有前端命令以 `/Users/jiangsheng/cnb/codex/codex-gui` 为工作目录，并使用 fnm runtime。先确认工具：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

不得运行 `pnpm install` 或更新依赖。

按实际变更文件执行 scoped format write/check：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/agentDagRuntime/agentDagRuntime.ts src/features/agentDagRuntime/__tests__/agentDagRuntime.test.ts src/features/agentDagRuntime/__tests__/agentDagRuntimeTestSupport.ts src/features/appShell/GuiHostConnectionBridge.tsx src/features/appRuntime/AppRuntimeContext.tsx src/features/appRuntime/AppRuntimeLayout.tsx src/__tests__/appBrowserTestSupport.ts src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/agentDagRuntime/agentDagRuntime.ts src/features/agentDagRuntime/__tests__/agentDagRuntime.test.ts src/features/agentDagRuntime/__tests__/agentDagRuntimeTestSupport.ts src/features/appShell/GuiHostConnectionBridge.tsx src/features/appRuntime/AppRuntimeContext.tsx src/features/appRuntime/AppRuntimeLayout.tsx src/__tests__/appBrowserTestSupport.ts src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts --check
```

运行 Node unit tests：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/agentDagRuntime/__tests__/agentDagRuntime.test.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts
```

运行三浏览器 owner integration：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx
```

运行 lint 与类型检查：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/agentDagRuntime src/features/appShell/GuiHostConnectionBridge.tsx src/features/appRuntime/AppRuntimeContext.tsx src/features/appRuntime/AppRuntimeLayout.tsx src/__tests__/appBrowserTestSupport.ts src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/agentDagRuntime src/features/appShell/GuiHostConnectionBridge.tsx src/features/appRuntime/AppRuntimeContext.tsx src/features/appRuntime/AppRuntimeLayout.tsx src/__tests__/appBrowserTestSupport.ts src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts --cache
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

上述最终前端验证全部通过后，根据根仓库规则，从 `/Users/jiangsheng/cnb/codex/codex-rs` 执行：

```bash
just fmt
```

`just fmt` 是根仓库要求的格式化步骤，不是后端、原生程序或 CLI build。执行后不重跑任何测试、lint 或 type-check；只回到仓库根目录检查本任务 diff、格式错误与变更范围：

```bash
git diff --check -- codex-gui/src/features/agentDagRuntime codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx codex-gui/src/features/appRuntime/AppRuntimeContext.tsx codex-gui/src/features/appRuntime/AppRuntimeLayout.tsx codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
git diff --stat -- codex-gui/src/features/agentDagRuntime codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx codex-gui/src/features/appRuntime/AppRuntimeContext.tsx codex-gui/src/features/appRuntime/AppRuntimeLayout.tsx codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
git diff --numstat -- codex-gui/src/features/agentDagRuntime codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx codex-gui/src/features/appRuntime/AppRuntimeContext.tsx codex-gui/src/features/appRuntime/AppRuntimeLayout.tsx codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
```

本任务不修改 protocol artifacts 或依赖，因此不运行 protocol generation、依赖安装、production build、E2E 或视觉测试。若实现引入 build-only 风险，视为范围扩大并停止，不擅自追加 build。

## 独立暂存边界与建议提交

只有以上修改、聚焦验证和本任务直接引入的问题全部闭环后，才从仓库根目录只暂存：

```text
codex-gui/src/features/agentDagRuntime/agentDagRuntime.ts
codex-gui/src/features/agentDagRuntime/__tests__/agentDagRuntime.test.ts
codex-gui/src/features/agentDagRuntime/__tests__/agentDagRuntimeTestSupport.ts
codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
codex-gui/src/features/appRuntime/AppRuntimeContext.tsx
codex-gui/src/features/appRuntime/AppRuntimeLayout.tsx
codex-gui/src/__tests__/appBrowserTestSupport.ts
codex-gui/src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx
codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
```

若共享 builder 实际无需修改，不得为了匹配清单制造变更，也不得暂存该文件。不得暂存 `01`–`04`、`06`、research、设计、其他计划、generated artifacts、依赖或无关工作树变更。

暂存后必须检查：

```bash
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

建议提交信息：

```text
feat(gui): add multi-thread agent DAG runtime
```

本计划文件本身由计划文档阶段统一处理，不混入上述产品代码提交。

## 停止条件

出现以下任一情况立即停止并汇报，不通过 fallback、arrival-order、忽略或扩大范围继续：

- `02` 的 production/in-memory source、`03` 的增量 replay frontier 或 `04` 的稳定 replay action 尚不存在，或真实接口无法表达本计划。
- 无跨 subscription watermark 或其他权威证据时，无法同时满足“网络返回顺序无关”和“正常追加不移动历史节点”；必须回到设计，不得退化为到达顺序。
- Root borrowed subscription 无法与 descendant owned subscriptions 共存，必须替换 Root attach 或改写聊天 coordinator 才能继续。
- 需要修改 `guiHostClient` transport/classifier、generated contract、Rust、protocol、文本信封或新增 core/rollout metadata。
- 需要手写 `Thread`/`Turn`/`ThreadItem`/notification DTO、runtime validator、通用 request 或 `unknown` assertion 逃生口。
- 需要把后代 projection 写入 `threadRuntime.current`、transcript state，或把现有 coordinator 改为多 Thread 数组。
- history/live 去重无法由稳定 persistent ID 完成，必须依赖数组下标、时间戳或内存计数器。
- source error 只能通过静默丢弃、自动标记 `caughtUp`、跳过 commit/missing-turn/backpressure 检查来通过测试。
- 需要新增依赖、修改 lockfile、安装工具、运行后端/原生/CLI build，或修改本计划“明确不修改”的文件。
- 实际变更将超过一个可审查提交的边界，或复杂非机械逻辑接近 500 changed lines；此时先拆分并更新计划，等待重新确认。

## 完成条件

- Root 与全部后代的 descendants/history pagination、有限并发、attach lease 和 keyed notification routing 均由测试固定。
- 历史、queued live 和 caught-up live 全部经过 `03` 的同一 frontier 与 `04` 的同一增量 replay/layout action。
- Root 双路 fanout 不污染聊天 coordinator；后代不会覆盖当前聊天 Thread。
- snapshot/history cut 去重、batch 封口、新 live child、source error、retry generation、stale input、frame cancellation 与幂等 dispose 全部通过。
- format、Node unit、三浏览器 owner integration、scoped lint 和 type-check 全部通过。
- 只产生本任务精确文件的一个本地提交；随后才能开始 `06-react-flow-task-surface-and-verification.md`。
