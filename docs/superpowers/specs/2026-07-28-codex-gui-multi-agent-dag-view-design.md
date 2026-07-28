# Codex GUI 多代理持久化 DAG 视图设计

日期：2026-07-28
状态：待确认

## 唯一主目标

基于已确认的多代理 DAG 选择，扩展 app-server Thread projection，把既有 inter-agent 原始事件规范化为结构化投影，并在 `codex-gui` 中建立任务内可切换的、纵向 Git-like 多代理持久化 DAG 视图；本设计不新增或修改 core / rollout 原始事件及其 metadata，不修改文本信封。

## 决策依据

本设计只落实以下既有选择记录，不重新解释或替换这些选择：

- `docs/superpowers/research/2026-07-27-chat-persistence-agent-dag-reconstruction/decision-log.md`
- `docs/superpowers/research/2026-07-27-chat-persistence-agent-dag-reconstruction/current-findings.md`

其中最重要的约束是：

- 只显示 `started`、`interacted`、`interrupted`、`MESSAGE`、`FINAL_ANSWER` 五类事件；
- Root 固定最左，全部后代只向直接父代理右侧分叉；
- 抽象时间从下向上，最新事件位于顶部；
- 同一 recipient turn 的回复组成一次多父 batch merge；
- activation 结束后可复用位置，同一代理跨 activation 保持身份连续；
- 历史和实时使用同一增量布局器，既有节点不移动；
- 完整展开全部事件，只在渲染层做视口虚拟化；
- DAG 是任务内与聊天切换的独立视图；
- 只新增 `@xyflow/react`，不引入自动布局、D3 或额外虚拟化库。

## 当前事实与缺口

### 原始记录已经存在

现有 rollout 已持久化构建 author 侧事件所需的原始记录：

- 现代记录使用相邻的 `InterAgentCommunicationMetadata` 与 `ResponseItem::AgentMessage`；
- 旧记录可直接包含 `InterAgentCommunication`；
- 原始 `ResponseItem::AgentMessage` 保留稳定 item ID、author、recipient、文本或加密内容，以及接收侧 turn passthrough；
- `MESSAGE`、`NEW_TASK`、`FINAL_ANSWER` 的模型可见文本信封已经由 core 构造。

因此本设计不要求 core 新增事件，也不要求修改通信信封。这里的兼容边界只约束原始记录；Thread projection 是本功能可以扩展的派生层，不以当前已有的 `ThreadItem` 形状为前提。

### Thread projection 尚未物化 inter-agent message

当前 Thread history projector 会处理 turn、普通 assistant message 和 `SubAgentActivity`，但尚未把上述 inter-agent 原始记录物化成 `ThreadItem`。这使 GUI 当前只能取得 sender 侧的三类 `SubAgentActivity`，不能从 Thread projection 取得 author 侧 `MESSAGE` / `FINAL_ANSWER`。

这是待补齐的 projection 能力，不是原始记录丢失。

### GUI 目前只有单 Thread projection

当前 GUI：

- 握手只 attach 启动 Thread；
- `GuiHostCommands` 只暴露 `turn/start` 与 `turn/interrupt`；
- `ProjectionApplicationCoordinator`、`threadRuntime.current` 和 transcript state 都只拥有一个当前 Thread；
- 初始化未声明 `capabilities.experimentalApi`；
- 默认生成协议 artifacts 不包含 `ancestorThreadId` 或 `thread/turns/list`。

多代理 DAG 不能通过扩张现有 transcript state 实现，需要独立的多 Thread ingestion 与 DAG module。

## 目标

- 从同一 Root Thread 的全部后代 projection 构建完整多级代理 DAG。
- 让历史全量加载、实时事件、重新 attach 和结构化 projection item 都汇入同一个确定性事件重放流程。
- 让调用方只消费稳定的前端 DAG scene，不理解协议分页、订阅 lease、文本信封、拓扑排序或轨道分配。
- 在不重排历史节点的前提下支持 activation、轨道复用、batch merge、跨分支操作和身份续接。
- 通过 React Flow 提供视口、平移、缩放、可见区域渲染和自定义 node/edge；布局语义仍由项目拥有。
- 保持当前聊天 projection、transcript chunk 和连接生命周期边界不变。
- 让异常数据可见且可定位，不静默丢事件、不猜测 target。

## 非目标

