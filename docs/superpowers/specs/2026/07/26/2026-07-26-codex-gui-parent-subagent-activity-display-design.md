# Codex GUI 父任务子代理活动展示设计

日期：2026-07-26
状态：待确认

## 唯一主目标

在 Codex GUI 的父任务 transcript 中，按真实发生顺序展示现有协议已经提供的子代理协作活动，
同时保持现有 turn 分段、chunk 性能边界和 `Intermediate updates` 交互不变。

## 背景与现状

父任务已有两类结构化 `ThreadItem` 可以表达本设计所需活动：

- `collabAgentToolCall`：表达协作工具调用及其 started/completed 生命周期；
- `subAgentActivity`：表达 `started`、`interacted`、`interrupted` 三类已完成活动。

这两类 item 已经由 Rust/app-server 进入父线程 projection，GUI Host 也已放行顶层
`thread/projection/event` 通知。生成的 TypeScript contract 和 runtime validator 均已包含这两个
variant；projection ingress 与 `threadRuntime` 不会按 item variant 丢弃它们。

当前不可见的原因位于 GUI transcript 消费层：

- `transcriptEntryMaterialization.ts` 对 `collabAgentToolCall` 和 `subAgentActivity` 明确返回
  `null`，因此 snapshot 和 `itemCompleted` 无法形成 committed entry；
- `itemStarted` 虽保留完整 `initialItem`，现有 live surface 只选择 `agentMessage` 渲染，因此
  started wait 不可见；
- 当前 `TranscriptEntry` 只有 `message` 和 `status`，没有表达“低视觉权重的协作活动”这一前端
  领域语义。

MultiAgent V2 当前实际产生的父级活动范围比协议可表达范围更窄：

- `spawn_agent` 完成后产生 `SubAgentActivity::Started`；
- `send_message` / `followup_task` 完成后产生 `SubAgentActivity::Interacted`；
- `interrupt_agent` 完成后产生 `SubAgentActivity::Interrupted`；
- `wait_agent` 产生同一 `CollabAgentToolCall::Wait` 的 `itemStarted` 和 `itemCompleted`。

当前 V2 wait 的 `receiverThreadIds` 和 `agentsStates` 为空，因此 GUI 只能展示泛化 wait 文案，
不能从现有载荷推导具体代理结果。

## 目标

- 父任务中实时显示现有 `Started`、`Interacted with`、`Interrupted` 和 wait 生命周期活动。
- 每个活动以主标题和可选的有界详情表达；标题与详情由 authoritative `ThreadItem` 机械派生。
- 独立 completed 活动按 projection 顺序追加；同一 wait 调用的 started/completed 在原位置收敛。
- activity 永远属于 turn 的 middle，不占用 leading prompt，也不进入 final answer。
- turn 尚无 final answer 时活动保持展开；出现 final answer 后沿用现有
  `Intermediate updates` 折叠行为。
- 使用低视觉权重且可访问的 HeroUI v3 Card 表达活动。
- 保持 chunk 级 selector、折叠时不挂载隐藏条目等现有性能约束。

## 非目标

- 不修改 Rust、app-server、GUI Host 或 generated contracts/runtime validators。
- 不新增父级 `Completed` / `Errored` 终态事件，也不从 mailbox 或子线程状态猜测终态。
- 不展示子代理列表、持续 liveness、按需活动预览或父子任务导航。
- 不订阅子任务，不把子代理消息、推理、命令、工具输出或完整 transcript 实时镜像到父任务。
- 不补充 MultiAgent V2 的 rich spawn/send 载荷，不补充 wait 的 receiver 或 agent state。
- 不改变其他 `ThreadItem` 的 materialization 范围。
- 不改变 assistant live streaming、delta、scroll pulse、replay dedup 或 reconnect 语义。

## 已确认的产品决策

1. 产品范围仅为父任务 transcript 中现有结构化协作活动。
2. 每个独立活动按真实发生顺序形成一条 transcript entry，不按代理聚合，也不建立汇总区。
3. 单条活动使用“主行 + 有界详情”；没有详情载荷时只显示主行。
4. 活动使用 HeroUI `Card variant="transparent"`，视觉权重低于普通 assistant Card。
5. 活动在 turn 进行中展开；final answer 出现后归入现有 `Intermediate updates`。
6. 同一 `CollabAgentToolCall` 的 started/completed 原位更新，不产生两条 wait 记录。
7. 接受现有事件边界，不承诺子代理结束时自动出现 `Completed` / `Errored`。

## 协议与载荷边界

