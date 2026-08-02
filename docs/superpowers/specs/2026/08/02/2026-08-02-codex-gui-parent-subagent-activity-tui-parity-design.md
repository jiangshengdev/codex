# Codex GUI 父任务子代理活动 TUI 对齐展示设计

日期：2026-08-02

状态：待确认

设计分支：`dev`

设计时 HEAD：`3c58d978205c10030f55d439c1f8bb4919ec294a`

关联文档：

- `docs/superpowers/research/2026/07/31/2026-07-31-codex-gui-extensible-thread-item-transcript-evaluation.md`
- `docs/superpowers/specs/2026/07/31/2026-07-31-codex-gui-extensible-thread-item-transcript-refactor-design.md`
- 历史版本：`docs/superpowers/specs/2026/07/26/2026-07-26-codex-gui-parent-subagent-activity-display-design.md`

## 唯一主目标

在当前重构后的 transcript 架构中，让 Codex GUI 父任务优先具备 TUI 已经提供的子代理协作活动展示，
同时保留 GUI 已确认的单一 identity、顺序、placement、chunk、scroll 和 stable view 约束。

第一版以当前 TUI 的用户可见语义为产品基线；GUI 专属图标、颜色、状态徽章、分组、导航、liveness
和其他个性化展示留给后续独立设计。

## 为什么必须重写旧设计

2026-07-26 设计的产品方向仍有价值，但其实现边界已经被 2026-07-31 重构替换：

- projection 输入现在统一经过 `transcriptProjection.ts`；
- `transcriptItemPolicy.ts` 是生成协议到 typed presentation 的私有解释 seam；
- `transcriptStateImplementation.ts` 统一拥有 identity、lifecycle、placement、chunk、revision 和 scroll；
- stored entry 与稳定的 `TranscriptEntryView` 已经分离；
- `CommittedTranscriptSurface.tsx` 只消费 selector 输出的 view；
- 旧设计依赖的 `transcriptEntryMaterialization.ts`、`transcriptCommittedProjection.ts`、
  `transcriptLiveProjection.ts` 和 activity 专属管线均不再是当前 owner。

协议事实也已变化：当前 MultiAgent V2 对同一个 `SubAgentActivity` 紧邻发射同 ID、同载荷的
`itemStarted` 和 `itemCompleted`。它不是 completed-only item，也不能表达持续 liveness。

因此本文件是新日期版本，不覆盖旧设计，也不续跑旧计划。

## 已确认的产品决策

1. 第一版 GUI 以当前 TUI 的动作词、可见时机、详情组织、状态摘要和截断规则为展示基线。
2. 后续 GUI 个性化展示不属于本设计；第一版不新增图标、状态徽章、导航、子代理列表或持续 liveness。
3. 只有原始 `Turn.items[0]` 自身物化为 user message 时才进入 leading。若原始首项是活动，后续
   user message 仍进入 middle。
4. `SubAgentActivity` 的结构性 `itemStarted` 不产生可见 presentation；紧邻的同载荷
   `itemCompleted` 只形成一条活动。
5. `collabAgentToolCall` 覆盖生成协议中的 `spawnAgent`、`sendInput`、`resumeAgent`、`wait` 和
   `closeAgent`，兼容 V1、V2 与历史 snapshot。
6. collab 展示只使用当前 item 的 `receiverThreadIds`；sub-agent 展示只使用当前 item 的
   `agentPath`。不查询 nickname、role 或跨线程 metadata。
7. `collabAgentToolCall.status === "failed"` 遵循当前 TUI 的动作摘要，不另造 `Failed to ...`
   标题，也不虚构错误原因。
8. 同一 `(turnId, itemId)` 在 GUI 中始终是一个 presentation identity；started、completed、snapshot
   和 reconnect 原位收敛，不复制 TUI append-only history 中的重复 cell 形状。

## “与 TUI 对齐”的精确定义

### 第一版必须对齐

