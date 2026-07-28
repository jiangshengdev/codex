# Codex GUI 多代理 DAG 事件模型与因果重放实施计划

日期：2026-07-28
状态：待确认

## 唯一目标

在 `codex-gui/src/features/agentDag/` 建立一个纯前端领域深模块：直接消费由 app-server 权威 experimental contract 生成的结构化 `Thread` / `Turn` / `ThreadItem`，穷尽转换五类 DAG 事件，并通过同一可复用的因果 replay frontier 产生确定性的历史与增量 replay entries、recipient-turn batch merge 和 unresolved diagnostic。

本任务只建立任务 `04`、`05` 可共同消费的事件与重放 seam，不生成坐标或 Redux scene。

## 输入依赖与执行门禁

- `01-app-server-inter-agent-projection.md` 已完成并提交：权威 `ThreadItem::InterAgentMessage` 已包含 `id`、`sourceOrdinal`、`author`、`recipient`、`messageKind`、`diagnostic`。
- `02-gui-experimental-contract-and-dag-source.md` 已完成并提交：GUI 已机械生成 experimental TypeScript contract，且测试可构造合法的 `Thread` / `Turn` / `ThreadItem`。
- 实施前重新读取 `codex-gui/AGENTS.md`，确认生成契约仍是唯一权威来源。
- 若 `01` 或 `02` 的实际字段、文件或完成出口与上述前提不一致，停止并更新计划；不得在 GUI 手写兼容 DTO、解析文本信封或使用类型断言补齐契约。

## 非目标

- 不解析或保存 `Message Type`、`Task name`、`Sender`、`Payload` 文本信封；GUI 只读取生成的结构化 `InterAgentMessage` 字段。
- 不修改 Rust protocol、schema、generated artifacts、GUI host commands 或 `AgentDagSource`。
- 不实现 descendants/history 分页、projection subscription、live FIFO、frame scheduler、retry 或 dispose。
- 不实现 activation、lane、坐标、颜色、结构锚点、edge 路由、Redux slice/selectors 或 React Flow DTO。
- 不修改现有 transcript state、`ProjectionApplicationCoordinator` 或聊天渲染。
- 不引入依赖，不修改 `package.json` 或 lockfile。
- 不建立 sender operation 与 recipient message 的一对一投递边，不使用跨 Thread timestamp 推断顺序。

## 对外 interface 与不变量

任务 `03` 完成后，`agentDag` 领域模块只向后续任务暴露以下稳定概念：

```ts
type AgentDagHistoryThread = Pick<Thread, "id" | "parentThreadId" | "turns">;

type AgentDagReplaySequence = {
  rootThreadId: string;
  agents: readonly AgentDagAgentIdentity[];
  entries: readonly AgentDagReplayEntry[];
};

declare const createAgentDagReplayFrontier: (
  rootThreadId: string,
) => AgentDagReplayFrontier;

declare const advanceAgentDagReplay: (
  frontier: AgentDagReplayFrontier,
  input: AgentDagReplayInput,
) => {
  frontier: AgentDagReplayFrontier;
  entries: readonly AgentDagReplayEntry[];
};

declare const buildAgentDagReplaySequence: (
  histories: readonly AgentDagHistoryThread[],
  rootThreadId: string,
) => AgentDagReplaySequence;
```

