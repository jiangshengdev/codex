# Codex GUI 统一 transcript lifecycle 设计

日期：2026-07-28
状态：已确认（2026-07-28）

## 唯一主目标

重新设计当前 `dev` 的 transcript 模型：由消息承担 leading prompt、commentary 和 final answer
的特殊语义，由一个统一的 `ThreadItem` lifecycle module 承载 snapshot、started、类型化中段更新和
completed；本次只恢复已经验收过的 activity 用户行为，不增加 reasoning、命令行或搜索 UI。

## 已确认决策

- activity 的用户可见行为保持不变，只替换内部架构。
- activity 仍是独立、按首次可见顺序排列的 middle item，不依附某条 assistant message。
- 本次只交付 activity；reasoning、`commandExecution`、`webSearch` 只约束扩展 seam。
- 统一 lifecycle 控制面覆盖现有消息管线，而不是保留 message 与 non-message 两套控制流。
- `verified-v0.145.0` 只是前期比较基线，不限制本设计可以调整哪些现有代码或 state 结构。
- completed 完整 `ThreadItem` 始终是最终权威值；transient update 不成为 committed truth。
- snapshot 与实时事件使用同一套 presentation policy，最终 presentation 必须收敛一致。
- 保持 chunk、selector cache、折叠不挂载、sticky-bottom、reconnect 和 bounded dedup 约束。

## 当前状态与历史边界

本设计落盘时，当前 HEAD 是 `fb32a6df18a4`。以下四个 activity 实现提交已经被本地 revert：

- `f1334a10e`：activity materialization；
- `22876c391`：activity transcript projection；
- `cfda1eaab`：activity lifecycle；
- `7e00bca2b`：activity Card rendering。

因此当前代码已经回到没有 activity 展示实现的状态。上述提交及其测试只作为已经人工验收的产品行为
证据，不作为必须恢复的内部结构。

本设计基于以下材料：

- [消息中心 transcript 模型评估](../../../../research/2026/07/28/2026-07-28-codex-gui-message-centered-transcript-model-evaluation/current-findings.md)；
- [旧 activity 设计](../26/2026-07-26-codex-gui-parent-subagent-activity-display-design.md)；
- [旧 activity 计划](../../../../plans/2026/07/26/2026-07-26-codex-gui-parent-subagent-activity-display.md)；
- [streaming 总设计](../03/2026-07-03-codex-gui-streaming-support/00-overall-design.md)；
- [live slot state 设计](../03/2026-07-03-codex-gui-streaming-support/02-a-live-slot-state-boundary-design.md)；
- [completed settlement 设计](../03/2026-07-03-codex-gui-streaming-support/02-c-completed-settlement-design.md)；
- [snapshot/reconnect 设计](../03/2026-07-03-codex-gui-streaming-support/02-d-attach-snapshot-reconnect-replay-convergence-design.md)；
- [delta RAF batch 设计](../03/2026-07-03-codex-gui-streaming-support/02-f-projection-delta-raf-batch-design.md)。

前期 research 中“verified 基线不属于修改范围”的表述，已被用户在设计访谈中明确纠正。本设计记录
的是最新决策：只保持已确认行为和协议不变量，不保护旧代码形状。

## 问题定义

当前 transcript 有两个正交维度：

1. item lifecycle：snapshot / started / typed updates / completed；
2. turn presentation：leading prompt / chunked intermediate timeline / final answer。

旧 activity 实现把两者绑在 activity 类型上：消息走 live state，activity started 直接写 committed
middle，completed 再走 activity 专用 upsert。这样继续加入 command 或 reasoning 时，每种类型都必须再次
决定使用哪套状态、滚动、revision、reconnect 和 selector 路径。

设计要统一的是 lifecycle 控制流，不是把所有 payload 统一成字符串，也不是把所有 item 伪装成消息。

## Authoritative contract

authoritative source 继续是 generated `@codex-protocol/v2`：

- `ThreadItem` 定义完整 item union；Rust source 位于
  `codex-rs/app-server-protocol/src/protocol/v2/item.rs:223-391`；
- `ItemStarted` 与 `ItemCompleted` 都携带完整 `ThreadItem`；见同文件
  `:1225-1235`、`:1299-1309`；