- 三种 `SubAgentActivity.kind` 的动作词；
- 五种 `CollabAgentTool` 在 `inProgress` 与 terminal 状态下的可见性；
- terminal `completed` 与 `failed` 的标题语义；
- prompt、agent state、completed message 和 error message 的详情组织；
- `160 / 240 / 160` grapheme 截断与空白清理；
- 当前 V2 空 wait 载荷的泛化文案。

### 有证据支持的刻意差异

以下差异不是 GUI 个性化，而是 authoritative data 和当前 transcript architecture 的必要结果：

- TUI 可以从本地 cache 使用 nickname 和 role；GUI 不拥有这份权威数据，因此使用
  `receiverThreadIds` 中的原始 thread ID。
- TUI live 路径会把同一个 `SubAgentActivity` 的结构性 started/completed 追加成两条相同行；GUI
  只显示 completed 形成的一条活动，避免 realtime 与 snapshot/reconnect 不一致。
- TUI 会把 `resume` / `wait` 的 started 与 terminal cell 都保留；GUI 在同一 identity 原位更新，运行中
  先显示 started 文案，terminal 后只保留 terminal presentation。
- V1 TUI live 会缓存 spawn started 的原始 model/effort，并保留 wait started 的完整目标；completed
  snapshot 只含 terminal item。GUI terminal presentation 只使用 authoritative completed item，因此
  realtime、snapshot 与 reconnect 一致，不保留 started-only cache。
- TUI 使用 ratatui span、颜色和 append-only history cell；GUI 使用现有 transcript view/renderer，
  不复制 ratatui 内部结构。
- GUI 活动继续服从现有 `Intermediate updates` 展开/折叠和隐藏时不挂载规则；TUI 没有这一 DOM
  生命周期。

对齐优先级依次为：当前生成协议中的权威事实、已确认的 transcript identity/order 约束、当前 TUI 的
用户可见语义。不得为了表面逐行相同而建立第二套 state 或伪造缺失 metadata。

## 范围

本设计覆盖：

- `collabAgentToolCall` 与 `subAgentActivity` 的 typed stored entry 和 stable presentation view；
- started、completed、snapshot、replay 和 reconnect 的可见性与收敛；
- 默认 middle placement、chunk/count/revision/scroll 行为；
- TUI 对齐的标题、详情、状态摘要和 grapheme 截断；
- 唯一 renderer 中的最小、只读、可访问活动展示；
- 通过 production 写入/读取 seam 的状态与 Browser 行为验证。

## 非目标

- 不修改 Rust、app-server、generated TypeScript、runtime validator 或 projection contract；
- 不展示 reasoning、command execution、MCP、web search 或其他尚未启用的 `ThreadItem`；
- 不新增 activity 专属 order、state、cache、selector sequence、preview store 或 lifecycle owner；
- 不订阅子任务，不读取 mailbox、子线程 transcript、picker cache 或 local storage 补造信息；
- 不提供子代理最终 `Completed` / `Errored` liveness，不从 `SubAgentActivity` 推断仍在运行；
- 不提供子代理导航、展开详情、交互控件、聚合分组或 agent-centric timeline；
- 不设计 GUI 专属成功/失败措辞、图标、颜色、badge、动画或卡片层级；
- 不改变 leading/final message placement、100-entry middle chunks、sticky-bottom、replay 或 reconnect
  语义；
- 不创建公共 handler registry、兼容 adapter、双写、双读或 fallback 路径；
- 不创建或落盘实施计划，不修改产品代码。

## 权威输入与当前 producer

### 生成协议是唯一输入

输入直接来自 `@codex-protocol/v2` 的生成类型：

- `ThreadItem`；
- `ThreadProjectionEventNotification`；
- `ThreadProjectionAttachResponse`；
- `Turn`。

GUI 可以用 `Extract<ThreadItem, { type: ... }>` 等机械方式收窄类型，但不得手写镜像 wire DTO。

`CollabAgentToolCall` 可提供：

