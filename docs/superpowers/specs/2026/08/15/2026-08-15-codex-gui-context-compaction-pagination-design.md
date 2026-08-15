# Codex GUI 上下文压缩展示分页设计

设计状态：已确认

设计日期：2026-08-15

修订日期：2026-08-15

## 主目标

Codex GUI 按上下文压缩事件划分对话展示页，让用户可以按模型上下文代际查阅历史。
分页仅改变 transcript 的展示组织，不引入性能分页、增量加载或存储分页。
同时补齐 legacy compaction 的 canonical identity，使既有 snapshot replay 去重机制能够在
attach-ahead 竞态中继续保证“一次成功压缩只建立一个展示页”。

## 当前实现与问题证据

### Attach 已提供完整历史

`thread/projection/attach` 的 snapshot 不是一页历史。app-server 在构造 snapshot 时调用
`load_thread_turns_list_history` 读取持久化历史，再用
`reconstruct_thread_turns_for_turns_list` 重建全部 `thread.turns`：

- `codex-rs/app-server/src/request_processors/thread_projection.rs:210-265`
- `codex-rs/app-server/README.md:539-557`

GUI attach 后同样消费整个 snapshot：`threadRuntime` 保存全部 `snapshotTurns`，transcript
projection 将 `snapshot.thread.turns` 交给重建逻辑，后者依次遍历每个 turn 及其中每个
`ThreadItem`：

- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:45-54`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:116-130`
- `codex-gui/src/features/transcriptState/transcriptProjection.ts:26-35`
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts:681-710`

因此，本设计无需也不应给 attach 增加 cursor、limit 或按页读取协议。上下文页是在已加载
历史之上的前端展示投影。本设计对 Rust 的窄修正只补齐既有 compaction marker identity，
不恢复服务端强一致 snapshot cut，也不把展示分页下沉为后端分页。

### 现有 100-entry chunk 不是上下文页

transcript state 已定义 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100`，并在同一 turn 的
middle entries 达到该上限后创建下一 chunk：

