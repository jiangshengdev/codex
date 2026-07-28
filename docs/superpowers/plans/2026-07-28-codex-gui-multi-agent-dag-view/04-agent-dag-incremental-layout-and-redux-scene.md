# Codex GUI 多代理 DAG 增量布局与 Redux Scene 实施计划

日期：2026-07-28
状态：待确认

## 唯一目标

把任务 `03` 输出的稳定 `AgentDagReplayEntry` 序列，通过一个历史与实时共用的纯增量状态转换写入独立、可序列化、normalized 的 `agentDag` Redux scene；本任务完成 activation、结构锚点、lane、颜色、坐标、节点外观语义和五类 edge，并以测试固定“任何正常追加都不得移动既有节点”。

本任务只建立任务 `05` 可 dispatch、任务 `06` 可读取的稳定 scene seam，不负责取得、分页、缓冲或显示数据。

## 输入依赖与执行门禁

- `03-agent-dag-event-model-and-causal-replay.md` 已完成聚焦验证并形成独立本地提交。
- `03` 已提供稳定的 `AgentDagReplayEntry`、agent identity、五类事件、unresolved placeholder、recipient-turn merge entry 与公开测试 builder；完整历史和增量输入已经由同一 frontier 排成确定顺序。
- 开始实现前重新读取 `codex-gui/AGENTS.md`，并只读核验 `03` 的实际 export、entry 字段、稳定 ID 和测试 builder 名称。
- 若 `03` 的实际输出仍需要本任务重做跨 Thread 排序、去重、batch accumulator 或 terminal-turn sealing，立即停止并更新计划；不得在布局 reducer 内建立第二套 replay 语义。

## 非目标

- 不修改 Rust protocol、generated artifacts、GUI host commands、`AgentDagSource` 或任务 `03` 的事件/因果语义。
- 不实现 descendants/history 分页、projection subscription、notification fanout、history/live 队列、frame scheduler、retry、generation 或 dispose；这些属于任务 `05`。
- 不产生 React Flow `Node` / `Edge` / `Viewport` DTO，不引入 `@xyflow/react`，不实现 viewport、可见区域筛选、hover/click 高亮、工具栏或任务视图；这些属于任务 `06`。
- 不修改现有 `threadRuntime`、`transcriptState`、`ProjectionApplicationCoordinator`、聊天路由或 transcript 渲染。
- 不使用跨 Thread timestamp、网络到达顺序、数组下标或坐标生成 identity。
- 不实现自动布局、节点拖动、Minimap、详情面板或布局持久化。
- 不新增依赖，不修改 `package.json` 或 `pnpm-lock.yaml`。

## Scene 与 Redux 不变量

### 状态所有权

Redux 保存后续追加所必需且可序列化的稳定事实：

- 当前 `rootThreadId`；
- `AgentDagScene` 的 revision、ordered IDs、normalized node/anchor/edge records、bounds 与 `latestEventNodeId`；
- unresolved diagnostics 的 ordered IDs 与 normalized records；
- activation、lane occupancy、agent color、identity continuation 和抽象行游标等增量布局状态；
- 供任务 `05` 更新、任务 `06` 读取的 `AgentDagLoadState`。

Redux 不保存 source handle、Promise、AbortController、scheduler callback、React element、DOM、React Flow instance 或 viewport。所有 action payload 与 state 必须保持 serializable；reducer 不读取时间、随机数、浏览器尺寸或外部全局状态。

### Stable scene interface

`agentDagSceneModel.ts` 公开任务 `05/06` 需要的最小领域 interface：

```ts
type AgentDagScene = {
  revision: number;
  nodeIds: string[];
  nodesById: Record<string, PositionedDagNode>;
  anchorIds: string[];
  anchorsById: Record<string, PositionedDagAnchor>;
  edgeIds: string[];
  edgesById: Record<string, DagEdge>;
  bounds: DagBounds | null;
  latestEventNodeId: string | null;
};

type AgentDagState = {
  rootThreadId: string | null;
  scene: AgentDagScene;
  diagnosticIds: string[];
  diagnosticsById: Record<string, AgentDagDiagnostic>;
  loadState: AgentDagLoadState;
  // module-private serializable incremental layout state
};
```