- `AgentDagHistoryThread` 必须由 `@codex-protocol/v2` 的生成类型机械派生，不能复制权威字段为消费者自有协议 DTO。
- `AgentDagReplayFrontier` 对调用方是 opaque 状态；其内部拥有 dedup、agent identity index、因果 ready-set、稳定比较器和 recipient-turn batch accumulator。任务 `05` 只能保存 frontier 并提交结构化增量输入，不能重写这些规则。
- `buildAgentDagReplaySequence` 是完整历史便利入口，但 implementation 必须通过同一个 frontier 完成，禁止另建历史专用排序或 merge 路径。
- `AgentDagReplayEntry` 只表达事件、unresolved placeholder 和 batch merge 等布局前语义；不能包含坐标、lane、颜色、React Flow 类型或 Redux state。
- 持久事件 ID 使用 `threadId + turnId + itemId`；merge ID 使用 `merge + recipientThreadId + recipientTurnId`。禁止数组下标、到达序号、timestamp 或画面坐标参与 identity。
- `sourceOrdinal` 只用于单 Thread 内顺序，比较时不得转换为 JavaScript `number`；跨 Thread 最终 tie-break 使用稳定 persistent ID。
- frontier 只有在 recipient `Turn.status !== "inProgress"` 时封口该 turn 的 reply batch，并且最多输出一个 merge entry；未封口 turn 的 reply 继续保留在 batch accumulator。
- 若实现发现缺少跨 subscription watermark，导致 live 输入只能按网络到达顺序决定本应稳定的顺序，必须停止并回到设计/计划确认；禁止用 arrival order、timestamp 或静默 fallback 掩盖缺口。

## 精确文件范围

### 新增

- `codex-gui/src/features/agentDag/agentDagEventModel.ts`
  - 定义 `AgentDagHistoryThread`、agent identity、五类事件、unresolved placeholder、batch merge、replay input/frontier/sequence 等布局前领域类型。
  - 协议相关输入类型只用生成类型的 `Pick`、`Extract` 和 indexed access 派生。
- `codex-gui/src/features/agentDag/agentDagEventProjection.ts`
  - 从完整 Thread 集合建立 `threadId -> canonical agent identity` 索引。
  - 穷尽处理 `subAgentActivity` 与 `interAgentMessage`，忽略其他合法 `ThreadItem`。
  - 生成稳定事件 ID、agent label 候选和 unresolved diagnostic，不读取文本或 payload。
- `codex-gui/src/features/agentDag/agentDagCausalReplay.ts`
  - 实现 opaque frontier、增量 advance 和完整历史便利入口。
  - 拥有因果图、稳定 Kahn ready-set、去重、batch accumulator 与 terminal-turn sealing。
- `codex-gui/src/features/agentDag/__tests__/agentDagEventProjection.test.ts`
  - 固定权威 item 到领域事件/diagnostic/agent identity 的穷尽转换。
- `codex-gui/src/features/agentDag/__tests__/agentDagCausalReplay.test.ts`
  - 通过公开 frontier 与完整历史入口对完整 replay sequence 做 `toStrictEqual`。
- `codex-gui/src/features/agentDag/__tests__/agentDagTestBuilders.ts`
  - 只组合本功能需要的多 Thread 历史与预期领域模型；合法 projection item 继续来自共享 projection builder。

### 修改

- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
  - 增加基于 `Extract<ThreadItem, { type: "interAgentMessage" }>` 的合法 `interAgentMessage` builder。
  - builder 不复制 union arm、不接收 raw 文本信封，也不通过 `as` 构造协议对象。

### 明确不修改