- 不新增 core 原始事件。
- 不修改 `Message Type`、`Task name`、`Sender`、`Payload` 文本信封。
- 不给 core / rollout 原始 inter-agent event 新增 author、recipient、message type 等 metadata；允许 Thread projection 输出从既有原始记录确定性派生的结构化字段。
- 不把 `send_message` 与 `followup_task` 拆成两个可视化事件。
- 不显示 `NEW_TASK`、mailbox、pending、close、resume、task complete 或真实时间轴。
- 不声称存在跨 Thread 的真实全局 ordinal。
- 不新增详情面板、代理搜索、节点导航、Minimap、手工拖拽或布局持久化。
- 不建立 sender 操作与 recipient message 的一对一投递边。
- 不新增独立 DAG 路由或可分享 URL；刷新后仍默认进入聊天视图。
- 不使用 Web Worker、ELK、Dagre、D3、Canvas 或 WebGL。
- 不修改现有聊天内容的分块渲染策略。

## 总体模块关系

```text
既有 rollout 原始记录
  -> app-server Thread history projection
  -> generated experimental app-server contract
  -> AgentDagSource adapter
  -> AgentDagRuntime（分页、订阅、历史/实时协调）
  -> agentDag Redux module（事件重放 + 增量布局 + scene）
  -> React Flow adapter
  -> AgentDagView
```

模块职责遵循三个 seam：

1. **projection seam**：负责把既有原始记录规范化为生成协议能够表达的结构化 Thread item；它可以扩展投影字段，但不能反向要求 core / rollout 增加原始事件或 metadata。
2. **ingestion seam**：只负责发现后代、读取分页历史、管理每个 Thread 的 projection subscription，并按确定顺序提交输入。
3. **scene seam**：只负责把输入重放成稳定的前端 DAG scene；React 不参与排序和布局。

## Projection 设计

### 新增 experimental `ThreadItem::InterAgentMessage`

为避免把 inter-agent context message 伪装成普通模型 assistant output，也避免现有 transcript 自动显示通信信封，app-server v2 Thread projection 增加一个 experimental item variant：

```ts
type InterAgentMessageThreadItem = {
  type: "interAgentMessage";
  id: string;
  sourceOrdinal: string;
  author: string;
  recipient: string;
  messageKind: "message" | "finalAnswer" | "newTask" | "unresolved";
  diagnostic: string | null;
};
```

该 variant 只规范化既有 raw item，不要求新增任何 raw 字段：

- `id` 优先来自原始 `ResponseItem::AgentMessage.id`；原始 ID 缺失时，由 durable rollout 的 Thread ID 与记录 ordinal 生成稳定 projection ID；
- `sourceOrdinal` 是 durable rollout 中既有记录顺序的十进制字符串，只表达单 Thread 内顺序并避免 `u64` 进入 JavaScript 后失真；优先使用持久化 ordinal，旧记录缺失 ordinal 时使用 canonical replay record position；
- `author`、`recipient` 直接来自现代 `ResponseItem::AgentMessage` 或旧版 `InterAgentCommunication`；
- `messageKind` 由相邻 `InterAgentCommunicationMetadata.trigger_turn`、旧版 `trigger_turn` 和既有文本信封确定性归一化；
- `diagnostic` 只在既有记录无法确定 `messageKind` 时给出投影错误；正常 item 为 `null`；
- 接收侧 `turnId` 由外层 `Turn` 表达，不重复写入 item；
- payload 与加密内容均不进入 projection；projection 只读取识别 `messageKind` 所需的既有信封头，不下发正文，也不解密内容。

这个 variant 是 projection 类型，不是新的 core 事件或 metadata。它把原始记录已有的信息规范化后交给 GUI，并让 transcript materializer 对该 variant 做显式“非聊天展示项”处理；GUI 不理解文本信封。

### 历史投影

Thread history projector 同时处理两种已有落盘形状：

- 现代形状：`InterAgentCommunicationMetadata` 后的 `ResponseItem::AgentMessage`；
- 兼容形状：`RolloutItem::InterAgentCommunication`。

物化必须满足：