- `id`、`tool`、`status`；
- `senderThreadId`、`receiverThreadIds`；
- `prompt`、`model`、`reasoningEffort`；
- `agentsStates`。

`SubAgentActivity` 可提供：

- `id`、`kind`；
- `agentThreadId`、`agentPath`。

展示不使用 `senderThreadId` 或 `agentThreadId` 生成导航，也不把它们当作 metadata 查询 key。

### 当前 MultiAgent V2 范围

当前 V2 的实际分工是：

| 用户动作 | 父任务中的权威 item |
| --- | --- |
| `spawn_agent` | `SubAgentActivity(kind: started)` |
| `send_message` / `followup_task` | `SubAgentActivity(kind: interacted)` |
| `interrupt_agent` | `SubAgentActivity(kind: interrupted)` |
| `wait_agent` | `CollabAgentToolCall(tool: wait)` 的 in-progress → completed |

生成协议仍保留五种 collab tool，用于 V1、兼容路径和历史 snapshot。GUI 必须完整解释这五种 variant，
但不能反向宣称 V2 当前会为每个动作产生对应的 `CollabAgentToolCall`。

## Deep module seam

本功能是当前 `transcriptState` module 的一个垂直接入，不建立新的 activity module owner。

```text
transcriptProjection
  → transcriptItemPolicy
  → transcriptStateImplementation
  → transcriptStateSelectors
  → CommittedTranscriptSurface
```

各层职责固定如下：

| 职责 | 唯一 owner |
| --- | --- |
| threadRuntime action、dedup/replay 路由 | `transcriptProjection.ts` |
| 协议 variant、status/kind、可见性和 typed payload 派生 | `transcriptItemPolicy.ts` 私有 seam |
| identity、顺序、placement、chunk、count、revision、scroll、原位收敛 | `transcriptStateImplementation.ts` |
| 单一 stored payload | `TranscriptStoredEntry` / `entriesById` |
| stored → stable view 与 selector cache | `transcriptStateSelectors.ts` |
| stable view → DOM | `CommittedTranscriptSurface.tsx` 的唯一穷尽 renderer |

typed policy 只返回 `ignore`、`reserve`、`present` 或 `remove` 语义，不得直接修改 placement、chunk、
count、revision 或 scroll。中央 implementation 统一应用 policy 结果。

`transcriptProjection.ts` 和 slice caller 不判断 activity variant；renderer 不读取原始 `ThreadItem`、
tool-call status 或 projection envelope。

## Typed stored entry 与 stable view

两类活动保持独立 discriminant，不能被抹平成一个只含 `title/details` 的通用 activity record。

概念形状如下，精确字段名属于计划阶段的实现细节：

```ts
type TranscriptCollabAgentStoredEntry = {
  type: "collabAgent";
  id: string;
  turnId: string;
  tool: CollabAgentTool;
  toolStatus: CollabAgentToolCallStatus;
  receiverThreadIds: readonly string[];
  promptPreview: string | null;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  agentStateSummaries: readonly TranscriptCollabAgentStateSummary[];
  revision: number;
};

type TranscriptSubAgentActivityStoredEntry = {
  type: "subAgentActivity";
  id: string;
  turnId: string;
  activityKind: SubAgentActivityKind;
  agentPath: string;
  revision: number;
};
```

stored entry 保留两组不能混淆的状态轴：

- `CollabAgentToolCall.status` 是 tool call lifecycle；
- `agentsStates[*].status` 是目标 agent 状态；
- `SubAgentActivity.kind` 是领域动作；
- projection `itemStarted` / `itemCompleted` 是结构生命周期。

原始 prompt 和 agent state message 在进入 stored entry 前完成清理与截断，不在 Redux 中重复保存
无界 raw 文本。receiver/state collection 也必须有固定的 64 条 detail presentation 上限；该安全上限
高于当前默认生产 agent 数量，超过上限时只保留有序前缀和一个省略摘要，不能无界扩张 entry 或 DOM。

selector 输出两个稳定 view variant：