authoritative contract 继续是 `@codex-protocol/v2` 导出的 `ThreadItem`。设计不在 GUI 中手写镜像
协议类型；只允许用 `Extract<ThreadItem, { type: ... }>` 等机械类型变换限定输入 variant。

前端可以从现有 item 读取：

- `CollabAgentToolCall` 的 `id`、`tool`、`status`、`receiverThreadIds`、`prompt`、`model`、
  `reasoningEffort` 和 `agentsStates`；
- `SubAgentActivity` 的 `id`、`kind`、`agentPath` 和 `agentThreadId`。

其中 `senderThreadId`、item ID 与 `agentThreadId` 不直接进入活动文本。`agentThreadId` 在 TUI 中还可
用于导航与 liveness，但这些能力不属于本设计。

GUI 不做跨 item、跨线程或外部 metadata 查询来补齐 nickname、role、result 或状态。载荷没有的内容
保持缺失；当前 V2 空 `receiverThreadIds` / `agentsStates` 必须显示泛化文案，不能从其他本地状态
推断具体代理。

## Deep module seam

生命周期 seam 放在 `transcriptCommittedProjection`：它已经集中拥有 snapshot rebuild、completed
materialization、首次位置分类、按 item ID upsert 和 chunk revision 推进。该 module 的 interface
扩展为三类入口：

- snapshot baseline rebuild；
- `itemStarted` 应用，并返回该 item 是否已经由 committed projection 接管；
- `itemCompleted` 应用。

其 implementation 负责 activity 的首次 middle 占位、同 ID 原位更新和 completed-only 追加。
`transcriptStateSlice` 只根据入口结果路由：started activity 已被接管时不再创建通用 live slot；其他
started item 继续走现有 `transcriptLiveProjection`。

协议解释和文案有界化作为该 implementation 内部的纯 transcript activity 模块。它只接受
authoritative `ThreadItem` 中的两个 activity variant，并返回前端领域 entry 或 `null`，统一负责：

- 对 `tool`、`status`、`kind` 和 agent state 做穷尽分支；
- 按 TUI 既有语义派生 title/details；
- 对 prompt、completed message、error message 做 grapheme 上限处理；
- 判断某个 started/completed item 在当前生命周期阶段是否应可见；
- 把协议载荷收敛成不含导航、liveness 或完整结果的显示模型。

`transcriptEntryMaterialization` 只负责把通用 `ThreadItem` 分派给内部 activity materializer；React
只负责按 entry 字段渲染 HeroUI Card。这样生命周期不会分散到 reducer/renderer，协议解释不会泄漏进
UI，UI 结构也不会反向污染 authoritative contract。

## TranscriptEntry activity 形状

`TranscriptEntry` 增加独立的前端领域 variant：

```ts
type TranscriptActivityEntry = {
  type: "activity";
  id: string;
  turnId: string;
  title: string;
  details: string[];
  revision: number;
};
```

该形状表达的是 GUI 已完成派生的显示语义，不是协议 DTO 镜像：

- `title` 是始终存在的单行主文案；
- `details` 是零到多行、已完成清理和截断的可见详情；
- `revision` 沿用 committed entry 的原位更新与 chunk memoization 机制；
- 不保存原始 `ThreadItem`、raw prompt、raw result、thread metadata 或导航目标；
- 不增加可由 title/details 完全推导的第二套 action/status 字段。

activity 的 aria label 可以直接由 title 与 details 组合得到，无需再保存一份易漂移的可访问性文案。

## 生命周期与状态收敛

### Snapshot

snapshot rebuild 按 `turn.items` 原始顺序处理：

- `collabAgentToolCall` 按 snapshot 中 authoritative `status` 派生；in-progress wait 显示
  `Waiting for ...`，completed wait 显示 `Finished waiting`；
- `subAgentActivity` 经过同一内部 materializer 形成 activity entry；
- 可见 entry 直接归类到 middle；
- 不假设 snapshot 只含 completed history，也不从 snapshot 之外恢复缺失的瞬时状态。

snapshot 路径不引入 activity 专属容器，继续使用 `entriesById`、middle chunks 和
`entryChunkById`。

### itemStarted

当前产品所需的 started 可见项是 `CollabAgentToolCall::Wait`。收到首次有效 `itemStarted` 时：

1. 由 activity 模块把 in-progress wait 派生为 `Waiting for ...` activity entry；
2. 该 entry 直接作为 committed middle 占位插入，而不是追加到 turn 末尾的 live assistant 区；
3. 首次占位建立 `entriesById`、所在 middle chunk、`entryChunkById` 和
   `middleEntryCount`；
