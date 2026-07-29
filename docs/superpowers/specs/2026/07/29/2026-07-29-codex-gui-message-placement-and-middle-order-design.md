# Codex GUI 消息位置与 middle 稳定顺序设计

日期：2026-07-29

状态：待确认

## 唯一主目标

保留现有 leading / middle / final 三段结构，以 Rust 投影的原始 `Turn.items` 顺序为唯一事实来源，
严格确定可选 leading，并让 middle 内全部 message 在 live / committed 转换期间保持稳定顺序。

## 背景

当前 transcript 同时保存两套互不相交的消息顺序：

- committed message 按 leading、middle chunks、final 三段保存；
- live assistant message 按 `liveItemsByTurnId` 数组保存。

renderer 固定按以下顺序输出：

```text
leading → committed middle → live assistant → committed final
```

因此多个 live message 交错完成时会改变视觉顺序：

```text
start A
start B                 => A(live), B(live)
complete B(commentary)  => B(committed middle), A(live)
```

顺序丢失的根因不是 React key，也不是单个 live 数组内部不稳定，
而是 live 与 committed 被建模成 middle 内两条独立展示序列。

leading 还有一个独立问题。当前分类发生在 materialization 之后，
只要 turn 尚无可见 entry 且当前 entry 不是 assistant，就会把它放入 leading。
如果 Rust 首项不可渲染，后续 user message 可能补位成为 leading。
这不等于 Rust `Turn.items[0]` 的事实。

leading 问题已经由 `f1cbe8503` 修复并保留在当前基线中，本设计不重新实现该修复。
当前 `HEAD` 为 `51a648cb1`，两版 middle order 实现均已完整回退；
当前产品代码仍由 committed middle chunks 与独立 `LiveAssistantMessages` 共同展示 middle。

两版失败实现分别证明了两个不可继续采用的方向：

- 不能在既有 committed middle order 之外新增平行 message order、view 与 cache；
- 不能先删除 state Interface，再把 renderer consumer 留到后续任务迁移。

本次重新设计从 renderer owner 反推最小 state seam，
只统一 message identity、placement contribution 与 middle presentation，
不替换现有 live payload、RAF、dedup、scroll 或 completed materialization owner。

## 已确认的产品决策

1. 保留 leading / middle / final 三段结构。
2. Rust 落盘后投影出的 `Turn.items` 及其顺序是 transcript 分类与排序的唯一事实来源。
3. 只有原始 `Turn.items[0]` 是可渲染 `userMessage` 时，它才进入 leading。
4. 原始首项不是可渲染 `userMessage` 时，leading 保持 `null`；后续任何 entry 都不能补位。
5. 后续 user message 属于 middle，不能提升到 leading。
6. `agentMessage.phase === "final_answer"` 属于 final。
7. `agentMessage.phase === "commentary"` 或 `phase === null` 属于 middle；本设计保持当前 GUI 的 null 分类。
8. middle 的稳定顺序覆盖其中全部 message，不区分 user / assistant，也不区分 live / committed。
9. delta 不创建 message 或顺序位置；它只能更新已经存在的 live message。
10. 缺少 `itemStarted` 的 completed message 在 completed 首次被观察时建立位置。
11. 不修改协议，不使用 GUI 请求状态、`clientUserMessageId` 或本地 origin 记录推断 leading。
12. 不处理 activity、reasoning、command、search 或折叠归档。
13. 不再保留独立的 turn-level `LiveAssistantMessages` renderer。
14. `MiddleTranscriptModule` 独占全部 live / committed middle message。
15. `FinalAssistantMessages` 独占全部 live / committed final message；live final 保持位于 Disclosure 外。
16. final 内部顺序继续沿用现状，不引入统一 final order。

## 重新设计提案约束（待确认）