```ts
type TranscriptCollabAgentView = {
  type: "collabAgent";
  id: string;
  turnId: string;
  title: string;
  details: readonly string[];
  revision: number;
};

type TranscriptSubAgentActivityView = {
  type: "subAgentActivity";
  id: string;
  turnId: string;
  title: string;
  details: readonly [];
  revision: number;
};
```

title/details 是 renderer-facing stable view，不是唯一权威状态。view 继续按 stored entry identity 与
revision 缓存；未变化 entry 和未受影响 chunk 保持引用稳定。

## Lifecycle 与可见性

### `SubAgentActivity`

结构生命周期按以下方式解释：

```text
itemStarted(same payload)   → ignore
itemCompleted(same payload) → present once
snapshot completed item     → present once
```

这避免把同一个领域事实显示两次。`kind: started` 只表示“发生了 spawn 活动”，不能驱动 spinner 或
证明子代理仍在运行。

### `CollabAgentToolCall`

started policy 由 `tool` 和 item 自带的 `status` 决定：

- `spawnAgent`、`sendInput`、`closeAgent` 的 `inProgress` 不可见；
- `resumeAgent`、`wait` 的 `inProgress` 立即形成可见 transient presentation；
- terminal `completed` 和 `failed` 使用相同的 TUI-derived 标题规则；
- terminal 完整 item 覆盖 transient payload；不把 started-only receiver、请求参数或旧状态合并进
  terminal stored entry；
- completed-without-started 合法，直接在首次观察位置形成 settled presentation；
- duplicate started、duplicate commit 和 snapshot replay 是 no-op。

可见 transient 与 terminal presentation 使用相同 `(turnId, itemId)`：

- terminal 更新原 entry、原 chunk 和原 index；
- 不新增第二条记录，不增加第二次 middle count；
- 第一次可见 transient 触发现有 live scroll 语义；
- terminal 内容变化触发 committed scroll key；
- completed 不得把 entry 移到 turn 尾部。

不可见 `inProgress` 不产生 stored entry、DOM、middle count 或 scroll，也不建立 started-only activity
cache。`spawnAgent`、`sendInput`、`closeAgent` 在 terminal 首次可见时才由中央 implementation 分配
middle 位置。

### Snapshot 与 reconnect

- snapshot 按 `Turn.items` 原始顺序重建；
- snapshot 与 realtime terminal 使用同一 typed materializer；
- snapshot 中的 terminal item 直接产生 settled presentation；
- replacement attach 全量替换旧 presentation baseline；
- manual reconnect 保留现有 transcript 和全局 interruption status；
- 不从旧 GUI state、TUI history 或 metadata cache 恢复 projection 中不存在的信息。

## Placement、chunk 与 `Intermediate updates`

活动不拥有 placement policy。中央 implementation 的默认规则直接把所有可见非消息 presentation
放入 middle：

- 活动永不成为 leading；
- 活动永不进入 final；
- 只有原始 `Turn.items[0]` 自身物化为 user message 时才能进入 leading；
- 若原始首项是活动，后续 user message 进入 middle；
- 每个可见 activity identity 计为一个 `middleEntryCount`，detail 行不单独计数；
- 活动与其他 middle entry 共用 100-entry bounded chunks；
- 单项更新只使所在 entry/chunk revision 失效，不重算全 turn；
- final answer 出现前 middle 强制展开；出现后默认折叠；
- 折叠时继续不选择、不渲染、不挂载隐藏 activity view。

## TUI 对齐文案契约

### `SubAgentActivity`

标题正文保留 TUI 中围绕 `agentPath` 的可见反引号：

| `kind` | title | details |
| --- | --- | --- |
| `started` | ``Started `{agentPath}``` | 空 |
| `interacted` | ``Interacted with `{agentPath}``` | 空 |
| `interrupted` | ``Interrupted `{agentPath}``` | 空 |

`agentThreadId` 不进入文案。`agentPath` 不变成链接，不用于查询其他数据。

