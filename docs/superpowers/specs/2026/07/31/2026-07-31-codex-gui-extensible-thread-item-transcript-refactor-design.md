# Codex GUI 可扩展 ThreadItem transcript 重构设计

日期：2026-07-31

状态：已确认

设计分支：dev

设计时 HEAD：324bc10a170f31fa99c3f01c84c298ea5290cbb4

关联 research：

- docs/superpowers/research/2026/07/31/2026-07-31-codex-gui-extensible-thread-item-transcript-evaluation.md

## 唯一主目标

保留现有 transcript 单一顺序与性能基础，将消息 placement 与可扩展的 typed ThreadItem
生命周期和内容展示解耦，为后续接入子代理活动预览提供稳定扩展点。

本设计解决代码结构的可扩展性，不在当前重构中启用新的 reasoning、command、collab 或
sub-agent 用户可见内容。

## 背景与当前根因

app-server v2 的 ThreadItem 已经是跨层权威 union，包含 agentMessage、reasoning、
commandExecution、collabAgentToolCall、subAgentActivity 等类型。projection ingress
也没有把输入收窄为 agentMessage。

当前局限发生在 GUI transcript 的三个连续边界：

1. transcriptEntryMaterialization 只物化 userMessage 和 agentMessage；
2. started 与 delta projection 只为 agentMessage 建立和更新 live payload；
3. renderer 只理解 committed message/status 与 live assistant Markdown。

因此只增加几个 React Card renderer 不能完成扩展。非消息项在抵达 renderer 之前已经被过滤，
而继续为每个类型增加专属 started、committed、order、scroll 和 equality 分支会重新建立已回退的
activity 专用管线。

当前可保留的基础已经存在：

- TranscriptState 是唯一 presentation order/payload/index owner；
- TranscriptEntryId 使用 (turnId, itemId) 复合 identity；
- middle 由最多 100 个 identity 的 bounded chunks 承载；
- selector cache 与 chunk-level React module 保持旧 chunk 稳定；
- live item 与 completed item 在同一 identity、同一位置原位收敛；
- leading user、middle、final assistant 的 placement 语义已经稳定。

## 设计范围

本设计覆盖：

- transcript projection module 的外部写入 Interface；
- typed ThreadItem / ThreadProjectionDelta 的内部解释 seam；
- 单一 identity、lifecycle、placement、visibility、chunk 与 scroll owner；
- frontend presentation view 的读取 Interface；
- renderer 的唯一穷尽分发点；
- snapshot、realtime、completion 与 reconnect 的收敛约束；
- 后续 reasoning、command、collab/sub-agent 的接入边界；
- 与已回退 activity 实现和 unified lifecycle slot 方案的差异。

## 非目标

- 不在本次重构中展示 reasoning、command、collabAgentToolCall 或 subAgentActivity；
- 不设计子代理 Card 的文案、图标、颜色、折叠或交互；
- 不提供子代理线程导航、picker、nickname、role 或 liveness；
- 不修改 Rust、app-server、ThreadItem 或 ThreadProjectionDelta；
- 不为 command output、terminal interaction 或子代理状态伪造 GUI-local delta；
- 不替换 projection ingress、commit chain、subscription 或 replay owner；
- 不创建第二套 order、state、cache、slot、renderer sequence 或 preview store；
- 不提前增加没有真实 producer 和 renderer 的空 presentation variant；
- 不创建公共运行时 handler registry、plugin adapter 或兼容层；
- 不续跑任何历史设计或计划。

## 权威事实与派生路径

### 协议权威

权威输入继续直接来自生成的 @codex-protocol/v2：

- ThreadItem；
- ThreadProjectionEventNotification；
- ThreadProjectionDeltaNotification；
- ThreadProjectionAttachResponse；
- Turn。

对应 Rust 与生成 TypeScript 入口：

- codex-rs/app-server-protocol/src/protocol/v2/item.rs
- codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs
- codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts
- codex-rs/app-server-protocol/schema/typescript/v2/ThreadProjectionDelta.ts

frontend 不手写镜像 ThreadItem DTO，不把协议擦除成 unknown、broad record 或字符串类型。
允许使用 Extract、Pick、indexed access 等机械派生，并要求所有协议分派保持编译期穷尽。

### frontend domain model

TranscriptState 与 TranscriptEntryView 是 frontend-owned domain model，因为它们表达：