- 使用原始 item ID；缺失 ID 时按 durable Thread ID 与 rollout record ordinal 生成 projection ID，不使用只在单次 builder 内有效的 `item-N`；
- 优先使用原始 passthrough 中的接收侧 turn ID；
- 同一 raw delivery 只物化一次，不能因 metadata 与 response item 成对出现而重复；
- rollback、compaction、subagent history 起始 ordinal 与现有 Thread history 规则保持一致；
- item 顺序继续由 rollout ordinal / 现有 materialized history 顺序拥有。

### 实时投影

实时 projection 不能另造第二套语义。app-server 只从已经写入 durable rollout、能够提供稳定 record ordinal 的 history change 生成 `InterAgentMessage`，再通过目标 Thread 的 projection subscription 发出 item change；不直接用缺少 durable ordinal 的 raw response-item notification 生成另一份 identity。

同一转换函数必须同时服务：

- `thread/turns/list` 历史分页；
- `thread/projection/attach` snapshot；
- attach 后的实时 item notification。

这样历史与实时不会分别解析 raw item，也不会在刷新前后生成不同 item ID 或文本。

### Generated contract

`InterAgentMessage`、`ancestorThreadId` 和 `thread/turns/list` 都通过 app-server-protocol 的 Rust 权威类型与 schema generator 产生 TypeScript 和 JSON Schema。GUI 禁止：

- 手写 `ThreadItem` union arm；
- 用交叉类型或 declaration merge 补 `ancestorThreadId`；
- 用 `unknown` / assertion 绕过 experimental request 类型；
- 手写 response validator。

稳定 schema profile 与 GUI 使用的 experimental profile 保持分离。GUI 的协议生成流程选择 experimental profile，并继续生成 request descriptor、runtime validator 和 declaration；`protocol:check-validators` 必须同时检查 source profile 与生成结果一致。启用 experimental profile 后，GUI initialize 明确发送：

```ts
capabilities: {
  experimentalApi: true;
  requestAttestation: false;
}
```

其他 capability 保持当前值，不借此启用无关功能。

## AgentDagSource adapter

`AgentDagSource` 是 app-server 与 DAG runtime 之间唯一的可替换 port。production adapter 使用生成的 GUI host commands，测试使用内存 adapter。

外部 interface 保持窄：

```ts
type AgentDagSource = {
  listDescendants(rootThreadId: string): AsyncIterable<Thread[]>;
  listTurns(threadId: string): AsyncIterable<Turn[]>;
  attach(threadId: string): Promise<ThreadProjectionAttachResponse>;
  detach(threadId: string): Promise<void>;
};
```

implementation 隐藏：

- `thread/list` cursor 与 `ancestorThreadId`；
- `thread/turns/list` cursor、`sortDirection: "asc"`、`itemsView: "full"`；
- request descriptor 与 response validator；
- transport readiness 和 invalidation；
- attach / detach RPC 的具体 payload。

`GuiHostCommands` 只增加上述明确命令，不暴露通用 `request(method, unknown)` 逃生口。

## AgentDagRuntime 深模块

### Interface

React 调用方只学习：

```ts
type AgentDagRuntimeValue = {
  open(rootThreadId: string): void;
  retry(rootThreadId: string): void;
};
```

关闭 DAG panel 不销毁当前任务的 runtime。切回聊天后，历史 scene、projection subscriptions 和实时队列继续存在；任务或连接销毁时统一 detach / dispose。

### 内部状态

runtime 只持有非序列化的协调状态：

- source handle；
- per-thread cursor 与 `ProjectionIngressAdapter`；
- `threadId -> subscriptionId` lease；
- AbortController / generation；
- frame scheduler handle；
- 尚未提交给 Redux 的历史 page 与实时 FIFO。

这些对象不进入 Redux。

### 打开流程

打开某个 Root 时：

1. 建立新的 load generation，取消旧 generation 的未完成请求。
2. 通过 `thread/list({ ancestorThreadId })` 读取全部页面；Root 自身加入 Thread 集合。
3. 使用 `Thread.parentThreadId` 建直接父子关系；拒绝用 `forkedFromId` 猜代理谱系。
4. 对 Root 和全部后代并发读取 `thread/turns/list(itemsView=full, sortDirection=asc)`，但限制并发数，避免一次发出无界请求。
5. 历史分页期间收到的 root 或 descendant projection notification 只进入 keyed FIFO。
6. 全部历史取齐后，建立确定性全局因果顺序，再按浏览器帧分批 dispatch 给同一个 replay reducer。
7. 历史 replay 清空后，按 FIFO 接收顺序提交排队的实时输入，状态切换为 `caughtUp`。
8. 新发现的 live child 由父 Thread 的 `started` 事件提供 thread ID；先 attach / 补齐该 Thread 历史，再继续实时追加。