4. 它的位置就是 projection 中 started 发生的位置，后续父代理消息或其他活动继续排在其后；
5. started 形成可见 committed 变化时更新 committed scroll 信号；不复用
   `liveScrollPulse`。

不可见的 collab started（例如按 TUI 语义应等完成后再展示的 spawn/send/close）不创建占位。
`SubAgentActivity` 当前只以 completed/snapshot 形式进入本设计，不建立 started 分支。

同一 turn + item ID 的重复 `itemStarted` 继续遵守既有幂等语义：不覆盖 entry，不改变 revision，
不重复写入 chunk，不增加 middle 计数，也不产生额外 scroll 更新。

### itemCompleted

收到 completed item 后，activity 模块先派生最终 title/details，然后按相同 item ID 收敛：

- 如果该 ID 已由 wait started 创建 activity entry，则在 `entriesById` 原位替换内容并递增 entry
  revision；
- 原 `entryChunkById` 不变，所在 chunk 的 `entryIds` 顺序不变，只递增该 chunk revision；
- `middleEntryCount` 不变，不新建 chunk，不把 entry 移到当前 turn 尾部；
- 如果该 ID 没有 started 占位，则按 completed 事件到达时的位置新增一条 middle entry；
- `SubAgentActivity` 走后一种 completed-only 路径，因此每个 item 按事件顺序新增一条 entry；
- completed 内容不可见时，不留下空占位。

这使 `Waiting for agents` 能在原位置更新为 `Finished waiting`，同时保持 started 时已经确定的
chunk、全局时序、折叠计数和 React key。

### 其他 live item

现有 `TranscriptRenderableLiveItem`、`liveItemsByTurnId`、agent message delta 聚合与
`LiveAssistantMessages` 保持原语义。activity started 使用 committed middle 占位是一个受 item variant
约束的专用路径，不把所有 started item 改造成 committed entry，也不改变 agent message 从 live slot
到 completed message 的现有生命周期。

## Turn 分类与 Intermediate updates

activity 强制归类为 middle。分类顺序先判断 `entry.type === "activity"`，再应用现有 leading prompt
与 final assistant 规则，因此：

- 即使 activity 是 turn 中第一条可见 entry，也不能占用 `leadingPromptEntryId`；
- 后续第一条非 assistant 普通消息仍可成为 leading prompt；
- activity 不可能进入 `finalAssistantEntryIds`；
- activity 计入 `middleEntryCount`，每张 Card 算一个 item，而不是每条 detail 算一个 item；
- activity 与 commentary、status 等 middle entry 共用既有 chunk 上限和 chunk selector。

`MiddleTranscriptModule` 的交互不新增分支：

- 没有 final answer 时 middle 强制展开且不可收起，started wait 立即可见；
- 出现 final answer 后 middle 默认折叠，活动与其他 intermediate updates 一起隐藏；
- 折叠时继续不挂载隐藏 Card；
- 展开后按 middle chunk 和 entry 原始顺序渲染。

## Title/details 机械派生

文案以 TUI `multi_agents.rs` 的既有语义为基准，GUI 不创造第二套产品含义。

### SubAgentActivity

| kind | title | details |
| --- | --- | --- |
| `started` | `Started {agentPath}` | 空 |
| `interacted` | `Interacted with {agentPath}` | 空 |
| `interrupted` | `Interrupted {agentPath}` | 空 |

`agentPath` 作为普通可见文本显示；GUI 不把它转换为链接，也不使用 `agentThreadId` 增加隐藏状态。

### CollabAgentToolCall

| tool / lifecycle | title 语义 | details 语义 |
| --- | --- | --- |
| spawn completed | `Spawned {receiver}`，可选附加 `(model reasoningEffort)`；无 receiver 时 `Agent spawn failed` | 可选 prompt |
| send completed | `Sent input to {receiver}` | 可选 prompt |
| resume started | `Resuming {receiver}` | 空 |
| resume completed | `Resumed {receiver}` | 可用 agent state 或标准失败摘要 |
| wait started | 单 receiver 为 `Waiting for {receiver}`；多 receiver 为 `Waiting for N agents`；空 receiver 为 `Waiting for agents` | 多 receiver 时列出 receiver |
| wait completed | `Finished waiting` | 有 state 时逐项列出；无 state 时 `No agents completed yet` |
| close completed | `Closed {receiver}` | 空 |