- presentation identity；
- leading/middle/final placement；
- visible contribution；
- transient/settled presentation；
- chunk revision 与 selector 稳定性；
- renderer 所需的前端语义。

它们不能只是对 ThreadItem 字段的重命名复制。转换必须从生成类型进入，并在一个明确 seam 中
穷尽解释每个 variant 是 present、reserve、update、remove 还是显式 ignore。

## 方案比较

### 方案一：单一通用 apply 输入

形状：

~~~ts
projectTranscript(state, input): TranscriptState
~~~

优点是 Interface 极小。

该方案单独采用时存在两个问题：

- 若 input 是新建的 frontend event union，容易复制现有 threadRuntime action 与生成协议 envelope；
- 若 apply 仍把 materialization、placement 或 scroll 决定返回给 caller，module 只是浅层转发。

此外，为纯函数返回完整 TranscriptState 可能与当前 Redux Toolkit / Immer 写入方式产生不必要的
state copy 语义变化。

### 方案二：公共 typed handler registry

形状：

~~~ts
type HandlerTable = {
  [K in ThreadItem["type"]]: ItemHandler<Extract<ThreadItem, { type: K }>>;
};
~~~

该方案显式表达类别能力，但公共 registry 会形成宽而浅的 Interface：

- caller 需要知道 handler capability；
- generated union 被再次列举；
- handler 容易各自拥有 placement、chunk、scroll 和 lifecycle；
- 当前没有运行时注册、替换或第三方扩展需求。

因此不建立公共 registry。typed handler 只允许成为 module 内部 seam。

### 方案三：现有调用方优化的混合 Interface

本设计采用该方案：

- 写入侧直接消费现有 threadRuntime actions；
- module 内部按生成协议进行私有、穷尽的 typed 分派；
- 中央 implementation 独占 identity、lifecycle、placement、visibility、chunk 和 scroll；
- 读取侧只暴露稳定的 presentation view 与 selector；
- renderer 不读取协议 lifecycle。

它保留小 Interface，同时避免新建 frontend transport envelope 或公共 registry。

## 推荐 module 形状

候选 module 名保持 transcriptState。它不是新建在现有 state 旁边的 coordinator，而是深化当前
transcriptStateSlice、transcriptEntryMaterialization、transcriptCommittedProjection、
transcriptLiveProjection 和 transcriptStateSelectors 组成的浅 module cluster。

### 写入 seam

概念 Interface：

~~~ts
type TranscriptInputAction =
  | ReturnType<typeof threadRuntimeAttached>
  | ReturnType<typeof threadRuntimeEventBuffered>
  | ReturnType<typeof threadRuntimeDeltasAccepted>
  | ReturnType<typeof threadRuntimeManualReconnectRequired>;

function reduceTranscriptInput(
  state: TranscriptState,
  action: TranscriptInputAction,
): void;
~~~

四种 action 都是当前真实 production caller，不新建 transcript 专用 action。

projection coordinator 继续负责：

- accepted input 顺序；
- pending delta 在结构事件前 flush；
- commit chain；
- subscription；
- replay disposition；
- dispatch。

transcript module 不重新验证 transport，也不创建第二个 ingress。

### 写入 seam 隐藏的 implementation

reduceTranscriptInput 内部统一隐藏：

- attach snapshot 全量重建；
- duplicate/replay no-op；
- original first item 记录；
- itemStarted reserve/present 决定；
- typed delta batch 分桶与应用；
- itemCompleted authoritative materialization；
- live/transient 到 committed 原位收敛；
- leading/middle/final placement；
- middle chunk 分配、移除与清理；
- visible count；
- chunk 与 entry revision；
- committed scroll key 与 live scroll pulse；
- reconnect global status。

slice caller 不再分别调用 appendStartedTranscriptItem、
applyCompletedTranscriptItem、materializeTranscriptItem 和
applyAcceptedProjectionDeltaBatch。

### 私有 typed policy seam

module 内部允许按真实类别拆分私有 policy，但这些 policy 不形成公共 Interface。

概念输出：

~~~ts
type ProjectedEntryChange =
  | { kind: "ignore" }
  | { kind: "reserve"; stored: StoredTranscriptEntry }
  | { kind: "present"; stored: StoredTranscriptEntry }
  | { kind: "remove" };
~~~

私有 policy 只负责：