- `ThreadProjectionEvent` 只有结构性 started/completed 等事件；
- `ThreadProjectionDelta` 当前只包含 agent message 与 reasoning 的类型化中段；见
  `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs:97-131`；
- command output 与 terminal interaction 尚未进入 thread projection；见
  `codex-rs/app-server/src/thread_projection.rs:486-535`。

GUI 不新增 protocol mirror、宽泛 record、runtime validator 或兼容 DTO。所有 policy 输入直接使用
generated union，或使用 `Extract<GeneratedUnion, { type: ... }>` 机械派生。协议新增 variant 时，私有
exhaustive dispatch 必须编译失败，要求明确决定 visible 或 hidden。

## Design It Twice 比较

### 方案一：单一 `apply(input)` union

只暴露一个入口，把 snapshot、event、update batch 包装成 frontend-owned union。

优点是 interface 最小，Redux caller 几乎不包含编排知识；缺点是额外复制一层输入 envelope，并把来源不同、
错误语义不同的三类 authoritative 输入压成一个本地 union。interface 行数虽少，调用者仍需构造 wrapper，
depth 并没有同比增加。

### 方案二：公共 capability registry

为每个 `ThreadItem["type"]` 和 `ThreadProjectionDelta["type"]` 注册 started、update、completed handler。

优点是未来扩展显式；缺点是当前只有 message 与 activity 两种真实 presentation，公共 registry 会把内部
编排规则暴露给调用方，形成宽而浅的插件 interface。大量 hidden handler 也会让 protocol union 看起来像
被 GUI 再声明一次。

### 方案三：Redux reducer installer

只暴露 `installTranscriptRuntimeReducers(builder)`，让 slice 一行安装全部行为。

优点是最常见 caller 最简单；缺点是 external seam 与 Redux action creator 强绑定，使 lifecycle module
无法直接以 authoritative projection 输入作为测试面。Redux 是当前 transport，不应成为 domain interface。

### 推荐：三个 authoritative 输入入口 + 私有 policy seam

采用三入口 interface，分别对应真实存在的输入通道；module 内使用私有、穷尽的 message/activity policy。

该方案兼有：

- interface 小且不复制 protocol envelope；
- snapshot 与 realtime 是两个真实 input adapter，共享同一 implementation；
- 类型差异具有 locality，但不暴露公共 registry；
- Redux slice 只路由，不编排 lifecycle；
- 测试直接穿过与生产 caller 相同的 seam。

## Deep module 与 external interface

新 deep module 暂称 `transcriptLifecycle`。名称是设计语义，不是计划中的最终文件名。

示意 interface：

```ts
replaceFromSnapshot(state, acceptedAttachPayload): void
applyAcceptedEvent(state, notification, replay): void
applyAcceptedUpdates(state, notifications): void
```

参数类型必须直接取自现有 generated contract 或 Redux action payload 的机械索引类型，不另外声明一套字段
列表。三个入口分别承担：

- `replaceFromSnapshot`：accepted attach 的全量 replacement；
- `applyAcceptedEvent`：已经通过 ingress 与 commit-chain 检查的结构性 event；
- `applyAcceptedUpdates`：已经通过 ingress、按 frame 保序 flush 的 typed update batch。

external interface 不暴露：

- live/committed/activity handler；
- placement、chunk、scroll 或 revision helper；
- lifecycle registry 或 handler registration；
- React renderer；
- snapshot/realtime 的两套 materializer。

删除这个 module 后，identity、dedup、ordering、snapshot rebuild、started/update/completed、placement、
revision 与 scroll 会重新散落到 reducer 和多个 projection helper，因此 module 具备实际 depth。依赖全部是
in-process state 与纯 materialization，不需要 port 或可注入 adapter。

## Internal seams

implementation 内部允许以下私有 seam：

```text
accepted snapshot adapter ─┐
                           ├─> lifecycle coordinator ─> placement engine
accepted realtime adapter ─┘              │
                                          ├─> message policy
                                          └─> activity policy
```

snapshot 与 realtime 是两个真实 adapter：输入形状不同，但必须产生同一 authoritative presentation。
message 与 activity 是两个真实 policy implementation：内容和可见时机不同，但不拥有各自的 lifecycle
控制流。