1. 现有 live payload 与 committed payload 继续承担各自生命周期内容；本设计不把它们重写为统一 lifecycle record。
2. middle 只保留一套 message identity order；旧 committed-only middle order 不得继续作为第二 owner。
3. placement 解析与 leading、middle count、final membership 的更新必须由同一 Module 完成。
4. state Interface 与 renderer consumer 必须在同一个可 type-check 的垂直切片中切换，不保留兼容层。
5. 既有计划已经被回退实现证明不可执行；新版设计确认前不得继续该计划。

## 权威事实边界

### Snapshot

snapshot 中每个 `Turn.items` 数组是完整基线：

- 原始首项单独决定 leading 是否存在；
- message identity 按原始 item 顺序进入 message order；
- 不可渲染 item 仍可占据“原始首项”事实，但不创建可见 message；
- 过滤不可见内容后不得重新寻找 leading 候选。

### 实时 projection

实时路径只消费已经通过现有 ingress、subscription、commit chain 与 replay 检查的 Rust projection：

- 首次 `itemStarted` 建立 provisional item 顺序；
- 没有 started 时，首次 `itemCompleted` 建立顺序；
- 相同 identity 的 delta、completed、duplicate 或 replay 不改变顺序；
- `itemCompleted` 的完整 item 继续是文本和最终 phase 的权威值。

GUI request 参数、composer 状态、JSON-RPC request ID 和本地发送顺序都不参与 transcript truth。
reattach 后用 snapshot 全量重建，不能用旧 GUI 状态覆盖 Rust 基线。

## 推荐架构

本设计采用两个深 Module seam：

- 状态侧 `TranscriptMessageProjection` 位于“已接受的 projection 输入 → transcript message state”之间；
- 展示侧 `MiddleTranscriptModule` 位于“turn identity → 全部 middle presentation”之间。

前者集中 identity、order 与 placement contribution；后者隐藏 Redux selector、bounded chunk、
live / committed resolution 和 React key。两者都只服务当前 message，不形成通用 `ThreadItem`
lifecycle、presentation slot、renderer registry 或未来类型扩展点。

### Renderer Interface

`CommittedTranscriptTurn` 不再向 middle 传递 committed-only 状态：

```tsx
<MiddleTranscriptModule turnId={turn.id} />
```

`chunkIds`、`middleEntryCount`、final 折叠条件、live array、chunk revision、cache 与 equality
全部留在 `MiddleTranscriptModule` 的 implementation 内部。删除该 Module 后，这些知识会重新散落到
turn renderer、selector 与 row renderer，因此该 Interface 具有实际 depth 与 locality。

### State Interface

状态侧只暴露一个写入口和两个 renderer 读取入口。概念 Interface 为：

```ts
type TranscriptMessageProjectionInput =
  | { kind: "snapshot"; turns: readonly Turn[] }
  | { kind: "itemStarted"; turnId: string; item: ThreadItem }
  | { kind: "itemCompleted"; turnId: string; item: ThreadItem }
  | {
      kind: "deltaBatch";
      notifications: readonly ThreadProjectionDeltaNotification[];
    };

applyAcceptedTranscriptMessageProjection(state, input);
selectTranscriptMessageChunk(state, chunkId);
selectTranscriptMessagePresentation(state, messageKey);
```

`Turn`、`ThreadItem` 与 delta notification 直接使用 generated `@codex-protocol/v2` 类型；
本地 union 只表达 frontend workflow，不复制协议字段、variant 或 validator。

写入口只接收已经通过 thread、subscription、commit chain、replay 与 dedup 检查的输入。
wrong-thread 和 snapshot duplicate 仍由现有 ingress seam 拦截；Module 内只负责 message order、
payload transition 与第二层 identity 幂等。未知 turn、chunk 或 key 的读取返回 `null`，
未知 delta 为 no-op；不增加 runtime fallback 或兼容解析。

`selectTranscriptMessageChunk` 直接返回 store-owned bounded chunk；
`selectTranscriptMessagePresentation` 直接返回 store-owned committed entry 或 live item。
Interface 不暴露 membership、position、revision、cache、placement helper 或 key 编码函数。