- 从生成 ThreadItem 派生 typed presentation payload；
- 判断 started 是否 ignored、reserved 或立即可见；
- 应用该类型真实存在的 typed delta；
- 判断 payload 是否具有可见贡献；
- 从 completed 完整 item 产生 settled presentation。

私有 policy 不得：

- 追加或删除 chunk identity；
- 修改 leading/final membership；
- 决定跨 item 顺序；
- 更新 scroll signal；
- 建立类别专属 cache；
- 读取其他类别的 transient state；
- 产生 fallback entry。

中央 implementation 将 ProjectedEntryChange 应用到唯一 TranscriptState。

### 穷尽性

ThreadItem 分派必须显式覆盖当前所有 variants。暂不展示的 variant 也必须显式返回 ignore，
不能靠 default 或遗漏分支静默吞掉。

ThreadProjectionDelta 分派必须显式覆盖：

- agentMessage；
- reasoningSummaryText；
- reasoningSummaryPartAdded；
- reasoningText。

上游增加相关 variant 时，类型检查必须在该私有 seam 失败，迫使 frontend 明确选择 present 或
ignore。兼容新增但与现有消费无关的字段不需要人工制造失败。

## 唯一 state owner

TranscriptState 继续拥有：

- turnIds 与 turnsById；
- entriesById；
- middle chunks；
- entry-to-chunk index；
- leading/final membership；
- visible middle count；
- applied event bounded window；
- scroll signals；
- global status。

不得新增：

- activityEntriesById；
- reasoningOrder；
- subAgentPreviewOrder；
- lifecycleRecordsById；
- presentationSlotsById；
- parallel live array；
- renderer-owned sort or merge cache。

同一个 TranscriptEntryId 在任一时刻只有一个 stored payload。reserved、transient 与 committed
是同一 identity 的内部状态，不是三份并存记录。

具体字段形状属于 implementation 细节，但必须满足：

- hidden reserve 可以保持顺序，不产生可见 count；
- transient payload 保留类别类型，不统一成 transientText；
- completed 完整 item 覆盖 transient payload；
- 空 completion 能删除无可见贡献的 reserve；
- no-op 不使无关 chunk 或 selector 失效。

## placement policy

placement 与 item lifecycle 正交。

唯一具有特殊 placement 的类别是 message：

- 原始 Turn.items[0] 物化为 user message 时进入 leading；
- 不是原始首项的 user message 进入 middle；
- agentMessage.phase 为 final_answer 时进入 final；
- commentary 或 null phase 进入 middle。

所有可见非消息 presentation 默认进入 middle。

类别 policy 不能请求自定义 leading/final placement。这样未来增加 reasoning、command 或
sub-agent presentation 时，不需要扩展 placement 排除表。

message completed 后若权威 phase 改变，可以在 middle/final 间重新分类；identity 不变。
非消息项不发生该迁移。

## lifecycle 与可见贡献

通用结构生命周期：

~~~text
itemStarted
  → ignore | hidden reserve | visible transient
  → zero or more typed deltas
  → itemCompleted authoritative item
  → settled presentation | remove
~~~

约束：

- duplicate started 是 no-op；
- delta 只能更新已经存在且类型匹配的 identity，不创建幽灵 entry；
- completed-without-started 合法，并在完成项首次被观察时建立 identity；
- completed 完整 ThreadItem 是 committed 权威值；
- transient 与 committed 在相同 identity 和位置收敛；
- 首次可见贡献才增加 middle count 并触发 live scroll；
- hidden reserve 与空 delta 不产生 DOM、count 或 scroll；
- settled content change 触发 committed scroll key；
- snapshot 与 realtime 对同一 completed item 产生等价 presentation。

typed transient state 不要求所有类别都有 delta：

- agentMessage：可拼接文本；
- reasoning：按 summaryIndex/contentIndex 维护 typed sections；
- commandExecution：当前仅 started/completed 完整项，没有 projection output delta；
- collabAgentToolCall：依赖完整项 status 与 agentsStates；
- subAgentActivity：当前依赖完整项，不是持续流式状态。

## 读取 seam 与 presentation view

renderer 只通过 selectors 读取前端 presentation：