先取齐历史再生成全局顺序是必要约束。若按网络 page 返回顺序立即布局，较晚返回的 Thread 可能包含因果上更早的事件，从而迫使既有节点移动。

### 多 projection 路由

GUI host 连接仍只有一个，但允许多个 Thread projection subscription。所有 projection notifications 先按 `threadId + subscriptionId` 路由：

- 启动 Root 的既有 subscription 继续进入当前聊天 coordinator，同时广播给 DAG runtime；
- DAG runtime 自己 attach 的后代 subscription 只进入对应 keyed ingress；
- foreign、stale 或已 detach subscription 被忽略；
- backpressure、commit mismatch 或 missing turn 使对应 Thread 进入 source error，不能伪装成已追平。

现有单 Thread `ProjectionApplicationCoordinator` 不改成数组，也不让后代状态覆盖 `threadRuntime.current`。

## `agentDag` Redux module

### 为什么布局结果属于 state

普通派生数据应由 selector 计算，但本 DAG 的节点位置由“事件到达时的既有 lane / activation 分配状态”决定，并承诺后续追加不移动历史节点。因此位置不是可随时全量重算的展示派生值，而是增量 scene 的稳定结果，应该与 replay frontier 一起保存在 serializable Redux state 中。

React Flow 的 `Node` / `Edge` DTO 不进入 Redux。Redux 保存前端领域语义，selector 再适配 React Flow。

### 稳定 scene interface

```ts
type AgentDagScene = {
  revision: number;
  nodeIds: string[];
  nodesById: Record<string, PositionedDagNode>;
  edgeIds: string[];
  edgesById: Record<string, DagEdge>;
  bounds: DagBounds | null;
  latestEventNodeId: string | null;
};

type AgentDagLoadState =
  | { phase: "idle" }
  | { phase: "discovering"; discoveredThreads: number }
  | { phase: "loadingHistory"; loadedThreads: number; totalThreads: number }
  | { phase: "replaying"; appliedEvents: number; totalEvents: number; queuedLive: number }
  | { phase: "caughtUp" }
  | { phase: "sourceError"; source: "descendants" | "history" | "subscription"; message: string };

type AgentDagDiagnostic = {
  id: string;
  eventNodeId: string;
  kind: "projectionItemUnresolved";
  reason: string;
};
```

`PositionedDagNode` 只表达：

- 五类事件节点；
- 无文本 batch merge 菱形；
- 无法解析但必须保留的 diagnostic placeholder；
- 稳定 node ID、agent identity、event type、position、color token 和 diagnostic ID。

`DagEdge` 只表达：

- `lifecycle`：同一 activation 的连续轨道；
- `identity`：同一代理跨 activation 的同色虚线；
- `operation`：真实 sender 到 target；
- `merge`：reply 到 batch merge；
- `continuation`：batch merge 回到 recipient 生命周期。

lane allocator、activation table、batch accumulator、topological frontier 和 pending queue 都是 module implementation，不暴露给 UI。

### 稳定 ID

- 持久事件：`threadId + turnId + itemId`；
- batch merge：`merge + recipientThreadId + recipientTurnId`；
- diagnostic placeholder：沿用原 inter-agent item 的稳定事件 ID；
- edge：`edgeKind + sourceNodeId + targetNodeId`。

禁止使用数组下标、React key 生成器或画面坐标作为 identity。

## 事件转换

### Sender 轨道

从生成的 `ThreadItem::SubAgentActivity` 穷尽转换：

- `started`：节点位于 sender 当前 activation；对 target 开启 activation，但 target activation marker 不重复计为事件节点；
- `interacted`：节点位于 sender，operation edge 指向 target；
- `interrupted`：节点位于 sender，operation edge 指向 target，并结束 target 当前 activation。

节点使用 sender 颜色，operation edge 使用 target 颜色。

### Author 轨道

GUI 从生成的 `ThreadItem::InterAgentMessage` 穷尽转换，不解析文本信封：