- `PositionedDagNode` 只公开事件、batch merge 和 unresolved placeholder 的稳定 ID、kind、agent identity、label、event type、position、lane、color token 与 diagnostic ID。
- `PositionedDagAnchor` 是无文本、零事件计数的结构端点，用于 activation 开启/结束、尚无 target 事件时的 operation 端点和 continuation；它不是第六类事件，不更新 `latestEventNodeId`，UI 不显示事件正文。
- `DagEdge.kind` 仅允许 `lifecycle`、`identity`、`operation`、`merge`、`continuation`；edge ID 固定为 `edgeKind + sourceId + targetId`。
- React Flow DTO 不进入上述类型；任务 `06` 只能从 scene 派生第三方 DTO，不能反向修改 scene。
- allocator table 和 occupancy record 可以保存在 slice 内部 state，但不得通过 UI selector 暴露。

### 坐标与历史不可移动

- Root 永远使用 lane `0`；x 只由 `lane * LANE_GAP` 决定，不受标签宽度、viewport 或节点测量影响。
- 最早输出的 replay entry 使用 `y = 0`；后续 entry/结构锚点沿固定抽象行距向更小的 y 追加，因此最新事件位于顶部。
- 每次 `agentDagReplayEntriesApplied` 只 append 新 node/anchor/edge 或更新已确认可变的非几何字段；不得重算、平移、压缩或重写任何既有 `position`、lane、color token、edge endpoints 与 edge kind。
- live 新增重名 agent 时，允许更新既有 node label 为新的最短唯一名称；该更新不得改变 ID、position、lane、颜色、edge 或 bounds 的几何部分。
- 同一完整 replay sequence 采用不同非空 batch 切分，最终 scene 必须完全相同；重复 entry 必须幂等，不增加 revision 或重复实体。

### Activation、lane 与颜色

- `started` 节点位于 sender 当前 activation；同时为 target 建立非事件 activation anchor，target 不重复生成事件节点。
- 新 activation 从直接父 agent 当前 lane 右侧寻找最近空闲 lane；没有空位时只向右扩展。Root 不离开 lane `0`，任意 child lane 必须严格大于其直接父 lane。
- `FINAL_ANSWER` 结束 author activation；`interrupted` 结束 target activation。turn completion、snapshot 结尾和最后观测点不结束 activation。
- activation 结束后 lane 立即可被其他 agent 的新 activation 复用；同一 agent 重新活动时允许换 lane，并从上一次身份节点/anchor到新 activation 建立 `identity` 虚线语义 edge。
- 非活动 author 输出 `MESSAGE` / `FINAL_ANSWER` 时，在该事件行建立推断 activation 起点。
- 同一 agent 的全部 activation 永远使用同一 color token；同时活动的不同 agent 不能同色。普通 activation 结束不强制回收 identity color；只有输入已经证明完整生命周期不重叠时才允许不同 identity 复用 token，否则稳定扩展 palette token index。
- scene 只保存语义 color token，不保存硬编码 light/dark 色值。

### 节点与 edge 语义

- `started`、`interacted`、`interrupted` 使用 sender color 的实心事件圆；`MESSAGE` 使用 author color 的空心圆；`FINAL_ANSWER` 使用 author color 的实心圆。
- batch merge 使用中性空心菱形；unresolved placeholder 保留稳定位置与 diagnostic ID，但不猜 agent、event type 或关联 edge。
- `lifecycle` 连接同一 activation 的连续端点；`identity` 连接同一 agent 的不同 activation；两者不带箭头语义。
- `operation` 从真实 sender 事件连向 target activation 的结构端点，使用 target color token，并携带任务 `06` 所需的小箭头语义。
- 同一 recipient turn 的每条 reply 以 `merge` edge 连到唯一 merge 菱形；merge 再以 `continuation` 回到 recipient lifecycle。不得增加 `task_complete` 节点或 sender-delivery 一对一 edge。

## 精确文件范围

### 新增：scene、增量布局与 Redux module

- `codex-gui/src/features/agentDag/agentDagSceneModel.ts`
  - 定义 scene/node/anchor/edge/bounds/diagnostic/load state、可序列化 allocator state 和 empty-state factory。
  - 只引用任务 `03` 的领域类型；不引用 React Flow、DOM 或协议 transport 类型。
- `codex-gui/src/features/agentDag/agentDagIncrementalLayout.ts`
  - 实现历史/live 共用的纯增量 transition。
  - 按 replay entry 顺序维护抽象行、activation table、lane occupancy、agent color、identity continuation、结构锚点、bounds 和五类 edge。
  - 对外只暴露 slice reducer 所需的 state transition；不暴露 allocator table 给 UI。