~~~ts
selectTranscriptTurnIds(root): readonly string[];
selectTranscriptTurn(root, turnId): TranscriptTurnLayout | null;
selectTranscriptChunk(root, chunkId): TranscriptChunkView | null;
selectTranscriptEntry(root, entryId): TranscriptEntryView | null;
selectTranscriptGlobalStatus(root): readonly TranscriptGlobalStatusView[];
selectTranscriptScrollSignals(root): TranscriptScrollSignals;
~~~

名称可以沿用当前公开 selector，关键 Interface 是：

- turn view 只暴露外层 placement membership；
- chunk view 只包含当前 chunk 的可见 presentation；
- entry view 不暴露 initialItem、delta index 或协议 event phase；
- renderer 不根据 transientText 长度推断可见性；
- hidden reserve 不进入 renderer view；
- selector 不 flatten 整个 turn。

## presentation union

目标 architecture 使用 frontend presentation discriminated union。每个 variant 必须表达真实的
前端展示语义，而不是复制整个 ThreadItem。

概念形状：

~~~ts
type TranscriptEntryView =
  | TranscriptMessageView
  | TranscriptStatusView
  | TranscriptReasoningView
  | TranscriptCommandExecutionView
  | TranscriptCollabAgentView
  | TranscriptSubAgentActivityView;
~~~

这不是要求首次重构立即创建全部 variants。

首次行为保持不变时，只保留当前有 producer 的 message/status view，并将其他 ThreadItem
显式归类为 ignore。某一类别真正启用时，必须在同一个可 type-check 的垂直切片中增加：

1. typed policy；
2. presentation variant；
3. 唯一 renderer 分支；
4. 对应 interface-level 行为覆盖。

不得提前增加空 variant、返回 null 的 renderer、占位 Card 或 test-only fake adapter。

## renderer seam

middle、leading 与 final 复用同一个穷尽 entry renderer：

~~~tsx
function TranscriptEntryRenderer({ entry }: { entry: TranscriptEntryView }) {
  switch (entry.kind) {
    case "message":
      return <MessageEntryRenderer entry={entry} />;
    case "reasoning":
      return <ReasoningEntryRenderer entry={entry} />;
    case "commandExecution":
      return <CommandExecutionEntryRenderer entry={entry} />;
    case "collabAgent":
      return <CollabAgentEntryRenderer entry={entry} />;
    case "subAgentActivity":
      return <SubAgentActivityEntryRenderer entry={entry} />;
    case "status":
      return <StatusEntryRenderer entry={entry} />;
  }

  entry satisfies never;
}
~~~

以上是目标形状示意，不授权首次重构创建尚未启用的 renderer。

MessageEntryRenderer 可以区分 plainText、staticMarkdown 和 streamingMarkdown，但不再读取
initialItem.type 或 projection lifecycle。

类别 renderer 只能消费对应 presentation payload。它不决定 placement、visibility、order、
scroll 或 lifecycle。

## equality 与 invalidation

当前 committedTranscriptChunkEquality 手写比较 message/status/live 字段，并在未知 variant
落到 return true。新增类型后这会静默阻止重渲染。

目标 owner 是 selector view identity 与 revision：

- 未变化 chunk 返回稳定 TranscriptChunkView 引用；
- 变化 entry 只使所在 chunk 的 revision 与 view 失效；
- renderer equality 不枚举每个 presentation variant 的领域字段；
- 若仍保留 comparator，它只能比较稳定 view identity/revision，并必须对 view union 保持穷尽；
- snapshot replacement 必须使内容变化的 view 失效，即使 identity 相同；
- 不能通过全 turn deep compare 修复 equality。

## 性能约束

- middle chunk 目标上限继续为 100 个 identity；
- append 或 update 单 item 不扫描整个 turn；
- chunk 内移除最多扫描当前 bounded chunk；
- delta batch 按 identity 与真实 delta 维度聚合，同一 bucket 每批最多 materialize 一次；
- 未变化 chunk 保持 selector reference 稳定；
- disclosure 折叠时不选择或挂载隐藏 chunk 内容；
- UI grouping 不把 chunks flatten 为完整 turn 数组；
- hidden reserve 不增加 visible middle count；
- typed transient payload 必须有展示大小硬上限；
- reasoning section、command output 或 agent state 集合启用前必须定义各自上限；
- 不在 Redux 中无界保存 raw delta history。

## snapshot、realtime 与 reconnect

### Snapshot