### 稳定复合 identity

message identity 是 `(turnId, itemId)`，implementation 将其编码为调用方不可解析、不可构造的
`TranscriptMessageKey`。同一 key 必须贯穿：

- order chunk membership；
- committed payload map；
- live payload index；
- leading、middle 与 final membership；
- selector lookup；
- React key。

不能只让 order 使用 compound key，却继续用全局 `entriesById[itemId]` 保存正文。
committed payload 必须改为按 `TranscriptMessageKey` 索引；raw `itemId` 只作为协议字段保留在 payload 内。

### 唯一 message order

现有 committed-only middle chunks 直接替换为 message identity chunks，不能新增第二套平行 order：

```ts
type TranscriptMessageChunk = {
  id: string;
  turnId: string;
  messageKeys: string[];
};
```

每个 chunk 最多保存 100 个 key。它包含该 turn 中按 Rust 顺序首次观察到的全部
`userMessage` 与 `agentMessage` identity，包括 leading、middle、final 和暂不可见 message。
placement 变化只影响 presentation，不移动、删除或重新追加 identity。

state 只额外保存从 order 机械建立的 membership index，用于 O(1) 幂等检查和 tail append。
membership 是索引，不是第二个顺序事实；chunk 中的 key 顺序才是唯一 message order。

### Turn summary

`TranscriptTurn` 对 renderer 暴露的 message summary 概念形状为：

```ts
type TranscriptTurn = {
  originalFirstItemId: string | null;
  leadingPromptEntryKey: string | null;
  messageChunkIds: string[];
  middleEntryCount: number;
  liveFinalMessageKeys: string[];
  committedFinalMessageKeys: string[];
};
```

`originalFirstItemId` 继续保存已经落地的 Rust 首项事实；本设计不重开 leading 产品规则。
`middleEntryCount` 只统计当前可见 middle message；空 provisional identity 不计数。
live 与 committed final 分开保存 membership，以保持现有 live-first、committed-after 顺序，
但两者由同一个 placement owner 更新，不形成 middle 的第二套 order。

### Payload owner 保持分离

现有 live state 继续保存 started item、transient text、status 与 revision；
现有 committed materialization 继续生成最终 `TranscriptEntry`。本设计不把两者重写成统一 record。

分离的是生命周期内容，不是展示顺序：

- order chunk 只保存 identity；
- committed payload 与 live payload 只保存内容；
- placement owner 只维护当前可见贡献；
- renderer 按 key 解析一个 presentation。

同一 reducer transition 内两种 payload 若短暂同时存在，completed committed payload 获胜。

## 唯一 placement owner

`TranscriptMessageProjection` 内部只允许一个 resolver 和一个 contribution diff：

```text
读取旧 presentation contribution
→ 更新 live 或 committed payload
→ 解析新 presentation contribution
→ 原子更新 leading / middle count / final membership
```

presentation 解析规则为：

```text
可见 committed user 且命中原始首项 → leading
可见 assistant + phase=final_answer  → final
其他可见 message                    → middle
无可见内容                           → hidden
```

committed payload 优先于 live payload。live user message 沿用现状，不产生临时可见 presentation；
live assistant 只有 `transientText` 非空时可见，started item 自带文本不会替代 delta 内容。
`phase === null` 沿用当前 GUI 行为进入 middle。

只有 contribution diff 可以修改 `leadingPromptEntryKey`、`middleEntryCount`、
`liveFinalMessageKeys` 与 `committedFinalMessageKeys`。started、delta、completed handler
不得各自维护这些字段，从而消除 count、final membership 与 presentation 的分叉。

## 生命周期收敛

### itemStarted

- 先记录 Rust 原始首项事实（如果尚未建立）；
- `userMessage` 与 `agentMessage` 首次出现时按 accepted event 顺序追加 identity；
- 继续由现有 live payload implementation 保存 started item；
- 捕获更新前后的 contribution，只有可见性或 placement 变化时更新 turn summary；
- started 文本不直接显示；agent phase 只用于 provisional placement，不写成 committed truth；
- 已经存在 committed payload 时，迟到 started 是 no-op，不能把 message 降级为 live。