- `message` 与 `finalAnswer` 生成 author 轨道事件；
- `newTask` 是合法但未入选的事件，明确忽略，不产生 diagnostic；
- author / recipient 使用 projection 提供的 canonical agent path；
- `FINAL_ANSWER` 结束 author 当前 activation，但不关闭 Thread；
- 非活动 author 产生 `MESSAGE` / `FINAL_ANSWER` 时，在该节点建立推断 activation 起点。

`messageKind: "unresolved"` 时：

- 保留稳定 placeholder node；
- 使用 projection 给出的非 payload diagnostic；
- 不猜 author、recipient、message type 或 operation / merge edge；
- 继续重放其他事件。

### 最短唯一名称

scene 根据已发现 agent path 集合计算右侧标签：

- 默认使用 path 最后一段；
- 冲突时逐级补充父路径，直到唯一；
- Root 显示 `root`；
- live 新增重名代理时允许更新既有 label，但不改变节点 ID、位置、颜色或边。

节点正文严格为“最短唯一代理名 · 事件类型”。

## 因果排序与 batch merge

### 因果约束

全局顺序只使用：

- 每个 Thread 内 turn / item 顺序；
- parent `started` 先于 child activation；
- sender operation 先于其已知 target activation 标记；
- 同一 recipient turn 的 reply batch 边界；
- replay 输入的稳定 persistent IDs 作为最终 tie-break。

不使用跨 Thread timestamp 推断真实并发先后。

Kahn topological sort 的 ready set 使用稳定比较器，因此：

- 网络 page 返回顺序不影响结果；
- 相同完整输入始终产生相同抽象顺序；
- 不声称 tie-break 是真实发生顺序。

### Batch merge

按 `recipientThreadId + recipientTurnId` 分组全部已解析 `MESSAGE` / `FINAL_ANSWER`：

- 同一 turn 中不同 author、同一 author 多次回复以及两种 message type 都属于同一 batch；
- 每条回复仍是独立事件行；
- 事件保留最终拓扑排序形成的交错，不强制搬成连续块；
- merge 菱形放在该组最后一条入选回复之后；
- 每条回复连向同一 merge 菱形；
- merge 菱形无文本、使用中性空心样式；
- 不创建 `task_complete` 节点，也不建立一对一 sender delivery edge。

## 增量布局

### 坐标系

- 抽象行高固定，不使用真实时间比例；
- 最早事件从 `y = 0` 开始；
- 每个后续事件使用更小的 y 值，因此最新事件自然位于顶部；
- live append 继续向负 y 扩展，不需要移动既有节点；
- x 只由 lane index 决定，Root 永远位于 lane 0。

### Lane 分配

- 新 activation 使用其直接父代理当前 lane 右侧最近的空闲 lane；
- 没有空位时向右扩展；
- activation 结束后 lane 立即可复用；
- 同一代理后续 activation 可以换 lane；
- 跨 activation 使用同色虚线连接最后与最新身份节点；
- 子子代理遵循相同规则，不保留固定深度列；
- 跨层级 / 跨分支 operation edge 直接连接真实 sender 与 target，不经过左侧谱系树。

### Activation 结束

- `FINAL_ANSWER` 结束 author 当前 activation；
- `interrupted` 结束 target 当前 activation；
- turn completion、最后观测点和 snapshot 结尾不构成关闭；
- Thread 以后再次活动时开启新 activation。

### 颜色

- 同一 agent identity 在全部 activation 中保持同一 color token；
- 同时活动的不同 identity 不使用同一 token；
- live task 中未知未来是否重新激活，因此 color token 不因普通 activation 结束就强制回收；
- 只有能证明两个完整生命周期不重叠时才允许跨 identity 复用颜色；无法证明时优先保持身份颜色稳定；
- palette 由项目 CSS variables 提供 light / dark 对应值，不使用硬编码白色或新增颜色库。

这里把“可复用”视为允许条件而不是必须回收，避免未来 reactivation 造成两个同时活动 identity 被迫同色或历史节点重着色。

## React Flow 渲染 adapter

### 依赖边界

只新增 production dependency：

```text
@xyflow/react
```

React Flow 负责：

- viewport transform；
- pan / zoom；
- visible element rendering；
- 自定义 node / edge host；
- imperative viewport commands。

项目负责：

- DAG node / edge 领域类型；
- event ordering；
- lane / color / position；
- edge routing semantics；
- load、diagnostic、highlight 和 session 状态。