- `codex-gui/src/features/transcriptState/transcriptStateModel.ts:4`
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts:158-172`

这个 chunk 是 turn 内部的渲染与 selector 缓存边界，不承载“模型上下文已经压缩”的产品
语义。上下文页不能用 100 entries 替代，也不能删除或绕过现有 chunk。

### 协议已有压缩事件，但 GUI 当前丢弃

canonical app-server v2 `ThreadItem` 已包含 `ContextCompaction { id }`，生成的 TypeScript
contract 对应 `{ type: "contextCompaction", id: string }`：

- `codex-rs/app-server-protocol/src/protocol/v2/item.rs:392-396`
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts:1-3`
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts:117`

但 GUI 的 started 和 completed item projection 当前都将 `contextCompaction` 返回为
`ignore`：

- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:251-277`
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:361-374`

这正是当前 GUI 无法展示压缩边界、也无法据此划分上下文页的直接原因。frontend 需要
忽略 started 的分页含义，并保留 successful completed 的展示语义，而不是另造压缩判断。

### 既有竞态架构与本次修正边界

仓库历史已经尝试过让 attach snapshot 与 projection head 使用强一致的 history cursor：

- `c810a3dc7 feat(app-server): cut projection snapshots at history cursor` 跨 app-server、rollout、
  listener 与 projection runtime 引入 `ProjectionHistoryCursor`，总计约 1054 行新增；
- 该 cursor 后来被证明会把领域事件计数当成物理 rollout 下标，真实造成已经持久化的
  final / complete 从刷新后的 snapshot 中消失；同时 listener 需要承担 history 读取和逐事件
  cursor 维护成本；
- `99531ff40 Remove projection history cursors from thread projections` 因此明确删除 cursor，允许
  snapshot 暂时 ahead 于 projection head；
- `3ea5dc02a Handle snapshot-duplicate projection events` 随后在 GUI 中按稳定 turn/item identity
  将同语义 live replay 标为 `snapshotDuplicate`，避免重复 materialize。

这是一项已经确认的架构取舍：保留完整持久化历史，接受 snapshot-ahead，并由现有 GUI replay
分类处理同 identity 重放。本设计不得恢复 `ProjectionHistoryCursor`，不得修改 attach cut、
listener ordering、thread store 或 core persistence/delivery 顺序，也不得重新尝试跨层强一致
snapshot。

compaction 的缺口只在于它没有满足现有折中方案的稳定 identity 前提：legacy snapshot 从无 ID
的 deprecated echo 生成 synthetic `item-N`，live completed 则携带 canonical UUID。同一次压缩
因此可能在 attach-ahead 时绕过 `snapshotDuplicate` 并建立两个页面。本设计只修复这一
compaction identity 缺口，不重新解决全局竞态。

### Canonical lifecycle 与历史重建前置缺口

`itemStarted(contextCompaction)` 在真正执行压缩之前发出；压缩失败会直接返回错误，因而
可能永远没有配对的 completed。只有压缩结果已经安装为新 context 后，core 才发出
`itemCompleted(contextCompaction)`：

- `codex-rs/core/src/compact.rs:242-244`
- `codex-rs/core/src/compact.rs:368-382`
- `codex-rs/core/src/compact_remote.rs:201-213`
- `codex-rs/core/src/compact_remote.rs:286-300`
- `codex-rs/core/src/compact_remote_v2.rs:216-226`
- `codex-rs/core/src/compact_remote_v2.rs:311-325`
- `codex-rs/core/src/compact_token_budget.rs:79-85`

因此 started 只能表达“压缩尝试开始”，不能建立页面；否则一次失败压缩会留下不存在的
context 页。唯一建页信号是 successful canonical `itemCompleted(contextCompaction)`。
completed 的 snapshot/live 重放以 `(turnId, item.id)` 为 identity 幂等，同一成功压缩无论
被重复投递、reattach 后重放或同时出现在历史与 event buffer 中，都只能建立一个页。

在实现 GUI 分页之前，还必须修正 canonical compaction 的持久化与
`ThreadHistoryBuilder` 历史重建缺口：

- paginated rollout 会持久化所有 `ItemCompleted`，因此成功 compaction 的 canonical item
  已经在 rollout 中；`codex-rs/rollout/src/policy.rs:85-97`。
- builder 虽同时接收 `ItemStarted` 与 `ItemCompleted`，但当前共用的 materialized lifecycle
  分支对 `TurnItem::ContextCompaction` 返回 `false`，导致 canonical completed 被忽略；
  `codex-rs/app-server-protocol/src/protocol/thread_history.rs:592-639`。
- legacy rollout 当前只持久化 deprecated `ContextCompacted` echo；builder 处理该 echo 时通过
  `next_item_id()` 生成 synthetic id，无法与 live canonical item id 对齐；
  `codex-rs/app-server-protocol/src/protocol/thread_history.rs:1133-1136`。
- canonical completed 会为兼容消费者派生同一 deprecated echo；
  `codex-rs/protocol/src/legacy_events.rs:569-599`。历史重建若同时接受二者而不配对，会把一次
  成功压缩错误地重建为两个 marker。

前置修正必须遵循以下规则：

- legacy persistence 新增保留 successful canonical
  `ItemCompleted(ContextCompaction)`，使新历史拥有原始 `turnId + item.id`；
- deprecated `ContextCompacted` echo 继续产出并在 legacy rollout 中持久化，不改变当前 legacy
  数据格式与兼容消费者行为；
- builder 只在 canonical completed 时按原始 identity 物化 marker；started 继续忽略；
- builder 为当前 turn 维护待消费 deprecated echo 的 FIFO identity 队列。canonical completed
  首次物化时登记一次；同一 `(turnId, item.id)` 的重复 completed 不重复登记；
- `TokenCount`、`Compacted` 和其他中间事件不得清除 pending 配对。收到 deprecated echo 时，
  若队列非空则消费最早配对项而不追加 marker；若队列为空则按旧行为生成 synthetic marker；
- turn 边界清理未消费的 pending 项，使只有 canonical completed、没有 deprecated echo 的
  paginated history 不影响后续 turn；
- 禁止使用“抑制下一条 echo”的一次性布尔值或事件紧邻假设。真实 rollout 可以在物理
  `Compacted` 与 deprecated echo 之间出现 `TokenCount` 等事件。

这样，新 legacy history 的 canonical completed 与兼容 echo 只重建一个 canonical-ID marker；
旧 echo-only rollout 仍通过 synthetic fallback 恢复边界；paginated canonical-only history
同样保留原始 marker。修正不改变 v2 `ThreadItem` 形状、schema、压缩算法、attach cut 或全局
竞态模型。

### 目标 rollout 证明压缩是时间线锚点

目标 rollout 在第 470 行持久化 `type = "compacted"`，其中包含 replacement history、
`window_number`、`previous_window_id` 和新的 `window_id`；第 471 行是 `token_count`，第 472 行
才记录 `event_msg.type = "context_compacted"`：

- `/Users/jiangsheng/.codex/sessions/2026/08/14/rollout-2026-08-14T07-22-07-019ffd6e-d689-7413-92e3-db0abe9ea426.jsonl:470`
- `/Users/jiangsheng/.codex/sessions/2026/08/14/rollout-2026-08-14T07-22-07-019ffd6e-d689-7413-92e3-db0abe9ea426.jsonl:472`

这组有序事实说明压缩是历史时间线中的真实语义事件，并对应一次上下文代际切换，同时证明
不能用“下一事件”或物理紧邻关系配对 echo。GUI
应使用协议已经投影出的 `ThreadItem::ContextCompaction` 作为展示锚点，不根据 token
数量、turn 数量或页面长度推测压缩。

## 已确认的产品语义

1. 分页是纯展示分页，目的是方便用户按上下文代际查阅；不改变历史加载或协议，不新增分页
   持久化。Rust 只补齐既有 successful compaction 的 canonical identity 持久化。
2. 首次压缩之前的内容属于第 1 页。
3. 每次成功压缩的 canonical completed 之后形成的新 context 属于下一页；completed marker
   是新页开头的语义边界，started 不建立页面。
4. 初次打开对话默认展示最新页。
5. 使用 HeroUI v3 `Pagination` 提供数字页、Previous、Next 和 Ellipsis；分页状态受控，
   交互使用 `onPress`。
6. 第 2 页及之后在页首使用 HeroUI v3 `Separator`，并显示独立的 Lingui 本地化文本
   “上下文已压缩”。分隔线与文字共同表达边界，不展示压缩摘要。
7. 实时收到成功压缩的 canonical completed 时：若用户此前位于最后一页，则进入新生成的
   最后一页；若正在浏览旧页，则保持当前页，只更新总页数。

## 边界归属与页面形成

successful completed marker 属于它开启的新页，不属于上一页。第 1 页没有压缩 marker；第 N 页
（N > 1）以“`Separator` + 上下文已压缩”开头，随后展示该 context 中的 transcript
内容。

每个 successful canonical completed marker 到达时立即物化一个新页并增加 `totalPages`。
该页即使暂时没有普通 transcript 内容，也必须立即显示自己的 Separator 和本地化边界文本：

```text
page 1 content
itemCompleted(ContextCompaction) ── materialize page 2 immediately
                         ├─ Separator + 上下文已压缩
                         └─ transcript content may arrive later