### Delta

- 只定位现有 live agent message；
- 按现有 RAF batch 和 transient text 规则更新内容；
- 未知 item ID 继续是 no-op；
- 不建立 order identity，不改变 order chunk；
- 空文本首次变为非空时，通过同一 contribution diff 增加 middle count 或 live-final membership；
- 已经可见的 streaming delta 只替换目标 live payload，不修改 turn summary 或无关 chunk。

### itemCompleted

- 若 identity 尚不存在，按当前 Rust 结构事件位置追加；
- 使用完整 completed item 替换或清除 committed payload；
- 在同一个 reducer transition 内清理同 identity 的 live payload；
- middle identity 原位从 live 解析为 committed，不从顺序索引删除；
- completed phase 改变 placement 时，由 contribution diff 同步更新 middle count 与 final membership；
- reducer 对外只暴露完成后的单一 presentation，不暴露 live 删除与 committed 写入之间的中间态。

### Duplicate、replay 与迟到事件

- 现有 ingress / reducer dedup 仍是第一道边界；
- message order 写入自身仍必须幂等；
- duplicate started / completed 不产生第二个位置；
- completed 后迟到的 started 不能把 authoritative message 降级为 live；
- 内容与 placement 未变化的 duplicate 不替换 store-owned presentation 引用；
- snapshot duplicate 不改变 snapshot 已重建的顺序；
- reattach 使用新 snapshot 完整替换 message order、payload 与 summary，不与旧 GUI state merge。

## React 与现有三段结构

`CommittedTranscriptTurn` 继续按 leading → middle → final 排列，但不再渲染独立的
`LiveAssistantMessages`：

```text
LeadingPromptEntry
MiddleTranscriptModule
FinalAssistantMessages
```

- `LeadingPromptEntry` 继续消费单个 stable key，但该 key 只由已经落地的 Rust 原始首项规则产生。
- `MiddleTranscriptModule` 的 external Interface 只有 `turnId`；它独占全部 live / committed
  middle message，并保留现有 Disclosure 与折叠条件。
- Module 内部先订阅 turn summary，再按 bounded `messageChunkIds` 挂载 chunk；
  chunk 只读取 stable key，row 按 key 订阅当前 store-owned presentation。
- live commentary / null-phase assistant message 在其 order identity 处渲染，不再经过独立的
  turn-level live list renderer。
- `FinalAssistantMessages` 独占全部 live / committed final message；live final 继续位于 Disclosure 外，
  保持现有可见位置与展示语义。
- final 区域内部仍沿用现有展示次序；本设计不为 live / committed final 引入统一 order，
  也不把 final 纳入 middle message order 的展示职责。

因此本设计不处理“turn 何时进入折叠器”或“结束后如何归档”的独立问题，
也不改变 `Intermediate updates` 的当前触发条件。

row selector 不创建 `{kind, payload}` 等临时 wrapper；它直接返回 store-owned committed entry
或 live item。presentation 未变化时引用自然稳定，renderer 通过对象自身形状选择
`MarkdownText`、`LiveMarkdownText` 或 plain-text presentation。

旧 `TranscriptChunkView`、`transcriptChunkViewCache`、`areTranscriptChunkViewsEqual`
及其专用测试失去职责后直接删除，不保留 adapter、fallback 或第二条 equality seam。

## 性能边界