Redux selector 把 `AgentDagScene` 转换成 React Flow controlled `nodes` / `edges`。React Flow DTO 不反向成为 source of truth。

### 固定 React Flow 行为

- `onlyRenderVisibleElements` 开启；
- nodes 不可拖动、不可连接、不可删除；
- 不显示 background grid；
- 不显示 Minimap；
- 普通滚轮纵向平移；
- `Ctrl/Cmd + wheel` 缩放；
- 背景拖动允许平移；
- 生命周期 / identity edge 不带箭头；
- operation edge 使用 target 颜色和小箭头；
- branch / merge 使用自定义平滑 SVG curve，不使用自动布局器。

### Node 与 edge

每个事件和 merge point 都是独立 React Flow node。禁止把整个 turn 或 activation 塞入一个包含多行事件的复合 node。

自定义 edge 只读取 scene 已给出的端点、kind 和颜色，不自行判断父子关系或重算路径语义。曲线控制点由相邻 lane 和抽象行距确定，形成 Git 客户端式的分叉 / 汇合，而不是直角流程图。

## 任务内视图与会话状态

### 视图切换

聊天与 DAG 继续共用 `/` route。`AppShell` 的 task content seam 改为两个 panel：

- Chat panel：现有 transcript、bottom sentinel 和 Composer；
- DAG panel：全宽 DAG canvas、状态条和工具栏。

使用 HeroUI v3 `Tabs` secondary variant 表达“聊天 / DAG”两个同级 task surface。切换 DAG 时 Composer 不显示；连接、projection coordinator 和正在运行的 turn 不卸载。

不新增 URL search 或 route state。页面刷新默认回到聊天。

### Session owner

新增持久的 `TaskSurfaceSession`，与现有 `ChatUiSessionProvider` 同级，位于 `AppRuntimeLayout` 的 `<Outlet />` 外。它只保存：

- 当前 task surface mode；
- `rootThreadId -> ReactFlowViewport`；
- 当前 locked highlight node ID。

它不保存 DAG scene、projection items、React element、DOM 或 subscription handle。

首次打开某 Root 的 DAG：

- 使用常规缩放定位 `latestEventNodeId`；
- 不执行全图 fit。

同一应用会话内切回 DAG：

- 恢复该 Root 最后 viewport；
- scene 已在后台继续接受实时事件；
- 不自动跳回最新事件。

## HeroUI 与交互

### 组件

- `Tabs` secondary：聊天 / DAG surface 切换；
- `Button` ghost + `isIconOnly`：放大、缩小、适应视口、回到最新事件；
- `Tooltip`：工具栏 accessible label 与 projection diagnostic 原因；
- `ProgressBar`：历史加载 / replay 进度；
- `Alert` warning：顶部 unresolved projection item 数量；
- `Alert` danger：source error 与 retry；
- 现有 Lucide icons：工具栏与 warning glyph。

不使用 React Flow 默认 Controls，以保持 HeroUI 的 focus、variant 和主题语义。

### 高亮

- hover：临时高亮当前节点、直接相邻节点和直接相邻 edge；
- pointer leave：恢复默认；
- click：锁定同一高亮集合；
- `Esc` 或点击空白：取消锁定；
- 非关联元素只降低视觉强调，不隐藏、不卸载、不重新布局；
- historical replay 期间暂停 hover / click highlight，pan / zoom 保持可用；
- caught up 后自动恢复 highlight 能力。

### Loading

- descendants 尚未枚举完成：indeterminate progress；
- Thread 集合确定后：按 `loadedThreads / totalThreads` 显示 history progress；
- replay 阶段：按 `appliedEvents / totalEvents` 显示 determinate progress；
- replay 每帧只处理有界批次，批次大小属于 runtime implementation；
- replay 已生成部分立即可浏览；
- live events 在 replay 完成前只增加 `queuedLive`，不插入 scene。

## 错误与恢复

### 可恢复数据 diagnostic

projection 无法完整归一化某条既有原始事件时，不使整图失败：

- placeholder node 保留原始位置；
- node 显示 warning icon；
- 顶部 warning Alert 显示数量；
- hover Tooltip 显示 projection diagnostic reason；
- 不把原始 payload 放进 Tooltip；
- 不生成猜测边。

### Source error

以下错误进入 `sourceError`：