### `CollabAgentToolCall`

`{receiver}` 是 `receiverThreadIds` 中可用的原始 thread ID。GUI 不显示 TUI cache 中的 nickname 或
role。

| tool | `inProgress` | `completed` / `failed` |
| --- | --- | --- |
| `spawnAgent` | 不可见 | 有 receiver：`Spawned {receiver}`，可附加 model/effort；无 receiver：`Agent spawn failed`。可选 prompt detail |
| `sendInput` | 不可见 | 有 receiver：`Sent input to {receiver}`，可选 prompt detail；无 receiver：不可见 |
| `resumeAgent` | 有 receiver：`Resuming {receiver}`；无 receiver：不可见 | 有 receiver：`Resumed {receiver}`，并显示 state 或固定 fallback detail；无 receiver：不可见 |
| `wait` | 0 receiver：`Waiting for agents`；1 个：`Waiting for {receiver}`；多个：`Waiting for N agents` 并逐项列 detail | `Finished waiting`；有 state 时逐项列 detail，无 state 时 `No agents completed yet` |
| `closeAgent` | 不可见 | 有 receiver：`Closed {receiver}`；无 receiver：不可见 |

`failed` 不改变上述标题：

- 有 receiver 的 failed spawn 仍是 `Spawned {receiver}`；
- failed send 仍是 `Sent input to {receiver}`；
- failed resume 仍是 `Resumed {receiver}`；
- failed wait 仍是 `Finished waiting`；
- failed close 仍是 `Closed {receiver}`。

`Agent spawn failed` 只由 receiver 缺失触发，不是 `status === "failed"` 的统一标题。

spawn model 附注只在当前 authoritative item 同时提供 model 和 reasoning effort 时沿用 TUI 语义：

- model 非空时为 `({model} {reasoningEffort})`；
- model 为空、reasoning effort 非默认值时为 `({reasoningEffort})`；
- model 为空且 reasoning effort 为默认值时不显示；
- started/completed 中没有足够的 authoritative 字段时不猜测。

V1 TUI live 优先显示 started 时缓存的“原始请求” model/effort；GUI 为保持 snapshot/reconnect 等价，
显示 completed item 中的实际生效值。两者通常相同，但不承诺在模型回退或配置解析后仍逐字一致。

### Agent state detail

| agent status | detail |
| --- | --- |
| `pendingInit` | `Pending init` |
| `running` | `Running` |
| `interrupted` | `Interrupted` |
| `completed` | `Completed`；有非空 message 时追加 ` - {message}` |
| `errored` | `Error - {message}`；message 缺失时为 `Error - Agent errored` |
| `shutdown` | `Shutdown` |
| `notFound` | `Not found` |

resume 找不到任何 agent state 时使用 `Error - Agent resume failed`，但标题仍为 `Resumed {receiver}`。

wait detail 顺序与 TUI 一致：先按 `receiverThreadIds` 顺序列出有 state 的 receiver，再把
`agentsStates` 中剩余的合法 key 按字符串排序追加。没有任何有效 state 时显示
`No agents completed yet`。

### Grapheme 与空白规则

- prompt：先 `trim()`；空值不产生 detail；最多 160 grapheme；不折叠内部空白；
- completed message：先按空白分词再用单个空格连接；最多 240 grapheme；
- error message：同样先折叠空白；最多 160 grapheme；
- 超限时保留 `上限 - 3` 个 grapheme，再追加 ASCII `...`；
- `...` 计入总上限；
- 不按 UTF-16 code unit 或 Unicode code point 截断组合字符；
- receiver、model 和 `agentPath` 不套用上述三种内容 preview 上限。

GUI 实现必须使用目标运行时的 grapheme segmentation 能力得到同一结果；不得静默退化为
`String.length` / `slice`。

## 第一版 renderer

第一版 renderer 只表达 TUI 已有信息，不添加新的产品含义：