spawn/send/close 的 in-progress 形态按 TUI 语义不显示。receiver 标签只能使用当前 item 公开的 thread ID；
本设计不增加 nickname/role 查询。协议未来若直接提供更多现有字段，派生模块仍只能使用 authoritative
contract 内的载荷，不得在 GUI 中维护镜像字段。

当前 MultiAgent V2 wait 的 receiver 和 state 都为空，预期文案固定为：

```text
Waiting for agents

Finished waiting
No agents completed yet
```

started 与 completed 是同一张 Card 的两个时刻，不会同时保留在 transcript 中。

## 有界详情与 grapheme 规则

与 TUI 保持相同上限：

- prompt：160 grapheme；
- completed message：240 grapheme；
- error message：160 grapheme。

GUI 使用 `Intl.Segmenter` 且 `granularity: "grapheme"` 计算用户可见字素簇，不按 UTF-16 code unit、
Unicode code point 或字符串长度切割。超限时保留 `上限 - 3` 个 grapheme 后追加 ASCII `...`，使最终
输出仍不超过对应上限，并与 TUI `truncate_text` 行为一致。

prompt 先 trim；空 prompt 不产生 detail。completed/error message 先把连续空白折叠为单个空格，再执行
截断；空结果不追加分隔符或空详情。详情只保留派生后的有界文本，raw payload 不进入
`TranscriptEntry`。

## HeroUI Card 与可访问性

activity entry 使用 HeroUI v3 compound component：

```tsx
<Card variant="transparent" role="article" aria-labelledby={titleId}>
  <Card.Header>
    <Card.Title id={titleId}>{title}</Card.Title>
    {details.map((detail) => (
      <Card.Description key={...}>{detail}</Card.Description>
    ))}
  </Card.Header>
</Card>
```

`transparent` 表达 HeroUI 定义的 minimal prominence，避免活动与普通 assistant `default` Card、用户
`secondary` Card 竞争视觉层级。使用 `Card.Header`、`Card.Title`、`Card.Description` 表达主行和
弱化详情，不创建自定义 Card 组件或硬编码背景色。

可访问性边界：

- 每张 Card 保持独立 `article` 语义；
- title ID 由 turn ID 和 entry ID 确定性构造，Card 通过 `aria-labelledby` 关联可见标题；
- details 保持 DOM 顺序和可见文本，不用只对视觉生效的伪元素承载信息；
- activity 无交互能力，不伪装为 button/link，不增加键盘焦点；
- 紧凑样式只调整间距与排版，不能降低文本对比度到语义 token 之外。

## 影响文件边界

后续实现应限定在 `codex-gui/**`，预计涉及以下现有边界：

- `src/features/transcriptState/transcriptStateModel.ts`：增加 activity 领域 entry；
- `src/features/transcriptState/transcriptEntryMaterialization.ts` 及同目录的 activity 派生模块：建立
  authoritative item 到 title/details 的深模块 seam；
- `src/features/transcriptState/transcriptCommittedProjection.ts`：activity 强制 middle、started
  占位和 completed 原位 upsert；
- `src/features/transcriptState/transcriptStateSlice.ts`：按 item variant 分派 started/completed，保持
  dedup 与 scroll 语义；
- `src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`：渲染 transparent activity
  Card，并让 surface content 判断识别 activity started 占位；
- 对应 transcript state、snapshot/replay/lifecycle、chunk equality 和 browser surface 测试，以及共享
  projection fixtures/builders 中现有 contract 派生的 activity fixture 支持。

边界之外明确不涉及 `codex-rs/**`、GUI Host filter/WebSocket、app-server schema、generated protocol
文件、依赖或 package scripts。最终文件清单应在计划阶段根据实现入口再次精确收敛；本设计不授权
上述代码修改。

## 测试设计

测试以 authoritative projection fixtures/builders 构造合法 payload，不在单个测试中手写协议镜像。

### 文案与有界化

- 穷尽覆盖 `SubAgentActivity` 三种 kind 的 title 和空 details。
- 覆盖 collab tool 各 lifecycle 的可见/不可见规则，以及 receiver 缺失时的标准文案。
- 覆盖当前 V2 空 receiver/state wait 的 `Waiting for agents`、`Finished waiting` 和
  `No agents completed yet`。
- 覆盖 prompt 160、completed 240、error 160 的边界值、超限值和组合 grapheme，确认不会截断 emoji
  或多 code point 字素簇，且 `...` 计入上限。
- 覆盖空白清理后为空的 detail 不渲染。

### Snapshot 与 committed projection