```

若历史以 successful completed marker 结束，该 marker 仍建立一个只有边界的最新页。连续
successful completed markers 不折叠：每个 completed 都代表一次独立的 context 代际切换，
并各自建立一个以 Separator 和“上下文已压缩”开头的新页。started-only 尝试不参与页码，
这样页码与成功的 canonical compaction lifecycle 保持一一对应。

### 同一 turn 内压缩

压缩可能出现在 turn 的 item 序列内部，因此页面组织必须按 canonical item 顺序切分。
不得把整个 turn 强制塞入一个页面，也不得先将所有 turn entries `flatten` 成一个全局大
数组再分页。

前端应将同一 turn 表达为可跨页的 turn fragments。每个 fragment 仍引用原 turn identity
以及既有 leading entry、middle chunk、final entry 等结构化引用；压缩边界只结束当前
fragment 并立即开启下一上下文页。后续同一 turn 的第一个可展示 item 在这个已经存在的
新页上开启新的 turn fragment；在它到达之前，该页只包含压缩边界。这样：

- turn 的协议身份、状态和 item 顺序保持不变；
- 一个 turn 可以在压缩前后分别出现在相邻上下文页；
- 页面切换不伪造新 turn，也不移动 compaction 前后的 item；
- 当前 turn/chunk 渲染结构仍可复用。

若压缩发生在现有 middle chunk 的形成过程中，边界必须同时结束当前 chunk，压缩后沿用
现有“最多 100 entries”的规则创建新 chunk。上下文页因此不会跨 chunk 截断，但 100-entry
chunk 仍只是性能边界，不决定页码。

## 权威来源与前端派生模型

权威输入始终是生成的 v2 `ThreadItem` contract。frontend 不手写第二份 protocol mirror，
也不通过字符串、rollout 原始 `compacted` payload 或 token 阈值识别边界。压缩 item 的
frontend 类型应从 `ThreadItem` 直接提取，例如
`Extract<ThreadItem, { type: "contextCompaction" }>`；生成文件继续由既有 schema 流程维护，
不得手工编辑。

transcript state 在 snapshot rebuild 与 live `itemCompleted` 的统一投影路径中保留成功压缩
边界身份；live `itemStarted` 不改变 page partitions。展示关系如下：

```text
successful completed ThreadItem[] in canonical order
                │
                ▼