- `codex-gui/src/features/agentDag/agentDagSlice.ts`
  - 使用现有 `createAppSlice` 定义 current Root scene owner。
  - 提供 `agentDagSceneOpened`、`agentDagReplayEntriesApplied`、`agentDagLoadStateUpdated`、`agentDagSceneDisposed` 等事件式 action；实际命名可按现有文件惯例微调，但 payload 必须窄、typed、serializable。
  - 所有历史与实时 replay batch 只进入同一个 `agentDagReplayEntriesApplied` reducer。
- `codex-gui/src/features/agentDag/agentDagSelectors.ts`
  - 导出 load state、scene revision、ordered IDs、按 ID 读取 node/anchor/edge、bounds、latest event、diagnostic count/list 等 selector。
  - 返回 store-owned normalized collection 或稳定空值；不得每次读取时全量重建布局、重算 lane 或生成 React Flow DTO。

### 新增：测试

- `codex-gui/src/features/agentDag/__tests__/agentDagIncrementalLayout.test.ts`
  - 通过公开 transition/scene 完整等值断言固定 activation、lane、颜色、坐标、anchor 与 edge 语义。
- `codex-gui/src/features/agentDag/__tests__/agentDagSlice.test.ts`
  - 通过真实 `makeStore` dispatch 公开 action，固定 open/reset、root isolation、load state、batch apply、重复输入和历史节点不可移动。
- `codex-gui/src/features/agentDag/__tests__/agentDagSelectors.test.ts`
  - 固定初始空值、normalized lookup、ordered IDs、diagnostic count、latest event，以及无关 state/action 下 selector 引用稳定。

### 修改：store 接线

- `codex-gui/src/app/store.ts`
  - 把 `agentDagSlice` 加入现有 `combineSlices`；继续由 root reducer 推导 `RootState`，不手写平行 root state 类型。

### 复用但默认不修改

- `codex-gui/src/features/agentDag/agentDagEventModel.ts`
- `codex-gui/src/features/agentDag/agentDagCausalReplay.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagTestBuilders.ts`

若任务 `03` 的 builder 缺少本任务构造预期 scene 所必需的布局前便利函数，可以只在 `agentDagTestBuilders.ts` 增加组合 helper；不得修改 replay entry 语义或创建协议镜像。

### 明确不修改