- snapshot 中 `collabAgentToolCall` / `subAgentActivity` 按原始 item 顺序进入 middle。
- turn 首项为 activity 时 `leadingPromptEntryId` 仍为空，后续普通 user message 可以成为 leading
  prompt。
- activity 计入 `middleEntryCount`，跨 chunk 时不破坏既有 100-entry chunk 边界和稳定 selector。
- snapshot duplicate replay 继续不重复物化 entry。

### Started/completed 生命周期

- 首次 wait `itemStarted` 立即在 middle 的事件位置创建一条 activity，占用一个计数。
- 后续其他 entry 追加后，wait `itemCompleted` 仍更新原 ID、原 chunk、原 index，Card 顺序和
  `middleEntryCount` 不变。
- completed 更新 entry revision 和所在 chunk revision，未影响的旧 chunk 保持引用稳定。
- completed 缺少 started 时仍按到达位置新增一条 middle activity。
- 重复 started 不改 entry、chunk、计数或 scroll 信号。
- `SubAgentActivity` 的 completed-only 与 snapshot 路径结果一致。
- agent message 的 live slot、delta、completed 收敛和 `liveScrollPulse` 保持现有断言。

### 浏览器表面与可访问性

- activity 使用 `card--transparent`，普通 assistant/user Card variant 不变。
- 有详情时使用可见 title/description，无详情时不产生空 description。
- Card 具有 `article` 与可解析的 accessible name，不产生额外焦点目标。
- turn 无 final answer 时 activity 可见且 disclosure 禁止收起；有 final answer 时 activity 默认未挂载，
  展开 `Intermediate updates` 后按顺序出现。
- wait completed 后页面只显示最终 Card 内容，不同时残留 started Card，折叠区 item 计数不增加。

## 风险与约束

### Started entry 进入 committed middle

这是本设计最关键的状态模型变化。若把 started wait 留在现有 live assistant 区，completed 后再写入
middle，会改变位置并产生视觉跳动；若同时保留两处，又会重复计数。专用 committed 占位可以保持
顺序，但实现必须在 dedup 记录与通用 live slot 创建之前识别可见 activity started。

### 同 ID 更新破坏 chunk 稳定性

completed 只能更新 entry 和其所在 chunk revision。重新分类、重新 append 或重算整 turn 会破坏顺序、
计数和 transcript 热路径。测试需要锁定原 chunk ID、entry index 与未影响 chunk 的引用稳定性。

### 文案与 TUI 漂移

GUI 与 TUI 仍是不同语言实现，无法共享同一 renderer。风险通过 authoritative item 输入、单一前端
派生模块、穷尽分支和对齐 TUI snapshots 的固定示例降低；不在 React 中再次解释 tool/status。

### 载荷不足被误当成 UI 缺陷

当前 V2 的 wait 不提供具体 receiver/state，spawn/send 也主要通过 path-based `SubAgentActivity`
表达。GUI 必须忠实显示泛化结果，不以查子线程、猜状态或静默拼接 mailbox 文本来“丰富”内容。

### Grapheme 与运行时支持

截断必须依赖目标 GUI 运行时已支持的 `Intl.Segmenter`。如果目标运行时事实与此不符，应在计划前
作为兼容性证据重新评估；不得在实现中悄悄退化为按 code unit 截断。

## 验收标准

- 父任务实时看到现有 `Started`、`Interacted with`、`Interrupted` 和 wait 活动，顺序与 projection
  事件一致。
- wait started 首次出现于 middle；completed 以同 ID 原位更新，chunk、index 和 middle 计数不变。
- 当前 V2 空 wait 载荷显示泛化文案，不显示虚构的代理或终态。
- activity 永不占 leading prompt，永不进入 final answer，并正确计入 `Intermediate updates`。
- turn 进行中活动展开；final answer 后默认折叠，折叠时不挂载隐藏 Card。
- 每条 activity 使用 HeroUI transparent Card、可访问标题和零到多条有界详情。
- prompt/completed/error 分别遵守 160/240/160 grapheme 上限，组合字符不被切断。
- snapshot、completed-only、started/completed、重复事件和 replay 路径结果一致且幂等。
- 现有 agent message live streaming、其他 item materialization、scroll、chunk 性能与协议验证行为不变。
- 实现不包含 Rust、app-server、GUI Host、generated contract、终态、导航、liveness 或实时镜像改动。

## 后续门禁

本文件只完成设计落盘，不授权计划或实现。设计经用户明确确认后，下一轮才可编写并落盘实施计划；
计划再次经用户明确确认后，方可修改 `codex-gui` 代码、运行计划内验证或执行其他实现动作。
