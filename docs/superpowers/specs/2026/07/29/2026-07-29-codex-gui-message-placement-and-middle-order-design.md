# Codex GUI 消息位置与 middle 稳定顺序设计

日期：2026-07-29

状态：已确认

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

## 最小状态模型

本设计不引入通用 `ThreadItem` lifecycle、presentation slot、placement engine 或 renderer registry。
只增加两类 message 所必需的轻量事实。

### 原始首项事实

每个 `TranscriptTurn` 需要记住 Rust 原始首项 identity，而不是“第一个 materialized entry”。
该事实可以由 snapshot 的 `items[0]` 或实时接受的首个结构 item 建立，建立后不补位、不改写。

它只回答：某个可渲染 user message 是否有 leading 资格。
它不保存 GUI origin，不负责 middle 顺序，也不把不可见 item 物化成 transcript entry。

### Message order

增加 message-only、按既有上限分块的顺序索引。概念形状如下：

```ts
type TranscriptMessageOrderChunk = {
  id: string;
  turnId: string;
  itemIds: string[];
  revision: number;
};
```

每个 turn 只保存该 order chunk 的 ID；state 另外保存：

- order chunks；
- `(turnId, itemId) → order position` 的 membership index。

该索引只记录 `userMessage` 与 `agentMessage` 的 identity 和 Rust 顺序，
不复制 `ThreadItem`，不保存文本，不拥有 live / committed payload，也不决定 React 组件。

核心不变量：

- snapshot 按 `Turn.items` 原始顺序建立 message identity；
- 实时路径按首次接受的 started / completed 结构事件建立 identity；
- identity 只追加一次，永不因生命周期转换删除或重新追加；
- order chunk 只在新增 identity 时改变；delta 与已知 identity 的 completion 不改变 order revision；
- membership key 必须包含 turn ID，不能假设 item ID 跨 turn 全局唯一；
- 每个 chunk 继续使用 100 个 identity 的既有有界粒度。

这是一份顺序元数据，不是第二份 message 内容存储。
现有 `entriesById` 继续保存 committed 内容，现有 live state 继续保存 transient 内容。

## 分类与展示解析

每个 message identity 的当前位置由 authoritative item 机械派生：

```text
原始首项且为可渲染 userMessage → leading
assistant + phase=final_answer       → final
其他可渲染 message                  → middle
不可渲染 message                    → 不显示
```

started item 的 phase 是 provisional；completed item 的 phase 最终权威。
如果同一 identity 的 phase 在 completed 时变化，可以在 middle / final 之间迁移，
但 message order identity 本身不移动。它随后进入 middle 时仍按 Rust 原始顺序解析，
而不是按迁移时刻追加到 middle 尾部。

middle renderer 按 message order chunks 遍历 identity，并逐项解析当前内容：

1. 当前 authoritative committed entry 属于 middle 时，渲染 committed message；
2. 否则当前 live item 属于 middle 时，渲染 live message；
3. leading、final、不可渲染或当前无内容的 identity 返回 `null`。

committed 与 live 若在一个 reducer transition 边界上都可查询，committed 是内容权威。
React 列表 key 始终来自稳定的 `(turnId, itemId)` identity；settlement 可以切换 presentation，
但不能删除旧位置并在其他位置创建另一条 logical message。

`middleEntryCount` 表达当前可见 middle message 数量，
同一 identity 无论 live 还是 committed 都只计一次；空的 provisional identity 不计数。

## 生命周期收敛

### itemStarted

- 先记录 Rust 原始首项事实（如果尚未建立）；
- message item 首次出现时追加到 message order；
- agent message 继续建立现有 live payload；
- started 文本与 phase 只用于 provisional presentation，不写成 committed truth。

### Delta

- 只定位现有 live agent message；
- 按现有 RAF batch 和 transient text 规则更新内容；
- 未知 item ID 继续是 no-op；
- 不建立 order identity，不改变 placement。

### itemCompleted

- 若 identity 尚不存在，按当前 Rust 结构事件位置追加；
- 使用完整 completed item materialize committed entry；
- 清理同 identity 的 live payload；
- middle identity 原位从 live 解析为 committed，不从顺序索引删除；
- completed phase 改变 placement 时，只改变该 identity 的分类结果，不重建 identity。