- `codex-gui/src/features/threadRuntime/**`
- `codex-gui/src/features/transcriptState/**`
- `codex-gui/src/features/projectionCoordination/**`
- `codex-gui/src/features/agentDagSource/**`
- `codex-gui/src/generated/**`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`
- 任意 React component、CSS、route 或 Browser Mode 测试

## 测试先行 seam

先写失败测试，再实现 scene model、layout transition、slice 和 selectors。测试通过公开 replay entry/builder、action 与 selector 观察完整结果，不直接断言临时 heap、Map 或 Immer draft。

### 纯增量布局

1. 空 sequence 生成空 scene、`bounds: null`、`latestEventNodeId: null`；Root identity 只保留 allocator 基线，不伪造事件。
2. Root 事件固定 lane `0`；一层和多层 child activation 始终位于直接父 lane 右侧，同一父同时活动 child 依次占最近空闲 lane。
3. activation 结束立即释放 lane；另一 identity 可复用 lane；原节点 position 不变。同一 identity 后续 reactivation 可换 lane但颜色不变，并只增加一条 identity continuation。
4. `FINAL_ANSWER` 只结束 author activation；`interrupted` 只结束真实 target activation；turn terminal、snapshot 结尾不参与 allocator。
5. 非活动 author 的 `MESSAGE` / `FINAL_ANSWER` 在自身事件行推断 activation 起点。
6. 五类事件、merge、unresolved 的形状、color owner、抽象 y 顺序和 latest-event 语义完整等值；anchor/merge 不进入事件计数，merge 不覆盖 latest event。
7. lifecycle、identity、operation、merge、continuation 的 source/target、kind、color token 与 arrow semantic 完整等值；跨层级/跨分支 operation 直接连接真实 sender/target。
8. unresolved placeholder 保留位置和 diagnostic，且不产生猜测 edge；其他 entry 继续布局。
9. 同一完整 replay sequence 以单 batch、逐 entry 和多种 batch 切分提交，最终 state `toStrictEqual`；重复 entry 不产生实体或 revision 漂移。
10. 保存所有既有 node/anchor 的 position、lane、color 与全部 edge endpoints 快照后追加 live entries，逐项断言旧几何完全相等；这是本任务不可放宽的核心回归测试。
11. live 新增重名 identity 只改变受影响 label；历史 node ID、position、lane、color、edge 和几何 bounds 保持不变。

### Redux slice

1. `makeStore()` 注册空 `agentDag` state，selector 返回稳定空 collection/null/load idle。
2. open Root 创建该 Root 的空 scene；同 Root 重复 open 不重置已生成 scene，切换不同 Root 使用明确 reset 语义，旧 Root action 不能污染新 Root。
3. 历史和实时都 dispatch `agentDagReplayEntriesApplied`；action 不携带 arrival timestamp、React Flow DTO 或 callback。
4. load state 的每个 union arm 可精确写入和读取；slice 不自行启动请求、scheduler 或 retry。
5. dispose 只清理匹配 Root；stale generation/root payload 不改变当前 scene。

### Selectors 与引用稳定

1. ordered IDs 与 normalized by-ID lookup 原样返回 store facts，缺失 ID 返回 `null`。
2. bounds、latest event、diagnostic count/list 和 load state 与完整 scene 一致。
3. 无关 transcript/thread action 不改变 agent DAG selector 引用；只更新 load state 时 node/edge collections 保持引用不变。
4. selector 不根据 viewport 过滤、不构造 React Flow DTO、不扫描 replay frontier 重建 scene。

## 实施步骤

1. 只读确认任务 `03` 的提交、实际 exports、entry union、稳定 IDs 与 `agentDagTestBuilders.ts`；核对 `codex-gui/src/app/store.ts` 仍使用 `combineSlices` 和推导式 `RootState`。
2. 新增三份失败测试，先固定完整 scene、不同 batch 切分等价、历史几何不可移动、Root isolation 和 selector 引用稳定；若测试需要改变 `03` 语义，触发停止条件。
3. 新增 `agentDagSceneModel.ts`，定义 normalized scene、结构锚点、diagnostic/load state 与 empty factory；全部字段可序列化。
4. 新增 `agentDagIncrementalLayout.ts`，先实现抽象行与 append-only node/anchor/edge，再实现 activation/lane occupancy、parent-right invariant、结束/复用与 identity continuation。
5. 在同一 transition 中实现 agent color 稳定性、事件/merge/placeholder 外观语义、operation/merge/continuation edge、bounds 与 latest event；不得添加历史专用 full-layout 入口。
6. 新增 `agentDagSlice.ts`，让唯一 replay-batch action 调用上述 transition，并增加窄的 open/load/dispose action；不使用 thunk、listener middleware或异步 reducer side effect。
7. 新增 `agentDagSelectors.ts`，暴露 domain scene 的稳定、normalized 读取 seam；不在 selector 中物化布局或第三方 DTO。
8. 修改 `src/app/store.ts`，仅把新 slice 加入 `combineSlices`；运行聚焦测试证明现有 store action 与新 scene 隔离。
9. 使用项目 formatter 只格式化本任务精确文件，随后运行非 fix 格式检查、lint、类型检查和聚焦 unit tests；只闭环本任务直接引入且仍在本文件/语义范围内的问题。
10. 检查工作树、unstaged diff 和 staged 候选，确认没有任务 `05/06`、generated、依赖、transcript、runtime 或 UI 变更，再进入本任务独立提交边界。

## 验证命令

所有前端命令从 `codex-gui/` 执行，并使用用户的 fnm runtime。执行前只读确认：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

若 fnm / pnpm 缺失，或 pnpm 解析到 `/Users/<user>/.cache/codex-runtimes/`，停止并请用户自行修复；不得安装运行时、依赖或浏览器二进制。

测试先行与迭代时运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/agentDag/__tests__/agentDagIncrementalLayout.test.ts src/features/agentDag/__tests__/agentDagSlice.test.ts src/features/agentDag/__tests__/agentDagSelectors.test.ts
```