- 首次 message observation：membership lookup + tail append，均摊 `O(1)`。
- delta、已知 identity completion、duplicate：order lookup 为 `O(1)`，不执行 merge / sort。
- snapshot rebuild：按 `Turn.items` 单次 `O(item count)` 重建。
- renderer 只订阅 bounded message chunk 和 per-message presentation，不 flatten 整个 turn。
- order chunk 对象只在首次追加 identity 时改变；delta 与已知 completion 不改变 chunk。
- 单条 streaming delta 只更新目标 live payload 与 row；不得推进任何 order revision。
- 未变化 chunk、turn summary、sibling presentation 与 React subtree 保持引用稳定。
- 首次可见 delta 或 placement migration 允许更新目标 row 与 turn summary，但不重建 order。
- 额外空间为每条 message 一个 ID 与一个 membership 位置，整体 `O(message count)`。

## 测试 Interface

state 测试与 renderer 测试必须穿过生产使用的 Interface，不把内部 membership、revision、
exact state object 或 cache 形状作为主要断言面。

state Interface 需要证明：

- snapshot、started、completed-without-started 只建立一次 identity；
- unknown delta 不建位，known delta 不改变 order chunk；
- 空 started 经首次非空 delta 后 middle count 从 0 变为 1；
- live → committed 保持同 key、同位置、同一份可见贡献；
- commentary ↔ final migration 同步更新 middle count 与两类 final membership；
- 两个 turn 使用相同 raw item ID 时，payload、selector 与 React identity 仍隔离；
- 无关 action、其他 turn 更新与 sibling delta 不改变未受影响的 store-owned selector 引用；
- 100 / 101 identity 保持 bounded chunk 与旧 chunk 引用稳定。

Browser Mode 只验证用户可见结果：交错完成顺序、单次渲染、Disclosure count、live final 位置、
后续 user message、`phase === null`、collapsed lazy mount 与 101 条边界。
不为内部字段、具体 helper 或已删除的 equality seam 增加重复测试。

## 方案取舍与规模

本设计拒绝纯 selector-derived view，因为 count 与 placement 会回到 streaming hot path；
也拒绝把 live / committed payload 重写为单个 lifecycle record，因为当前目标不需要承担该迁移成本。

推荐形状保留 payload owner，只替换 identity/order/placement 与 renderer seam。预计生产代码约
250–350 changed lines，聚焦测试约 200–300 changed lines，总量约 450–650 changed lines。
这是设计阶段估算，不再承诺旧计划的 500 行总硬上限；实施计划必须在每个实际任务编辑完成后、
格式化和提交前统计，不能等后续任务再发现已经超限。生产复杂逻辑自身仍必须保持在 500 行以内。

## 保持不变

- authoritative generated `@codex-protocol/v2` contract；
- Rust/app-server 持久化与 projection；
- completed item 的内容权威性；
- agent message delta RAF batch 与 transient text 累积；
- bounded dedup、subscription、replay 与 reconnect 入口；
- committed entry materialization；
- live payload array、compound lookup、RAF delta batching 与 live scroll pulse owner；
- leading / middle / final 的外层布局；
- Disclosure、scroll、sticky-bottom，以及 live final 位于 Disclosure 外的现有可见位置与展示语义。

## 非目标

- 不修改 `verified-v0.145.0` tag。
- 不修改 Rust、app-server、协议 schema、generated TypeScript 或 runtime validator。
- 不以 GUI composer、request ID、`clientUserMessageId` 或 local storage 建立 transcript truth。
- 不创建通用 presentation slot、统一 lifecycle coordinator 或未来类型 registry。
- 不把 live / committed message payload 合并成新的统一 lifecycle record。
- 不接入 activity、reasoning、command、search 或其他 `ThreadItem`。
- 不设计 turn 结束后的折叠归档。
- 不重构 final message 内部顺序，不引入统一 final order，也不修改 scroll policy 或 delta ownership。
- 不为未来 command output 预留 projection 或 renderer interface。

## 被拒绝的方向

### Renderer 临时拼接并排序 committed / live

两条数组已经丢失跨状态位置；render 时 merge / sort 既没有可靠 ordinal，
又会在 streaming hot path 反复扫描完整 turn，不能解决根因。

### 平行 message order、view 与 cache