- `codex-gui/src/app/store.ts`
- `codex-gui/src/features/threadRuntime/**`
- `codex-gui/src/features/transcriptState/**`
- `codex-gui/src/features/projectionCoordination/**`
- `codex-gui/src/generated/**`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`

若实际实现需要上述范围之外的产品文件，停止并更新计划；普通格式化不构成增加产品文件范围。

## 测试先行 seam

先写失败测试，再实现对应领域行为。测试只穿过本模块公开 interface，不直接断言 frontier 的内部 map、heap 或 graph 结构。

### 事件转换测试

1. 使用共享 builder 构造 `started`、`interacted`、`interrupted`，断言节点属于 sender，且保留真实 target Thread/path；target activation marker 不重复成为事件。
2. 使用结构化 `interAgentMessage` 构造 `message` 与 `finalAnswer`，断言分别生成 author 轨道 `MESSAGE` / `FINAL_ANSWER`；测试输入不包含文本信封。
3. `newTask` 合法忽略且不生成 diagnostic；`unresolved` 保留稳定 placeholder 和 projection 提供的 diagnostic，但不产生猜测 author/recipient/type/merge 关系。
4. 其他合法 `ThreadItem` 明确忽略；转换 switch 对已消费的生成 union/enum 保持编译期穷尽。
5. 同一子代理的 Thread ID/path 由 parent `started` 建立 identity；Root 固定为 `/root`。重复 path 使用逐级父路径形成最短唯一名称。
6. 同一持久 item 在历史与增量输入中得到同一 event ID；payload、正文和 timestamp 不进入输出模型。

### 因果 replay 测试

1. 每个 Thread 内保持权威 turn/item 顺序；parent `started` 位于 child activation 之前，operation 位于已知 target activation 之前。
2. 对完整 Thread 集合做不同外层排列、不同等价 page 组合和不同 frontier 输入切分，最终 replay sequence 完全相同。
3. 改变跨 Thread timestamp 不改变结果；互不相干的 ready event 使用 persistent ID 稳定 tie-break。
4. 同一 recipient turn 中不同 author、同一 author 多次 reply、`MESSAGE` + `FINAL_ANSWER` 均保留为独立 entry，并只产生一个 batch merge。
5. 回复可以与其他事件按拓扑结果交错；不得为了视觉连续而移动回复。merge 位于该 batch 最后一条已选回复之后。
6. recipient turn 仍为 `inProgress` 时不输出 merge；收到 terminal turn update 后输出唯一 merge，重复 terminal input 不重复输出。
7. unresolved placeholder 不加入 reply batch，不生成 operation/merge edge 语义，并且不会阻断其他事件重放。
8. 完整历史便利入口和逐次 `advanceAgentDagReplay` 对等价输入输出相同 sequence。
9. 重复历史/live item 去重；旧输入晚到不能改变已输出 entry identity。
10. 构造无法满足的因果循环时不得静默丢事件或退回输入顺序；若现有设计没有足够的显式错误出口，触发停止条件而不是自行新增行为。

## 实施步骤

1. 确认 `01`、`02` 的提交和生成 contract 已存在；只读检查 `InterAgentMessage`、`Thread`、`Turn`、`SubAgentActivity` 的实际生成类型及 02 的 fixture/export 名称。
2. 在共享 `projectionTestBuilders.ts` 增加结构化 `interAgentMessage` builder；先创建 `agentDagTestBuilders.ts`，所有合法协议对象从生成类型和共享 builder 构造。
3. 新增两份测试文件，先固定事件转换、稳定 ID、agent identity/最短唯一名称、unresolved 和 `NEW_TASK` 行为，再固定完整历史与增量 frontier 的因果顺序和 batch sealing。
4. 新增 `agentDagEventModel.ts`，只定义任务 `04`、`05` 所需的最小布局前 interface；不提前定义 scene、lane 或 runtime 网络状态。
5. 实现 `agentDagEventProjection.ts`：两遍处理 Thread 集合，先建立 Root/child identity，再把生成 item 穷尽投影为领域事件；不解析文本信封。
6. 实现 `agentDagCausalReplay.ts`：把完整历史和增量输入统一送入 frontier，以每 Thread 顺序、parent/target 因果和稳定 ID 构图，使用稳定 Kahn ready-set 输出 entries。
7. 在同一 replay implementation 中实现 recipient-turn accumulator 与 terminal-turn sealing；重复输入、历史/live 重叠和迟到 terminal update 必须保持幂等。
8. 运行聚焦测试，修正本任务引入的问题；使用项目 formatter 只格式化本任务文件，再运行非 fix 格式检查、lint 和类型检查。
9. 检查工作树与 diff，确认没有生成文件、依赖、Redux、runtime、UI 或 transcript 改动后，才进入独立暂存与提交边界。

## 验证命令

所有前端命令都从 `codex-gui/` 执行，并使用用户的 fnm 环境。执行前先确认：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

若 `pnpm` 解析到 `/Users/<user>/.cache/codex-runtimes/`，或 fnm / pnpm 缺失，停止并请用户自行修复；不得安装运行时或依赖。

测试先行与迭代时运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/agentDag/__tests__/agentDagEventProjection.test.ts src/features/agentDag/__tests__/agentDagCausalReplay.test.ts
```