实现完成后，先用现有 formatter 只写入本任务文件，再执行只读验证：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/agentDag/agentDagSceneModel.ts src/features/agentDag/agentDagIncrementalLayout.ts src/features/agentDag/agentDagSlice.ts src/features/agentDag/agentDagSelectors.ts src/features/agentDag/__tests__/agentDagIncrementalLayout.test.ts src/features/agentDag/__tests__/agentDagSlice.test.ts src/features/agentDag/__tests__/agentDagSelectors.test.ts src/app/store.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/agentDag/__tests__/agentDagIncrementalLayout.test.ts src/features/agentDag/__tests__/agentDagSlice.test.ts src/features/agentDag/__tests__/agentDagSelectors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
```

若实际修改了 `agentDagTestBuilders.ts`，把它加入精确 formatter 参数与 diff 检查。上述前端验证全部通过且不再修改产品内容后，根据根仓库 `AGENTS.md` 对仓库内任何代码变更的要求，从 `codex-rs/` 执行一次：

```bash
just fmt
```

`just fmt` 是根仓库要求的最终 Rust 格式化步骤，不是后端 build，也不得替换、跳过或弱化前端验证。执行后不再重跑测试、lint、类型检查或其他生成/格式化命令；只从仓库根检查 diff 与文件范围：

```bash
git diff --check -- codex-gui/src/features/agentDag codex-gui/src/app/store.ts
git diff --stat
git diff -- codex-gui/src/features/agentDag codex-gui/src/app/store.ts
git status --short
```

若 `just fmt` 产生本任务范围外的文件变化，停止并只读核对这些变化，不把无关文件纳入本任务暂存。本任务不运行 Browser Mode、E2E、Vite build、React Flow 测试、Rust 测试或任何后端 build；没有 UI、协议生成或后端修改。

## 独立暂存边界与建议提交

只有上述验证全部通过且本任务引入的问题已闭环后，才独立暂存：

- `codex-gui/src/features/agentDag/agentDagSceneModel.ts`
- `codex-gui/src/features/agentDag/agentDagIncrementalLayout.ts`
- `codex-gui/src/features/agentDag/agentDagSlice.ts`
- `codex-gui/src/features/agentDag/agentDagSelectors.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagIncrementalLayout.test.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagSlice.test.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagSelectors.test.ts`
- `codex-gui/src/app/store.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagTestBuilders.ts`，仅当本任务确实增加了布局测试组合 helper；

不得暂存任务 `01`–`03` 的产品改动、任务 `05/06` 文件、generated artifacts、依赖/lockfile、transcript/runtime/UI 文件或无关工作区变更。

暂存后必须运行并检查：

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached -- codex-gui/src/features/agentDag codex-gui/src/app/store.ts
```

建议提交信息：

```text
feat(codex-gui): add incremental agent DAG scene
```

该提交创建成功后才能开始任务 `05-agent-dag-runtime-and-multi-thread-ingestion.md`。

## 停止条件

出现以下任一情况立即停止当前任务并回到计划确认，不修改计划外文件、不用 fallback 掩盖：

- 任务 `03` 尚未完成，或其 replay entry 缺少稳定 identity、target、merge、diagnostic 或 activation 所需语义。
- 必须在本 reducer 内重做 protocol conversion、文本信封解析、跨 Thread topological sort、去重、batch accumulation/sealing 或按网络到达顺序排序。
- 结构锚点无法在不新增用户可见事件或改变已确认 scene/edge 语义的情况下表达。
- 正常 live append、lane/颜色复用或新增重名 agent 会迫使既有节点改变 position/lane/color、既有 edge 改端点，或需要全量重排。
- parent-right invariant、同 agent 跨 activation 同色、同时活动不同 agent 不同色或不同 batch 切分等价无法同时满足。
- 需要 React Flow/DOM 测量、viewport、随机数、timestamp、非序列化 Redux 值、async reducer side effect 或新增依赖才能完成布局。
- 任务 `05` 需要越过公开 replay-batch/load-state action 直接操作 allocator 内部状态，或任务 `06` 需要把 React Flow DTO 写回 Redux。
- 修改范围需要越过本计划精确文件，或需要改变外部接口、projection 数据语义、安全语义、现有 transcript/runtime 行为。
- 必要工具缺失；只报告用户应自行安装/修复的组件和建议命令，不代为安装。
- 验证发现预存或与本任务无关的问题；只记录并汇报，不借本任务修复。

## 完成出口

- `agentDag` 以独立 slice 注册到现有 store，`RootState` 继续从 `combineSlices` 推导；未触碰 transcript 与单 Thread runtime owner。
- 完整历史与实时追加只通过同一个 replay-batch reducer/transition，所有 state/action 可序列化且无副作用。
- normalized scene 完整表达五类事件、unresolved placeholder、无文本 batch merge、结构锚点、五类 edge、bounds、diagnostics 与 latest event；不含 React Flow DTO。
- Root/直接父子右侧、activation 结束与 lane 复用、推断 activation、同 identity 跨 activation 同色/续接、同时活动 identity 颜色隔离全部由完整 scene 等值测试固定。
- 相同 replay sequence 的不同 batch 切分得到完全相同 scene；重复输入幂等。
- 正常 live append 不移动或重着色任何历史节点，不改变既有 edge endpoint；新增重名 agent 最多更新 label。
- 聚焦 unit tests、全量 unit tests、format check、lint、type-check 与 diff check 全部通过。
- staged diff 只包含本任务文件并创建一个独立本地提交；提交后立即停止本任务，不提前实施 `05/06`。