### Duplicate、replay 与迟到事件

- 现有 ingress / reducer dedup 仍是第一道边界；
- message order 写入自身仍必须幂等；
- duplicate started / completed 不产生第二个位置；
- completed 后迟到的 started 不能把 authoritative message 降级为 live；
- snapshot duplicate 不改变 snapshot 已重建的顺序。

## React 与现有三段结构

`CommittedTranscriptTurn` 继续按 leading → middle → final 排列。

- `LeadingPromptEntry` 继续消费单个 entry ID，但该 ID 只由 Rust 原始首项规则产生。
- `MiddleTranscriptModule` 保留现有 Disclosure 与折叠条件，只把内容来源改为统一的 ordered middle message view。
- live commentary / null-phase assistant message 在其 order identity 处渲染，不再经过独立的 turn-level live list。
- 当前 live list 只保留不属于 middle 的 live assistant presentation；本设计不重做 final 区域顺序。
- `FinalAssistantMessages` 保持现有 completed final 行为。

因此本设计不处理“turn 何时进入折叠器”或“结束后如何归档”的独立问题，
也不改变 `Intermediate updates` 的当前触发条件。

## 性能边界

- 首次 message observation：membership lookup + tail append，均摊 `O(1)`。
- delta、已知 identity completion、duplicate：order lookup 为 `O(1)`，不执行 merge / sort。
- snapshot rebuild：按 `Turn.items` 单次 `O(item count)` 重建。
- renderer 只订阅 bounded order chunk，不 flatten 整个 turn。
- 单条 streaming delta 只更新目标 live message；不得让所有 order chunks revision 递增。
- 未变化 chunk 的 selector result 与 React subtree 保持引用稳定。
- 额外空间为每条 message 一个 ID 与一个 membership 位置，整体 `O(message count)`。

## 保持不变

- authoritative generated `@codex-protocol/v2` contract；
- Rust/app-server 持久化与 projection；
- completed item 的内容权威性；
- agent message delta RAF batch 与 transient text 累积；
- bounded dedup、subscription、replay 与 reconnect 入口；
- committed entry materialization；
- leading / middle / final 的外层布局；
- Disclosure、scroll、sticky-bottom 和现有 final 展示语义。

## 非目标

- 不修改 `verified-v0.145.0` tag。
- 不修改 Rust、app-server、协议 schema、generated TypeScript 或 runtime validator。
- 不以 GUI composer、request ID、`clientUserMessageId` 或 local storage 建立 transcript truth。
- 不创建通用 presentation slot、统一 lifecycle coordinator 或未来类型 registry。
- 不接入 activity、reasoning、command、search 或其他 `ThreadItem`。
- 不设计 turn 结束后的折叠归档。
- 不重构 final message 顺序、scroll policy 或 delta ownership。
- 不为未来 command output 预留 projection 或 renderer interface。

## 被拒绝的方向

### Renderer 临时拼接并排序 committed / live

两条数组已经丢失跨状态位置；render 时 merge / sort 既没有可靠 ordinal，
又会在 streaming hot path 反复扫描完整 turn，不能解决根因。

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

## 验收不变量

- snapshot 首项是可渲染 user message 时，它是唯一 leading。
- snapshot 首项不可渲染或不是 user message 时，leading 为 `null`；后续 user message 在 middle。
- `start A → start B → complete B(commentary)` 始终显示 A、B。
- A、B 以相反顺序完成后，middle 仍按首次 Rust item 顺序显示。
- live commentary 与 committed commentary 可以交错，但只存在一条 middle 顺序。
- `phase === null` 的 assistant message 在 middle。
- delta 找不到 started identity 时不创建 message 或位置。
- completed-without-started 在首次观察位置出现一次。
- duplicate、replay、reattach 不产生重复 identity，不移动已有顺序。
- turn 首项与 message 顺序均可从 snapshot 重建，不依赖 GUI 请求历史。
- 100 / 101 identity 继续跨有界 chunk，单条 delta 不使无关 chunk 重渲染。

## 设计完成边界

本设计只定义 message placement 与 middle 稳定顺序。
对应实施计划必须保持这一边界，不得把 activity、折叠归档、final 顺序、协议修改或统一 lifecycle
作为“顺手补齐”的任务加入。