这些 internal seam 不出现在 external interface。lifecycle 正确性必须通过 external seam 验证。只有当
activity presentation 本身形成被 coordinator 真实调用的独立 production module 时，测试才可以穿过它的
production interface；不得为了测试新增导出或暴露 implementation helper。

## Lifecycle record 与 presentation slot

统一状态以 `(turnId, itemId)` 作为 identity，分开表达 lifecycle 与 presentation：

```ts
type TranscriptLifecycleRecord = {
  key: string;
  turnId: string;
  itemId: string;
  initialItem: ThreadItem;
  status: "started" | "updating";
  presentationSlotId: string | null;
  typedTransientState: TranscriptTypedTransientState;
  revision: number;
};

type TranscriptPresentationSlot = {
  id: string;
  turnId: string;
  location: "leading" | "intermediate" | "final";
  authority: "transient" | "authoritative";
  content: TranscriptPresentation;
  revision: number;
};
```

以上是 frontend domain model，不是 protocol mirror：它表达 GUI 的 lifecycle、位置、权威性和渲染语义。
具体 state 字段名属于后续计划与实现，但以下语义属于设计约束：

- started 可以建立 lifecycle record，而不必立即可见；
- item 首次可见时创建唯一 presentation slot，并确定 `visibleOrder`；
- update 只能更新已有 record/slot，不能创建幽灵 item；
- completed 使用完整 item 收敛同一 identity；
- completed 后 transient state 被清除，slot 变为 authoritative；
- completed-without-started 在 completed 到达时创建 authoritative slot；
- activity 的 intermediate slot 一旦可见不移动；
- streaming assistant message 与 activity 使用同一 intermediate timeline；
- message slot 在 completed 确认 `phase` 后，commentary 保留原 intermediate 位置，final answer 转入 final，
  但保持相同 logical identity；
- settled lifecycle record 可以清理，presentation slot 继续表达历史。

intermediate chunks 保存 presentation slot ID，而不是把“chunk”与“completed activity”绑定。chunk 是 UI
presentation/performance 结构；slot 的 `authority` 才表达 transient 或 authoritative。这样 wait started 可以
进入 intermediate 又不被谎称为 completed content；streaming message 也不再需要与 activity 平行的
turn-level live array。

## Message-centered placement

placement engine 只接受 message policy 的特殊分类请求：

- 第一条可见 user message 可以成为 leading prompt；
- assistant message 的 `phase === "final_answer"` 进入 final；
- assistant commentary 与其他 message 进入 intermediate；
- streaming assistant message 在 phase 权威值到达前位于 intermediate timeline；
- activity 与未来其他可见 non-message 永远默认进入 intermediate；
- non-message 不占 leading/final，也不阻止后续 user message 成为 leading。

因此基础设施不维护 `activity/reasoning/command/...` 排除表。消息是唯一具有 turn placement 语义的
presentation；其他类型只提供自己的内容。

## Ordering

- item 的显示顺序以首次可见时刻为准；
- policy 在 started 可见时，started 确定 slot 顺序；
- policy 只在 completed 可见时，completed 确定 slot 顺序；
- typed update 不得为缺失 record 创建 slot；
- streaming message、activity 和 commentary 共用同一 intermediate `visibleOrder`；不同类型不得因落在不同
  state 容器而在 DOM 中重排；
- 同一 slot 的 update/completed 只更新内容和 revision，不改变 activity 或 commentary 的 intermediate
  位置；
- message completed 为 commentary 时保留首次可见位置；completed 为 final answer 时从 intermediate 索引
  移除并进入 final，这是 message `phase` 语义允许的唯一跨 location transition；
- snapshot 严格按 `turns[]` 与 `turn.items[]` 顺序重建可见 slot；
- 同一个 update batch 保持 notification 顺序，并按 item 隔离 coalescing；
- 不按 completed 到达顺序重新排列已经可见的 item。

该规则保持 wait started→completed 原位收敛，也保持 completed-only activity 在实际可见时加入。

## Message policy

message policy 私有负责：

- user input 到 message presentation 的机械提取；
- agent message started lifecycle；
- `agentMessage` delta 的按 item、按 batch 保序合并；
- transient Markdown source；
- completed `text` 与 `phase` 的权威替换；
- intermediate 到 commentary/final 的 placement settlement；
- 空文本与当前 source-kind 语义。