transcript state
  ├─ existing turns / entries / <=100-entry chunks
  └─ derived context page partitions
       ├─ page number
       ├─ optional leading compaction boundary id
       └─ ordered turn-fragment references
                │
                ▼
render current page only
```

page partitions 是 transcript state 的派生展示数据，不是 app-server 数据模型，也不是新的
持久化来源。snapshot rebuild 与 live completed 都必须使用 `(turnId, item.id)` identity 和
同一套边界归属规则；重复 completed、reconnect replay 与 snapshot duplicate 不得增加页数。
started-only 失败尝试在两条路径中都不形成页面。

现有 `snapshotReplayIndex` / `snapshotDuplicate` 仍是 attach-ahead replay 的唯一 GUI 协调机制；
分页不得新增按 turn 数量、时间、尾页形状或相邻关系判断同一次压缩的启发式去重。Rust
identity 补全后，snapshot marker 与 live completed 使用相同 item ID，直接复用现有分类。

## 前端性能与渲染约束

- 保留现有 turn identity、entry identity、middle chunk 和 selector cache 边界。
- 不将所有 transcript entries 展平为一个长期存在的大数组。
- 页面 partition 只保存 turn-fragment、chunk 和 entry 的引用/identity，不复制正文。
- 只挂载和渲染当前页；非当前页不得以 `display: none`、折叠容器或其他隐藏 DOM 方式继续
  渲染。
- 切页时按当前页引用读取既有 selector view；不为分页重复构造 Markdown、reasoning 或
  sub-agent activity 内容。
- 新的 successful completed 只在尾部增量追加一个立即可见的 page partition，不重建所有
  历史页；snapshot reattach 才按修正后的 canonical 历史重新派生全部 partition。

这些约束不是性能分页：数据仍由 attach 一次性提供。它们只防止纯展示分页破坏当前已经
存在的渲染分块与缓存能力。

## 页面状态与实时迁移

页面状态至少包含 `currentPage` 与派生的 `totalPages`，由 transcript surface 受控：

- **初次 attach / thread identity 改变**：选择 `totalPages`，即最新页。
- **用户切页**：数字页、Previous、Next 的 `onPress` 更新 `currentPage`；首尾按钮禁用。
- **最后页新增普通内容**：保持最后页，内容按现有 live 生命周期更新。
- **最后页用户遇到成功压缩**：completed marker 到达即物化新页，并将 `currentPage` 更新到新的
  `totalPages`；新页即使暂时只有边界也立即显示。
- **浏览旧页时出现成功压缩**：completed marker 到达即增加 `totalPages`，`currentPage` 不变。
- **同一 thread reattach**：如果用户原本跟随最后页，继续跟随新的最后页；如果原本浏览
  旧页，保留仍存在的逻辑页码，超界时才 clamp。
- **started-only 尝试**：不改变 `totalPages` 或 `currentPage`；只有配对 completed 到达后才
  执行上述迁移。
- **尾随或连续 completed markers**：每个 successful completed 都立即独立增加
  `totalPages`；尾随 marker 的页可以只有边界，连续 marker 可以形成连续的仅边界页，
  不合并、不延迟。

判断“是否跟随最后页”必须使用变更前的 `currentPage === previousTotalPages`，不能在总页数
更新后再比较，否则原本位于最后页的用户会被错误留在旧页。

## HeroUI、i18n 与可访问性

### Pagination

使用 HeroUI v3 compound API：`Pagination`、`Pagination.Content`、`Pagination.Item`、
`Pagination.Link`、`Pagination.Previous`、`Pagination.Next` 和 `Pagination.Ellipsis`。
本地文档及 demo 已确认 `isActive`、`isDisabled`、`onPress`、数字页与 ellipsis 的组合方式：

- `codex-gui/.heroui-docs/react/components/(navigation)/pagination.mdx:180-239`
- `codex-gui/.heroui-docs/react/demos/en/pagination/with-ellipsis.tsx:35-66`

当前页通过 `Pagination.Link isActive` 表达，由组件产生 `aria-current="page"`。Previous、
Next 与页码链接必须具有 Lingui 本地化的可访问名称；交互使用 `onPress`，保留 React Aria
的键盘、触摸与焦点语义。Ellipsis 使用组件原生的 `aria-hidden` 行为，不自行创建可聚焦
省略号。

### Separator 与边界文本

使用 HeroUI v3 `Separator` 作为水平分隔结构，并在同一边界区域放置独立可见文本
“上下文已压缩”。文本使用 `Trans` 或仓库现有 Lingui macro 进入 catalog；用于
`aria-label` 等非 JSX 属性的文字使用 `useLingui`。不把中文字符串硬编码进只支持英文源
消息的 catalog，也不让纯视觉 Separator 独自承担语义。

边界区域应让辅助技术按“上下文已压缩”读出一次。Separator 若保留 separator role，文本
不得再添加重复的同义无障碍名称。Pagination 的导航 landmark、当前页状态、首尾 disabled
状态和焦点可见性均使用 HeroUI 原生语义。

本地 HeroUI 依据：

- `codex-gui/.heroui-docs/react/components/(navigation)/pagination.mdx:241-253`
- `codex-gui/.heroui-docs/react/components/(layout)/separator.mdx:12-50`

## 非目标

- 不做性能分页、虚拟列表、无限滚动或按需获取历史。
- 不给 `thread/projection/attach`、`thread/read` 或其他 app-server API 增加 cursor、limit、
  window number 或分页字段。
- 不恢复 `ProjectionHistoryCursor`，不修改 snapshot cut、listener ordering、thread store、core
  persistence/delivery 顺序或全局 snapshot-ahead 竞态模型。
- 不修改 v2 `ThreadItem` 形状或 schema；Rust 侧只修正内部持久化历史的 canonical completed
  identity、deprecated echo FIFO 配对与旧 echo-only fallback。
- 不修改 rollout 的压缩算法、自动压缩阈值、手动压缩行为或 context 内容。
- 不展示、展开、解析或重新生成压缩摘要。
- 不按 token 数、turn 数、item 数、时间或 100-entry chunk 推测上下文页。
- 不持久化用户最后查看的页码，不做跨进程或跨设备页面恢复。
- 不改变 TUI 的 `Context compacted` 展示。
- 不重排、删除或重写历史 item，不把 compaction 伪装成 user/assistant message。
- 不新增分页之外的历史搜索、筛选、跳转或管理功能。

## 验证边界

验证应覆盖稳定的产品行为和可访问语义，不锁定主观样式数值：

- **无压缩**：完整 transcript 只有第 1 页，默认显示该页，不出现压缩 Separator；无需渲染
  多页导航。
- **一次与多个压缩 snapshot**：按 successful canonical completed 顺序形成 2 页及多页，
  首次成功压缩前内容位于第 1 页，每个后续页以压缩边界开头，默认选择最后一页。
- **started 失败**：started 后压缩失败且没有 completed 时不增加页数、不显示 Separator，
  也不改变当前页。
- **同一 turn 内成功压缩**：同一 turn 被分为相邻页的 fragments，item 顺序不变，completed
  marker 前后内容不被强塞进同一页，既有 <=100-entry chunk 约束仍成立。
- **completed 尾随或连续 completed**：每个 successful completed 到达即独立创建新页和
  页首边界；尾随 completed 产生仅含边界的最新页，连续 completed 产生多个独立页，不折叠。
- **live 跟随最后页**：用户位于最后页时，新压缩 completed 到达即产生新页并自动进入，
  无需等待普通 transcript 内容。
- **live 旧页保持**：用户浏览旧页时，新压缩 completed 只增加总页数，当前页和旧页可见
  内容保持。
- **分页交互**：数字页、Previous、Next 和 Ellipsis 在页数较多时正确组合，首尾 disabled，
  `onPress` 能切到目标页。
- **可访问状态**：当前数字页具有 `aria-current="page"`，分页 landmark、按钮名称、键盘焦点
  与边界文本可被准确识别，Ellipsis 不进入可访问交互序列。
- **非当前页不渲染**：Browser 测试确认旧页 DOM 在切到新页后卸载，而不是隐藏；当前页
  内的 Markdown、reasoning、sub-agent activity 仍沿用现有 renderer。
- **completed 幂等**：同一 `(turnId, item.id)` 的 completed 被重复投递、snapshot duplicate
  或 reconnect replay 时，不重复产生页面或 Separator。
- **snapshot 与 live 一致**：paginated rollout 中 canonical completed 经 attach rebuild 与
  live completed 产生相同 identity 和 page partitions；配对 deprecated echo 不重复建页。
- **legacy canonical + echo**：canonical completed 与配对 echo 之间插入 `TokenCount`、
  `Compacted` 等事件时仍只重建一个 canonical-ID 边界；重复 canonical completed 不增加 pending
  echo，也不产生第二个边界。
- **legacy fallback**：旧 echo-only rollout 仍用 synthetic id 重建一个边界；不重写或迁移旧
  rollout。
- **attach-ahead 专项竞态**：snapshot 已包含 compaction marker、`headCommitId` 仍落后、随后
  canonical completed projection event 到达时，两端 item ID 相同，现有 `snapshotDuplicate`
  分类阻止第二个页面和 Separator。
- **snapshot / Browser 覆盖**：更新必要的稳定快照以审查用户可见的 Separator、分页导航和
  同 turn 分段，并用 Browser 测试覆盖 live transition 与交互。

不添加针对具体 padding、gap、颜色、线宽、阴影或 Ellipsis 阈值实现常量的低价值断言；
除非这些数值另行成为明确、稳定的产品约束，否则只做界面检查。

## 设计结论

上下文压缩适合作为本功能的展示分页依据，因为 successful canonical completed 是协议中
已经存在、并由 rollout 事实支持的上下文代际锚点。实现不恢复已经因成本和真实历史截断回归
而移除的全局 history cursor；只让 legacy persistence 保留 canonical completed，并用按 turn
限定的 FIFO 配对继续兼容 deprecated echo 与旧 echo-only rollout。这样 compaction 能满足
既有 GUI `snapshotDuplicate` 架构的稳定 identity 前提。随后保持 app-server 的全量历史 attach
与 GUI 现有 turn/chunk 结构，只在 transcript state 中从 completed `ThreadItem` 派生 context
page partitions，并只渲染当前页。该方案既避免 started 尝试和 attach-ahead replay 产生错误
页面，也不会把展示分页误做成加载、存储分页或跨层强一致 snapshot 重构。