- descendants 分页失败；
- 某 Thread history 分页失败；
- projection attach / backpressure / commit chain / missing turn 失败；
- experimental contract response validator 失败。

错误状态保留已经生成的 scene，但明确标记“不完整”，不能显示为 caught up。Retry：

- 启动新的 generation；
- detach 旧 descendant subscriptions；
- 清空旧 scene 后从权威历史完整重建；
- 不把部分旧 scene 与新 generation 混合。

完整 retry 是允许重建坐标的显式恢复边界；正常历史 replay 与 live append 仍绝不移动既有节点。

### Dispose

任务或连接销毁时，runtime：

1. 标记 generation disposed；
2. 中止 history / descendants 请求；
3. 丢弃尚未提交的 batch 与 live FIFO；
4. 取消 pending frame；
5. detach descendant projections；
6. 忽略迟到 response / notification。

dispose 必须幂等。

## 性能边界

- 历史网络读取使用 pagination，不请求一个无界的全 session payload。
- Thread history 读取使用有限并发。
- 全局排序在完整历史取齐后执行一次；layout 通过 reducer 分帧增量应用。
- Redux 保存 normalized scene 和 revision；selector 对未变化 node / edge 保持引用稳定。
- React Flow 只渲染可见 elements；右侧标签属于 node 本身，不建立第二套虚拟列表和滚动坐标。
- replay 时关闭关系高亮，避免每批重新计算邻接强调。
- 不使用动画 edge、layout transition 或 background effects。
- transcript state 不复制到 DAG；DAG 直接消费生成协议输入。
- payload 文本不进入 DAG Redux state，避免把大量回复正文复制一遍。

## 测试设计

### app-server protocol / projection

使用现有 raw rollout 类型构造测试，覆盖：

- modern metadata + `ResponseItem::AgentMessage` 只投影一个 item；
- legacy `InterAgentCommunication` 投影为等价结构化 item；
- `MESSAGE`、`NEW_TASK`、`FINAL_ANSWER` 被规范化为对应 `messageKind`；
- author / recipient 由既有 raw 字段结构化投影，payload、encrypted content 和 plaintext 正文均不泄露；
- receive turn ID、projection item ID、`sourceOrdinal` 和 rollout 顺序稳定；
- rollback / compaction / subagent history ordinal 遵循现有规则；
- history、attach snapshot 与 live notification 使用同一转换；
- experimental schema 包含新 variant 和选定 request，stable profile 不意外暴露 experimental surface。

### Projection item / domain

表驱动单元测试覆盖：

- 五类事件穷尽转换；
- MESSAGE / FINAL_ANSWER / NEW_TASK；
- unresolved projection item、缺失字段、重名 path；
- unresolved item 保留 placeholder 且无伪边；
- payload 不进入输出 scene。

### Replay / layout / Redux

通过 module interface 对完整 scene 做 `toStrictEqual`：

- 同一输入使用不同 page / replay batch 切分，scene 完全相同；
- 输入 page 返回顺序不同，scene 完全相同；
- 多级、多子代理、跨分支 operation；
- 同一 recipient turn 多 author、多次 reply、MESSAGE + FINAL_ANSWER 单 batch merge；
- activation 结束、lane 复用、同 identity reactivation 与虚线续接；
- Root 固定 lane 0，child 始终位于直接 parent 右侧；
- live append 不改变既有 node position；
- replay 前 live FIFO 不进入 scene，caught up 后顺序消费；
- retry generation 与迟到输入隔离；
- selector 对无关更新保持引用稳定。

### Runtime coordinator

使用内存 `AgentDagSource` 和 fake frame scheduler，覆盖：

- descendants / turns pagination；
- 有限并发；
- keyed attach / detach / stale subscription；
- root notification fanout 不破坏当前聊天 coordinator；
- history 完成前 queue live；
- source error、retry、dispose 和 pending frame cancellation。

### Browser Mode

在 Chromium、Firefox、WebKit 验证用户可感知行为，不断言 React Flow 私有 DOM class 或 SVG path 字符串：

- chat / DAG Tabs 切换且 GUI host 不重连；
- 首次定位最新事件、会话内恢复 viewport；
- 普通滚轮 pan 与修饰键 zoom；
- 四个 HeroUI 工具栏操作；
- node 不可拖动 / 连接；
- hover、click lock、Esc、空白取消；
- replay 期间 highlight 禁用；
- warning count、node glyph、Tooltip reason；
- DAG 隐藏期间实时事件继续进入 scene。