它不负责 event dedup、snapshot replacement、chunk 分配、scroll 或 React。reasoning delta 不得进入 message
policy；未来 reasoning 必须拥有自己的 typed policy。

## Activity policy

activity policy 私有接受从 authoritative `ThreadItem` 机械提取的
`collabAgentToolCall | subAgentActivity`，只返回 activity presentation 或 hidden：

- `SubAgentActivity::Started / Interacted / Interrupted` 保持原有标题；
- wait 与 resume 的既有 in-progress 状态在 started 可见；
- spawn/send/close 等当前不可见的 in-progress 状态不创建 slot；
- visible started 的 completed 在同一 intermediate slot 原位收敛；
- completed-only activity 在 completed 时加入；
- activity 继续归入 `Intermediate updates`；
- sender ID、item ID、`agentThreadId` 不进入文案；receiver ID 仅在现有文案规则要求时显示；
- 当前缺 receiver/state 时继续使用泛化文案，不从其他 state 推断；
- prompt/completed/error 继续使用 `160/240/160` grapheme 上限；
- collection detail 必须在进入 slot 前有明确的行数和总文本硬上限，不能把 protocol collection 无界搬进
  presentation state。

activity policy 不知道 intermediate chunk、slot location、Disclosure、scroll key 或 HeroUI。

## Snapshot、reconnect 与 replay

accepted attach 是全量 replacement：

- 替换 thread/subscription 对应的 presentation generation；
- 清除旧 transient lifecycle、旧 dedup window 和旧 reconnect status；
- 从 snapshot turns/items 重建 authoritative current presentation；
- 不恢复或伪造丢失的 transient delta；
- snapshot 中可表达的 in-progress activity 由同一 activity policy 得到当前可见状态；
- snapshot completed item 与 realtime completed item 使用同一个 authoritative materialization。

`snapshotDuplicate`、已经应用的 `commitId` 与重复 started 都是完整 no-op：不改变 slot、revision、selector
identity 或 scroll signal。manual reconnect 只增加连接中断状态，不破坏已有 presentation；下一次 accepted
attach 才完成 replacement。

dedup window 保持硬上限 500。typed update 没有 commit ID，不进入 event dedup window；它只能命中当前
subscription 下已经存在的 lifecycle record。

## Error semantics

- malformed payload 继续由 projection ingress/validator 拦截；
- lifecycle module 仍必须将输入的 thread/subscription 与当前 attached state/generation 比较；wrong thread、
  stale subscription 或跨 attach generation 的输入是完整 no-op，不能只依赖 ingress 的早期检查；
- unsupported generated item 由 exhaustive private dispatch 明确返回 hidden；
- update 缺少 lifecycle record 时按既有 projection 语义 no-op，不补建 slot、不从 delta 猜初始 item；
- update 类型与 lifecycle item 不匹配属于 invariant violation，测试必须使其可观察，production 不做静默
  compatibility 或 payload coercion；
- completed 缺少 started 仍是合法收敛，直接使用 completed authoritative item；
- completed 与 transient 内容不一致时无条件使用 completed item，不增加 mismatch fallback。

本设计不新增 reconnect reason，也不让 GUI 通过猜测修补协议缺口。

## Revision、selector 与 scroll

通用基础设施只理解 slot identity、location、authority 和 revision，不比较 activity `title/details`：

- slot 内容实际变化时才推进 slot revision；
- intermediate slot 变化只推进所属 chunk revision；
- 其他 chunk 和其他 turn selector 结果保持引用稳定；
- snapshot replacement 改变 presentation generation，避免不同 snapshot 都从 revision `0` 开始时错误复用；
- revision 是快速拒绝条件，不是内容相等证明；generation、slot IDs/revisions 和 rendered presentation 共同
  决定 view 是否相等；
- chunk 继续最多包含 100 个 slot；
- selector 不 flatten 整个 turn，也不把隐藏内容提前 materialize。

scroll 不再以“activity 必须用 committed key、message 必须用 live pulse”作为 interface。lifecycle module
产生通用 visible-presentation change impact：

- hidden/no-op 不触发；
- started 首次可见、typed update 可见变化、completed 可见收敛触发；
- 每个 update batch 对每个受影响 slot 最多推进一次 slot revision；
- sticky-bottom hook 继续决定用户不在底部时不强制拉回；
- attach replacement 使用 generation/reset signal，而不是模拟逐 item scroll。