实现完成后，先使用现有 formatter 对精确文件执行写入，再验证：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/agentDag/ src/features/projection/__tests__/projectionTestBuilders.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/agentDag/__tests__/agentDagEventProjection.test.ts src/features/agentDag/__tests__/agentDagCausalReplay.test.ts
```

全部前端验证通过后，按根仓库规则从 `codex-rs/` 执行：

```bash
just fmt
```

这是根仓库对本仓库任意代码变更要求的最终格式化步骤，不是后端、原生程序或 CLI build。执行后不重跑测试、lint 或类型检查，只继续下面的 diff/range 检查；若 `just fmt` 产生本任务范围外变更，停止并报告，不得把这些变更纳入 03。

最后从仓库根只读检查：

```bash
git diff --check -- codex-gui/src/features/agentDag codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
git status --short
```

本任务不运行 Browser Mode、E2E、React Flow 或 Rust 测试；这些不属于 03 的纯领域 seam。

## 独立暂存与提交边界

只有上述验证全部通过后，才暂存以下文件：

- `codex-gui/src/features/agentDag/agentDagEventModel.ts`
- `codex-gui/src/features/agentDag/agentDagEventProjection.ts`
- `codex-gui/src/features/agentDag/agentDagCausalReplay.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagEventProjection.test.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagCausalReplay.test.ts`
- `codex-gui/src/features/agentDag/__tests__/agentDagTestBuilders.ts`
- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`

暂存后必须检查 `git diff --cached --stat` 与 `git diff --cached`，确认只包含本任务文件且没有协议镜像、文本 parser、布局、Redux、runtime 或 UI 代码。

建议提交信息：

```text
feat(codex-gui): add deterministic agent DAG causal replay
```

该提交创建后才允许开始 `04-agent-dag-incremental-layout-and-redux-scene.md`。

## 停止条件

出现以下任一情况时立即停止，不修改计划外文件、不用 fallback 绕过：

- `01` / `02` 尚未完成，或生成 `InterAgentMessage` 缺少稳定 ID、`sourceOrdinal`、结构化 author/recipient/message kind/diagnostic。
- GUI 需要解析文本信封、读取 payload 或手写 experimental DTO 才能完成事件转换。
- 完整历史与增量输入无法复用同一个 frontier，或任务 `05` 必须重写排序、去重、因果 ready-set、batch accumulator/sealing。
- 缺少跨 subscription watermark 导致只能按网络到达顺序决定稳定 replay 顺序。
- 因果循环、identity 冲突或 malformed structured item 需要新增设计未定义的用户可见错误语义。
- 需要 lane、坐标、颜色、Redux、runtime、React Flow、依赖或计划外产品文件才能让本层测试通过。
- 验证失败来自预存或无关问题；只记录证据并停止，不借本任务扩大修复范围。

## 完成出口

- 公开的完整历史入口与增量 frontier 共用同一事件转换、稳定比较器和 batch accumulator。
- 五类事件、`NEW_TASK` 忽略、unresolved placeholder、稳定 ID、agent identity/最短唯一名称、确定性因果顺序和 terminal-turn batch sealing 均由公开 interface 的完整模型等值测试固定。
- GUI 全程只消费结构化 projection 字段，没有文本信封 parser、payload 或协议镜像。
- 不同 Thread 外层顺序、等价 page 组合和 frontier 输入切分产生相同 replay sequence；未使用跨 Thread timestamp 或网络到达顺序。
- 本任务精确文件通过格式、lint、类型检查和聚焦单元测试。
- staged diff 只包含本任务文件，并创建一个独立本地提交；随后停止本任务，不提前实施 04。