### 视觉与规模回归

- 增加一个 Chromium `@visual` dense DAG 页面基线，覆盖 root、多个一级代理、子子代理、batch merge、lane 复用和解析 warning；
- 构造至少与已调查真实样本同量级的数据集：50 Threads、49 spawn edges、315 turns、248 replies；
- 不用墙钟时间作为易波动断言；验证 replay 确实跨多个 frame、旧 node 引用稳定、可见 DOM node 数远小于完整 scene node 数。

## 兼容性与风险

### App-server v2 union 增加

`InterAgentMessage` 是 experimental variant，只对声明 `experimentalApi` 的 GUI profile 可见。稳定 client schema 不应因本功能被迫接受新 union arm。GUI 使用 experimental generated union 后，所有相关 exhaustive switch 必须在编译期处理该 variant，禁止 default 静默吞掉。

### 多 subscription 资源

一个复杂任务可能拥有大量后代。runtime 必须：

- history 请求限并发；
- attach 只针对需要实时跟踪的已加载 / 新出现 Thread；
- 对历史已完成且无法 attach 的 Thread 只保留分页 snapshot；
- task / connection dispose 时成组 detach。

### 投影归一化

文本信封保持不变，但它只作为 app-server projection 的一种既有输入形状。projection 优先使用原始结构化字段，只在识别 `messageKind` 所需时读取信封头；格式无法识别时输出显式 unresolved item，不静默丢事件。GUI 不承担这一兼容 seam。

### 颜色复用

未来 reactivation 不可预测，因此“跨 identity 复用颜色”不能破坏“同 identity 永久同色”。设计优先身份稳定；只有完整生命周期不重叠可被证明时才复用。这一限制不会影响 lane 复用。

## 未采用方案

### 直接从 transcript state 构图

transcript state 只拥有当前 Thread 的展示 materialization，并已丢失多 Thread 与 raw item 语义。复用它会把 transcript 热路径与 DAG 全量聚合耦合。

### 把现有 coordinator 改成多 Thread 数组

现有 coordinator 的 Redux 下游仍是 `threadRuntime.current` 单例。直接数组化会让聊天状态、active turn 和 replay baseline 的职责混在一起。

### 手写 experimental DTO

会切断 Rust protocol 到 GUI 的 compile-time failure propagation，违反 GUI authoritative contract invariant。

### 将 inter-agent 信封投影为普通 `AgentMessage`

会让 transcript 把内部通信误当作模型回复显示，并迫使多个消费者重复解析文本来区分语义。独立 experimental projection variant 更能保持 locality，同时仍不新增 core / rollout 原始事件或 metadata。

### 在 GUI 解析 inter-agent 文本信封

会把原始记录兼容、字段归一化和错误诊断泄漏到前端，并重复 app-server 已能完成的投影职责。本设计改为扩展 Thread projection；只有对应 raw event 必须预先存在，结构化 projection 字段不受当前 `ThreadItem` 形状限制。

### 自动布局库

ELK / Dagre 会重新计算全图位置，不能稳定表达历史节点不移动、activation lane 复用和直接父代理右侧约束。

### 第二套虚拟列表

会产生 React Flow viewport 与事件文本列表两套坐标 / 滚动同步问题。事件文本必须和 node 一起位于同一 scene。

### Canvas / WebGL

虽然适合极端节点量，但会显著增加文本、Tooltip、keyboard focus、HeroUI 融合和测试成本。首版选择 React Flow 的可见 element 渲染。

## 设计完成标准

本设计被确认后，后续实施计划必须能够逐项回答：

- 既有 raw inter-agent event 如何在不修改原始记录的前提下被唯一、稳定地结构化投影；
- experimental Rust contract 如何机械生成到 GUI，不出现手写镜像；
- Root 与全部后代的历史和实时如何聚合且不污染当前聊天 state；
- 五类事件、batch merge、activation、lane、颜色和拓扑顺序如何由同一 replay module 产生；
- React Flow 如何只做渲染 adapter；
- 用户选择的加载、错误、viewport、工具栏和高亮行为如何验证；
- 每一项可见 UI 与协议行为如何在对应 test seam 获得覆盖。

本文件只定义设计，不包含实施任务顺序、提交拆分或执行计划。