具体 signal 字段名属于实现，不属于 external interface。

## Rendering seam

renderer 只消费 `TranscriptPresentation`：

- message renderer 只理解 message presentation；
- activity renderer 只理解 activity title/details；
- activity 继续使用 HeroUI v3 `Card variant="transparent"`、`role="article"` 与确定性 accessible name；
- activity 没有交互控件、链接、导航或 liveness；
- middle disclosure 没有 final answer 时展开，出现 final answer 后沿用 `Intermediate updates`；
- 折叠时不挂载隐藏 slot；一个 turn 跨多个 chunk 仍只有一个 disclosure。

renderer 不读取 raw `ThreadItem`，不决定 lifecycle 或 placement，也不查询子线程补齐信息。

## Performance 与 boundedness

- snapshot rebuild 为 `O(items)`；
- started/completed 通过 `(turnId, itemId)` 索引摊销 `O(1)`；
- update batch 为 `O(notification count + payload bytes)`；
- 同一 item 在一个 batch 内只进行一次 presentation materialization 与一次可见 revision 推进；
- middle chunk 上限保持 100；
- dedup history 上限保持 500；
- hidden activity 不创建 slot；
- 折叠内容不挂载；
- activity 文本与 collection 均在 policy 内有硬上限；
- 不为未来类型保存 raw update history，不建立无界 event journal。

## 验证 seam

设计定义四层验证职责，但不在本轮形成实施任务或命令清单。

### Lifecycle module interface

通过三个 external entry points 黑盒验证 message/activity 共用的：

- snapshot 与 realtime 收敛；
- started/update/completed；
- completed-without-started；
- duplicate started、commit dedup、snapshotDuplicate；
- first-visible ordering 与 activity 原位收敛；
- reconnect replacement；
- chunk/revision/scroll impact。

测试不得断言 activity 必须位于旧 `entriesById` 或不得位于旧 `liveItemsByTurnId`。

### Activity policy contract

集中验证文案、可见/hidden 状态、receiver 顺序、隐私字段、grapheme/collection bounds。默认通过 lifecycle
external interface 验证；只有 activity presentation 已经是 coordinator 使用的独立 production module 时，
才直接测试它的 production interface。不得增加 test-only export，也不测试内部小 helper。

### Selector/cache contract

验证无变化保持引用、所属 chunk 局部失效、snapshot generation 隔离、同 revision 内容差异不误判。

### Browser rendering

只保留代表性集成覆盖：transparent Card、wait started→completed、activity/commentary DOM 顺序、final 后
折叠且隐藏内容不挂载、跨 chunk 单 disclosure。完整文案矩阵不在 browser 重复。

## 非目标

- 不增加 reasoning、command、search、MCP、file change 的具体 presentation 或 renderer；
- 不修改 Rust/app-server protocol，不把 command output 补入 projection；
- 不增加子线程订阅、导航、liveness、完整 transcript 镜像或终态推断；
- 不改变已确认 activity 文案、展示时机、原位收敛或折叠行为；
- 不建立公共插件 registry、runtime protocol validator 或 frontend-owned contract mirror；
- 不在设计文档中列 implementation task、具体文件修改顺序、验证命令或提交边界；
- 不创建或更新 implementation plan。

## 与旧设计和计划的关系

2026-07-26 文档中的以下内容继续有效：

- activity 产品范围与文案语义；
- wait started→completed 原位收敛；
- activity 属于 middle/`Intermediate updates`；
- generated `ThreadItem` 是 authoritative contract；
- HeroUI Card、accessibility、grapheme 截断和 chunk 性能约束；
- 已验收测试场景。

以下架构不再有效：

- 独立 `activity` lifecycle 管线；
- started activity 直接侵入 committed projection；
- `entry.type === "activity"` 的 placement 排除逻辑；
- activity 专用 scroll/equality/state 路径；
- 围绕旧结构拆分的 2026-07-26 implementation tasks。

旧文档保留为历史，不覆盖、不删除。本设计一经用户确认，将成为后续计划的唯一设计依据；在确认前不得
创建计划，在计划另行确认前不得实现。