- 每个 activity view 是一个只读 `article`；
- 主行显示一个装饰性 bullet 和 title；
- 有 details 时，第一行使用装饰性 `└`，后续行保持同级缩进；
- bullet/branch 不进入 accessible name；可访问名称来自 title；
- 没有 details 时不创建空 description；
- 不创建 button、link、tooltip、popover 或键盘焦点；
- 可以使用现有 HeroUI transparent Card 作为 GUI surface shell，但不把 Card 的颜色、padding、class
  或阴影变成产品契约；
- 不增加状态图标、成功/失败颜色、agent avatar、spinner 或导航 affordance。

`TranscriptEntryRenderer` 对 `message`、`status`、`collabAgent`、`subAgentActivity` 保持编译期穷尽。
两个 activity variant 可以共享纯视觉 shell，但不能在 stored/view union 中合并语义。

## 测试 Interface

测试穿过 production 写入 seam 和 selector/Browser 读取 seam，不把私有 policy helper、map 字段顺序、
具体 chunk ID、CSS class 或 HeroUI 内部 DOM 当作长期 Interface。

### TUI 对齐矩阵

- 覆盖三种 `SubAgentActivity.kind` 的标题、空 details 和 started/completed 单条收敛；
- 覆盖五种 collab tool 的 `inProgress`、`completed`、`failed` 共 15 个状态单元格；
- 明确锁定 failed 使用当前 TUI 动作词，而不是 GUI 专属失败标题；
- 覆盖 receiver 缺失、单 receiver、多 receiver 和原始 thread ID fallback；
- 覆盖七种 agent status、resume fallback 和 wait 空 state；
- 覆盖 prompt 160、completed 240、error 160 的边界、超限和组合 grapheme；
- 覆盖 prompt 与 message 的不同空白规则。

这些断言锁定本设计选择的 GUI 文案契约，不直接依赖 TUI snapshot 文件或 ratatui cell 结构。

### Lifecycle 与 state

- `SubAgentActivity.itemStarted` 不产生 view/count/scroll，completed 只产生一条；
- resume/wait started 首次可见，terminal 按相同 ID、chunk、index 原位更新；
- terminal 后不残留 started view，也不新增第二次 count；
- terminal 完整 item 覆盖 started payload，不残留 completed snapshot 无法恢复的 receiver 或请求字段；
- completed-without-started 可形成 settled entry；
- duplicate started、duplicate commit、snapshot duplicate 和 replay 不重复；
- snapshot 与 realtime terminal presentation 等价；
- reconnect replacement 正确恢复，manual reconnect 保留现有内容；
- 同 raw item ID 跨 turn 仍由 `(turnId, itemId)` 隔离。

### Placement、性能与 Browser

- 原始首项为 activity 时，后续 user message 仍在 middle，不进入 leading；
- activity 一律属于 middle，永不 final；
- 100/101 entry chunk 边界、未变化 chunk view 引用和单 chunk invalidation 保持稳定；
- 首次可见 transient 与 terminal update 使用正确的 scroll signal；
- 无 final 时 activity 可见且 middle 不可折叠；
- 有 final 时默认折叠且隐藏 activity 不挂载；
- 展开后 DOM 顺序与 transcript identity 顺序一致；
- activity 有可访问 title、无额外焦点目标；
- 现有 message streaming、status、sticky-bottom 和用户主动上滚行为不回归。

## 影响边界

后续实现预计只沿当前 GUI seam 形成垂直切片：

- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts`；
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`；
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts`；
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`；
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`；
- 对应 transcript state、snapshot/replay/reconnect、selector cache 和 Browser 测试；
- 必要的 authoritative projection fixture/builders。

允许在 `transcriptState` module 内新增私有 typed presentation 文件以保持 module locality，但不能形成
公共 registry 或第二 owner。精确文件清单由设计确认后的计划基于届时 HEAD 收敛。

以下路径不在范围内：

- `codex-rs/**`；
- generated app-server protocol；
- GUI Host / WebSocket / projection ingress contract；
- threadRuntime state；
- composer、agent picker、子任务页面或导航；
- package dependencies 和 scripts。

## 风险与约束

### TUI 当前失败措辞可能不直观

`failed` 仍可能显示 `Sent input to`、`Resumed`、`Finished waiting` 或 `Closed`。这是本次明确选择的
TUI-first 基线，不在第一版纠正。未来若要改成 GUI 专属失败标题，必须作为新的产品设计同时评估
TUI 是否也应统一。

### TUI append-only 形状与 GUI snapshot 不同

复制 TUI 的重复 cell 会让 live、snapshot 和 reconnect 产生不同结果，也会破坏当前单 identity owner。
本设计只复制用户语义，不复制该 append artifact。

### metadata 不对称

TUI 的 nickname/role 来自本地 cache，GUI 没有同一 authoritative input。第一版显示 raw thread ID；
不能把可读性差误判为允许跨线程查询的理由。

### tool status 与 agent status 混淆

`CollabAgentToolCall.status` 不能覆盖或替代 `agentsStates[*].status`。policy 和 stored entry 必须保留
两个维度，renderer 只消费最终 stable view。

### 无界详情

wait 的 receiver/state collection 和 message 都可能扩大。实现必须在 typed presentation seam 进行
有界化，不能把无界 raw collection 或 delta history复制进 Redux/DOM。

## 设计否决条件

出现以下任一情况即偏离本设计：

- 新建 activity 专属 state/order/cache/lifecycle 管线；
- `transcriptProjection.ts`、slice 或 renderer 直接判断协议 item variant；
- typed policy 直接修改 placement、chunk、count、revision 或 scroll；
- 把 collab 与 sub-agent stored state 合并成仅含通用 title/details 的 record；
- 同一个 `(turnId, itemId)` 同时保留 started 与 terminal 两个 GUI entry；
- 把 `SubAgentActivity` 的结构性 started/completed 显示为两条；
- 为 `failed` 发明 TUI 当前不存在的统一失败标题；
- 查询 nickname、role、mailbox、子线程状态或 transcript 补全显示；
- 用 `SubAgentActivity.kind` 驱动长期 spinner 或 liveness；
- snapshot 与 realtime 使用不同 materializer；
- renderer 读取 raw `ThreadItem`、projection envelope 或 transient lifecycle；
- flatten 全 turn 完成排序、分组或 equality；
- 为迁移保留旧新双写、双读、fallback 或 adapter；
- 修改 Rust、app-server、generated protocol 或其他非 GUI transcript 路径。

## 验收标准

- 父任务能看到当前 V2 的 `Started`、`Interacted with`、`Interrupted` 和 wait 生命周期；
- V1、V2 与历史 snapshot 中五种 collab tool 均按矩阵解释；
- `failed` 使用当前 TUI 动作摘要，不虚构原因；
- 当前 V2 空 wait 先显示 `Waiting for agents`，terminal 后原位变为 `Finished waiting` 和
  `No agents completed yet`；
- `SubAgentActivity` started/completed 只形成一条 activity；
- 活动只使用 `receiverThreadIds` / `agentPath`，不查询 metadata；
- 活动始终在 middle，leading/final 规则保持当前重构语义；
- 同 identity 原位收敛，chunk、count、selector reference 和 scroll 信号保持稳定；
- final 前展开、final 后默认折叠、折叠时不挂载；
- 第一版 UI 只呈现 TUI 已有标题和详情，不增加个性化功能；
- snapshot、realtime、replay 和 reconnect 结果一致；
- 现有 message streaming、其他 item ignore policy 和 transcript 性能边界不回归；
- 不包含 Rust/API、导航、liveness、第二数据源或第二 state owner。

## 后续门禁

本文件只完成新版本设计落盘，不创建实施计划，也不授权代码修改、验证、stage 或 commit。

用户明确确认本设计后，下一轮才可编写并落盘实施计划；计划再次获得明确确认后，才能进入实现。