第一版失败实现已经证明，保留 committed-only middle chunks 再新增 message order chunks
会产生双写、双读、同步与引用稳定责任。本设计直接替换旧 order，不允许并存。

### 先改 state Interface、后迁移 renderer

第二版失败计划已经证明，先删除旧 `TranscriptChunkView`，却把仍读取 `.entries` 的 renderer
留到后续任务，会形成不能 type-check 的断层。state Interface、生产 selector、
`MiddleTranscriptModule` 与旧 renderer 删除必须在同一垂直切片完成。

### 使用 live array index

completion 会 splice live item 并重写后续 index；该 index 只表示当前 live 数组位置，
不能成为跨 live / committed 的稳定 identity。

### 使用首个可渲染 user message 补 leading

过滤会抹掉 Rust 原始首项事实，并允许后续 user message 补位，违反已确认语义。

### 使用 GUI origin 或 `clientUserMessageId`

它们不是 Rust 落盘事实，也不能可靠覆盖 snapshot、history 和其他客户端写入的 turn。

### 统一所有 `ThreadItem` lifecycle

此前失败尝试已经证明该范围会牵动 projection、state、placement、renderer、scroll 与 reconnect，
并为尚未接入 GUI 的类型预建无法验证的抽象。本设计只增加当前 message 缺陷所需的顺序事实。

### 合并 live 与 committed payload owner

单个 lifecycle record 可以提供更强的内部一致性，但会重写已经工作的 RAF、live index、
committed materialization 与大量生命周期测试。当前缺陷只要求统一 identity/order/placement
与 renderer owner；继续保留两个内容 owner、由一个 resolver 选择 presentation，范围更小。

## 验收不变量

- snapshot 首项是可渲染 user message 时，它是唯一 leading。
- snapshot 首项不可渲染或不是 user message 时，leading 为 `null`；后续 user message 在 middle。
- `start A → start B → complete B(commentary)` 始终显示 A、B。
- A、B 以相反顺序完成后，middle 仍按首次 Rust item 顺序显示。
- live commentary 与 committed commentary 可以交错，但只存在一条 middle 顺序。
- order、committed payload、live index、selector 与 React key 使用同一 compound identity；
  两个 turn 的相同 raw item ID 互不覆盖。
- `MiddleTranscriptModule` 是 live / committed middle message 的唯一 renderer owner；
  turn 不再渲染独立的 `LiveAssistantMessages`。
- `FinalAssistantMessages` 是 live / committed final message 的唯一 renderer owner；
  live final 继续显示在 Disclosure 外，位置与语义不变。
- final 内部顺序沿用现状，不因 middle order 设计获得新的统一 order。
- `phase === null` 的 assistant message 在 middle。
- delta 找不到 started identity 时不创建 message 或位置。
- 空 started 经首次非空 delta 后立即计入 middle 或 live final，后续 settlement 不重复计数。
- completed-without-started 在首次观察位置出现一次。
- commentary ↔ final migration 原子同步 middle count、live final 与 committed final membership。
- duplicate、replay、reattach 不产生重复 identity，不移动已有顺序。
- turn 首项与 message 顺序均可从 snapshot 重建，不依赖 GUI 请求历史。
- 100 / 101 identity 继续跨有界 chunk，单条 delta 不改变 order chunk 或无关 selector 引用。
- row selector 直接返回 store-owned payload；无关 action 后返回值保持引用相等。

## 设计完成边界

本设计只定义 message placement 与 middle 稳定顺序。
对应实施计划必须保持这一边界，不得把 activity、折叠归档、final 顺序、协议修改或统一 lifecycle
作为“顺手补齐”的任务加入。

现有 `docs/superpowers/plans/2026/07/29/2026-07-29-codex-gui-middle-message-order.md`
基于已经失败的 Interface 与任务拆分，不能继续执行。只有本设计落盘并被用户明确确认后，
才能另行重写计划；计划不得复用旧 Task 1 / Task 2 的跨 Interface 断层。