- 按 thread.turns 与 Turn.items 的权威顺序全量重建；
- 在 materialization 前记录 Turn.items[0]；
- completed item 使用与 realtime completion 相同的 typed materializer；
- 不从旧 GUI state 恢复已不存在的 preview；
- replacement attach 产生新 state 与新的 selector baseline。

### Realtime event

- 只消费 projection coordinator 已接受的顺序；
- duplicate commit 与 snapshot duplicate 保持 no-op；
- itemStarted、typed delta、itemCompleted 通过同一 identity owner；
- pending delta 的 flush 顺序继续由 coordinator 保证；
- transcript module 不自行重排跨 action 输入。

### Reconnect

- manual reconnect 保留当前 presentation，并追加现有 global interruption status；
- replacement attach 全量替换旧 state；
- 不维护 detached activity preview cache；
- 不从 TUI、composer 或 local storage 补造缺失的 lifecycle。

## reasoning、command 与 agent 类型接入边界

### Reasoning

协议已经具备完整 item 与三类 typed delta。未来接入时需要：

- typed summary/content transient state；
- index-aware delta merge；
- completed snapshot 收敛；
- reasoning presentation variant 与 renderer。

不需要新增 order owner或 Rust projection。

### Command execution

当前完整 item 足以展示 started/completed 与最终 aggregatedOutput。

实时 command output 与 terminal interaction 尚未进入 ThreadProjectionDelta。若产品要求实时输出，
必须先扩展 Rust projection contract，再由生成类型进入同一 typed delta seam。GUI 不得订阅另一条
私有通知并建立第二来源。

### CollabAgentToolCall

必须保留：

- tool；
- tool call status；
- senderThreadId；
- receiverThreadIds；
- prompt/model/reasoningEffort；
- agentsStates。

tool call status 与 agentsStates 中的 agent status 是两个不同维度，不能压成通用 status。

### SubAgentActivity

必须保留：

- kind：started/interacted/interrupted；
- agentThreadId；
- agentPath。

SubAgentActivity.kind 与 projection envelope 的 itemStarted/itemCompleted 是两个不同维度。

当前 MultiAgent V2 在动作成功后为同一个 SubAgentActivity 紧邻发射 canonical started/completed。
因此：

- 它可以表达一次领域事件；
- 它不能证明子代理仍在运行；
- 它不能单独驱动长期 spinner 或 liveness；
- started/completed 应在同一 identity 原位收敛，不能追加两条 GUI 历史序列。

未来子代理活动 preview 的接入方式：

1. 在私有 ThreadItem policy 中解释权威 SubAgentActivity 或 CollabAgentToolCall；
2. 产生 typed frontend presentation；
3. 由中央 owner 自动放入现有 middle；
4. 由唯一 TranscriptEntryRenderer 分发到专用 renderer；
5. 不修改 slice caller、placement、chunk、scroll 或 order Interface。

若产品需要持续变化的子代理状态，但现有 projection 没有对应事实，则先扩展 Rust projection。

## 与已回退实现的关系

### 已吸收

- canonical started/completed 作为共用结构入口；
- completed 完整 ThreadItem 作为 settled 权威值；
- 非消息默认进入 middle；
- typed content 与专用 renderer；
- 同一 identity 原位收敛；
- 历史实现中的产品文案和验收场景可作为后续产品设计证据。

### 已排除

activity 专属实现曾在以下位置复制类别知识：

- materialization；
- started takeover；
- committed upsert；
- order/membership；
- renderer；
- scroll；
- equality。

该结构随类别数增长，不能恢复。

unified lifecycle record 与 presentation slot 尝试则引入：

- 独立 lifecycle record；
- 独立 presentation slot；
- 新 coordinator；
- 新 authority/location 状态轴；
- 对现有 bounded chunk owner 的整体替换。

该结构范围过大，并已回退。本设计不复用其 state 形状。

当前设计与两者的区别：

- 深化当前 TranscriptState，而不是新增 activity owner；
- 保留当前 entriesById 与 bounded chunks；
- typed policy 是私有 seam，不拥有 order；
- renderer 接收 presentation view，不解释协议；
- 不建立旧新路径并存、双写、fallback 或 adapter；
- 首次重构保持产品行为不变，后续类别按垂直切片启用。

历史证据入口：

- docs/superpowers/research/2026/07/28/2026-07-28-codex-gui-message-centered-transcript-model-evaluation/current-findings.md
- docs/superpowers/specs/2026/07/28/2026-07-28-codex-gui-unified-transcript-lifecycle-design.md
- docs/superpowers/specs/2026/07/29/2026-07-29-codex-gui-message-placement-and-middle-order-design.md

## 测试 Interface

测试应穿过 production 写入与读取 seam，验证可观察 presentation，不把私有 helper 当作长期 Interface。

必须保持：

- 跨 turn 相同 raw item ID 隔离；
- started 顺序与乱序完成不重排；
- hidden reserve 首次可见贡献；
- live/transient 到 completed 原位收敛；
- leading/middle/final message placement；
- 100/101 bounded chunk 边界；
- 未变化 chunk selector 引用稳定；
- snapshot/realtime completed presentation 等价；
- replay、snapshot duplicate 与 reconnect；
- disclosure 折叠时不挂载隐藏内容；
- sticky-bottom 与用户主动上滚边界。

首次行为保持不变的重构中，暂不支持的非消息类型仍应显式 ignore。对应测试可以保留，但断言语义应是
“当前 policy 明确不展示”，而不是“所有非 assistant item 永远不可展示”。

某个新类型启用时，必须增加：

- snapshot 与 realtime materialization 一致性；
- started/transient/completed 原位收敛；
- typed delta 的顺序和分段语义，如该类型具有 delta；
- visible count 与 scroll signal；
- reconnect 后恢复；
- 跨 chunk 顺序与 selector stability；
- Browser DOM 顺序、可访问角色与折叠挂载；
- 同 ID 内容变化不会被 equality 静默吞掉。

测试不应锁定：

- 私有 policy 函数名；
- map 字段排列；
- 具体 chunk ID 算法；
- CSS class、padding、颜色或其他非稳定视觉参数；
- test-only handler registry；
- TUI 文案或 cell 结构。

## 错误模式

- 非当前 thread、snapshot duplicate、重复 commit、duplicate started：明确 no-op；
- 空 delta：no-op；
- delta 指向不存在的 live identity：保持当前 no-op 语义，不创建 fallback entry；
- 合法但不展示的 ThreadItem：私有 policy 显式 ignore；
- 上游增加需要处理的协议 variant：编译期失败；
- 非法 wire payload：继续在现有 GUI Host validator seam 拒绝；
- 内部 identity/chunk/index 不一致：测试中失败，不静默建立第二套状态或全量扫描修复；
- command/sub-agent 缺失实时事实：保持不展示或只展示权威完成态，不从其他缓存推断。

## 设计否决条件

出现以下任一情况说明实现偏离本设计：

- 新增第二套 activity/reasoning/sub-agent order 或 payload owner；
- 新增 lifecycleRecordsById 或 presentationSlotsById；
- caller 仍需判断 ThreadItem.type 才能选择 transcript helper；
- category policy 直接修改 chunk、placement 或 scroll；
- renderer 读取 initialItem 或 projection lifecycle；
- equality 按每种 payload 手写字段并允许未知 variant 默认相等；
- snapshot 与 realtime 使用不同 materializer；
- 用通用字符串承载 reasoning、command 或 agent 状态；
- 用 GUI-local input 补造 protocol 缺失的 command/sub-agent delta；
- 为迁移保留旧新双写、双读、fallback 或 adapter；
- flatten 全 turn 以完成 grouping、sorting 或 equality；
- 提前创建没有真实 producer 的 sub-agent preview variant 或空 renderer。

## 设计成功标准

- transcriptState 形成一个小写入 Interface 和稳定读取 Interface；
- slice caller 不理解 item category；
- generated protocol knowledge 集中在私有、穷尽的 typed seam；
- TranscriptState 仍是唯一 identity/order/payload/index owner；
- message placement 与 item lifecycle 可独立变化；
- renderer 不解释协议 lifecycle；
- 未变化 chunks 保持引用与 React 边界稳定；
- 当前用户可见行为保持不变；
- 后续启用 sub-agent activity 时，只需增加 typed policy、presentation variant、renderer 与对应测试，
  不修改通用 order、placement、chunk、scroll 或 slice Interface；
- 删除该 module 后，上述复杂度会重新散落到多个 caller，证明 module 具有实际 depth。

## 待确认

本设计确认后才能进入实施计划。计划必须基于当前 HEAD 重新形成，不得续跑历史计划。

设计确认不授权实施；实施必须在计划落盘并获得明确确认后开始。
