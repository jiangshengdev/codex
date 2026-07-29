# YOLO Single-Session Chat GUI Performance v2 Overall Design

日期: 2026-06-17
状态: 设计草案, 待确认
范围: YOLO single-session chat GUI active chat path 的性能边界

## 目标

Performance v2 的目标是把 GUI active chat path 从“避免 selector 全量 fold”推进到“输入、
写入、读取和渲染全链路有界”。

旧 `2026-06-07-yolo-single-session-chat` 设计已经确认:

- `snapshotTurns + eventBuffer` 不能作为 steady-state render / selector 输入;
- live notification 必须按条 apply;
- `eventBuffer` 只能作为 bounded replay/debug tail;
- streaming 需要 stable finalized history 和 mutable active tail 分离。

这些方向继续有效。但当前 GUI 实现仍暴露新的长 turn 风险: `selectIncrementalChatTurns`
已经不再每次重建完整 view, 但 reducer 写路径仍维护 `turnViews[].messages[]` 这种随单个
turn 无限增长的大数组。长 turn 中每次 message append/update 都会复制当前 turn 的完整
`messages` 数组。

因此 v2 必须重新定义 `05b -> 06a -> chat surface -> React` 的生产契约: 生产 UI 不能再以
完整 `IncrementalChatTurnView[]` 加嵌套 `messages[]` 作为主要订阅单位, 而应按 stable ids、
bounded chunks 和 active tail 订阅。

## 文档关系

本目录中的 `01-tui-research-draft.md` 保持为调研证据和设计参考, 不作为最终设计契约。
本文件是 v2 总设计, 负责记录已确认的架构决策、状态边界、selector 契约和性能不变量。

Composer 发送和终止当前 turn 的详细设计见 `07-composer-turn-control/design.md`; 本文件只保留
Performance v2 总体边界, 不展开 composer 实现细节。

Performance v2 不是实施计划。这里不定义阶段顺序、任务拆分或测试命令。

## 与既有设计的关系

Performance v2 不重新打开以下已经确认的边界:

- `/gui` 单会话入口和 thread identity shell;
- projection attach/event/closed ingress validation;
- thread runtime facts owner;
- attach / reconnect 时允许 baseline rebuild;
- `eventBuffer` 作为 replay/debug material, 不是 production active path 输入。

Performance v2 收紧以下旧契约:

- 旧 `05b` 的 `turnViews` reducer-time read model 可以继续作为小规模/debug/test 兼容层,
  但不能作为长历史生产 UI 的主数据契约。
- 旧 `06a` 的 turn-grouped complete text model 可以继续服务纯文本 smoke surface 或过渡 UI,
  但不能被声明为 v2 长 turn / 长历史性能目标的最终生产 surface。
- 后续生产 UI 必须消费 chunk/id/active-tail selectors, 而不是完整巨大树 selector。

## 设计原则

1. 输入层有界

   Live notification 的 production path 只处理当前 notification。`eventBuffer` 和
   `snapshotTurns` 只能用于 attach/reconnect/replay/debug 边界, 不能在 steady-state 中被
   selector 或 render path 反复 fold。

2. 写路径有界

   Redux/Immer 写入不能复制单个 turn 内无限增长的完整 `messages[]`。追加 committed entry
   时最多触碰目标 turn 的最后一个 bounded chunk, 或创建一个新 chunk。

3. 读路径有界

   生产 selector 不能返回完整 transcript 巨树。UI 应先订阅 turn ids / chunk ids / active tail
   ids, 再由局部组件订阅具体 bounded chunk 或 active tail。

4. 渲染路径有界

   React 组件必须按 turn、chunk、entry、active tail 拆分订阅和 memoization。长历史聊天 UI
   必须引入 windowing / virtualization。

5. Committed 与 active 分区

   Finalized transcript entry 和 running / streaming active tail 是不同状态区。Streaming delta
   不能直接写入 committed transcript。

6. Source-backed finalized entry

   Finalized assistant / Markdown entry 保存 canonical source。DOM、wrapped line、rendered
   Markdown tree 或 viewport-width-specific 结果都只是派生缓存, 不能成为事实源。

7. Replay 与 live 分源

   Replay 可以重建 baseline, 但 replay 不能触发 live-only 副作用。Live notification 和 replay
   material 可以共用纯 mapping helper, 但入口必须带来源语义。

## 状态所有权

### Runtime owner

`threadRuntime` 继续拥有 runtime / replay facts:

- current thread id;
- subscription id;
- active turn id;
- attach snapshot baseline;
- bounded event buffer;
- manual reconnect required state。

它不解释 item 内容, 不生成 transcript entry, 不维护 React-ready view。

### Transcript facts owner

Performance v2 定义新的 transcript facts owner。设计上不再受现有 `incrementalChatState`
命名和 `IncrementalChatTurnView.messages[]` 契约约束。实施时可以分阶段从现有 slice 迁移,
但目标生产契约必须按 bounded chunk 和 active tail 表达。

推荐状态形状:

```ts
type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunkIdsByTurnId: Record<string, string[]>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<string, TranscriptEntry>;
  entryChunkById: Record<string, string>;
  activeTailByTurnId: Record<string, ActiveTail>;
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};
```

这个 owner 保存 protocol/chat facts 和稳定顺序索引。它不保存 React node、DOM、wrapped lines
或 rendered Markdown tree。

## Committed transcript

### 按 turn 分块

Committed transcript 按 turn 分块:

```ts
type TranscriptTurn = {
  id: string;
  status: "inProgress" | "completed" | "interrupted" | "failed";
};

type TranscriptChunk = {
  id: string;
  turnId: string;
  entryIds: string[];
  revision: number;
};
```

`chunkIdsByTurnId[turnId]` 保存该 turn 下的 committed chunk 顺序。每个 chunk 只属于一个
turn。这样可以保持现有 turn-grouped UI 的自然边界, 同时把单次写入和单个组件订阅限制在
bounded chunk 内。

如果未来 React virtualization 需要全局 visible chunk order, 可以在 chat surface 层派生,
不能反向成为 transcript facts 的第一事实源。

### Chunk size

初始目标值:

```ts
const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;
```

这个值是设计初始值, 不是用户可见配置。实现可以让最后一个 chunk 在一次 append 中短暂超过
目标值, 但下一次 append 应创建新 chunk, 保证单次写入不会随完整 turn 长度增长。

规则:

- append committed entry 只修改最后一个 chunk 或创建新 chunk;
- update existing committed entry 只修改 `entriesById[entryId]` 和所属 chunk revision;
- 删除或移动 entry 只重建所属 bounded chunk 的 `entryIds`;
- 不维护 `turnViews[].messages[]` 这种随 turn 无限增长的嵌套 view 作为生产事实。

### Transcript entry

`TranscriptEntry` 保存 serializable canonical facts:

```ts
type TranscriptEntry =
  | {
      type: "message";
      id: string;
      turnId: string;
      role: "user" | "assistant";
      source: string;
      sourceKind: "plainText" | "markdown";
      revision: number;
    }
  | {
      type: "activity";
      id: string;
      turnId: string;
      activityType: "tool" | "hook" | "plan" | "reasoning";
      status: "completed" | "failed" | "interrupted";
      summary: string | null;
      revision: number;
    }
  | {
      type: "status";
      id: string;
      turnId: string;
      status: "interrupted" | "failed";
      revision: number;
    };
```

Plain text 和 Markdown 都以 source-backed entry 表达。渲染结果由 chat surface 或组件本地 cache
派生, 不写回 transcript facts owner 作为事实。

## Active tail

`ActiveTail` 保存 running / streaming / transient transcript-like items:

```ts
type ActiveTail = {
  turnId: string;
  entries: ActiveTailEntry[];
  revision: number;
};

type ActiveTailEntry =
  | {
      type: "message";
      id: string;
      role: "assistant";
      source: string;
      sourceKind: "plainText" | "markdown";
      revision: number;
    }
  | {
      type: "activity";
      id: string;
      activityType: "tool" | "hook" | "plan" | "reasoning";
      status: "running";
      summary: string | null;
      revision: number;
    };
```

Active tail 覆盖所有 running / transient transcript-like items, 包括 assistant streaming、
running tool、hook、plan、reasoning 等。它只是事实区, 不表示所有类型都必须在聊天主线展示。
具体展示位置由 chat surface 决定: 可以进入 transcript、activity lane 或 side panel。

规则:

- running item 先进入 active tail;
- delta 只更新 active tail 和 revision;
- active tail 不追加到 committed chunk;
- finalize 时把 active tail canonicalize 为一个或多个 committed entries, 然后 reset active tail;
- active tail revision 是 React memoization 和 render cache 的失效 key。

## 输入语义

### Attach accepted

Attach accepted 是允许全量 rebuild baseline 的边界。

规则:

- 清空旧 transcript facts;
- 按 snapshot turn 顺序重建 `turnIds` / `turnsById`;
- 按 snapshot item 顺序生成 committed entries;
- 按 chunk limit 构造 `chunkIdsByTurnId` / `chunksById`;
- 清空 active tail;
- 清空旧 interrupted global status;
- 清空 applied event window。

### Live notification

Live notification 只能按条 apply。

规则:

- 先用 deterministic apply key 做幂等判断;
- `turnStarted` 只 upsert turn status 和 active turn 相关 facts;
- `itemStarted` 只能更新 active tail 或 running activity facts, 不能生成 finalized committed entry;
- `itemCompleted` 对 user/assistant message 生成或更新 committed entry, 对 running activity 做
  finalize / committed entry 转换;
- `turnCompleted` finalize 当前 turn 的 terminal status, 并清理不应继续展示的 active tail;
- manual reconnect required 只更新 global status, 不 replay event buffer。

Live path 禁止:

- 从 `snapshotTurns + eventBuffer` 重新 materialize transcript;
- 返回完整 `turns -> messages` 巨树给 production UI;
- 把 streaming delta 直接写入 committed chunk。

## Selector 契约

生产 selector 应以 stable id 和 bounded chunk 为单位:

```ts
selectTranscriptTurnIds(state): string[]
selectTranscriptTurn(state, turnId): TranscriptTurn | null
selectTranscriptChunkIdsForTurn(state, turnId): string[]
selectTranscriptChunk(state, chunkId): TranscriptChunkView | null
selectTranscriptEntry(state, entryId): TranscriptEntry | null
selectActiveTailForTurn(state, turnId): ActiveTail | null
selectTranscriptGlobalStatus(state): TranscriptGlobalStatus[]
```

`TranscriptChunkView` 最多包含一个 bounded chunk 内的 entries:

```ts
type TranscriptChunkView = {
  id: string;
  turnId: string;
  revision: number;
  entries: TranscriptEntry[];
};
```

Production UI 不应使用以下形态作为主订阅:

```ts
type CompleteTurnView = {
  id: string;
  messages: TranscriptEntry[];
};
```

完整树 selector 可以保留, 但只能用于 debug、small smoke surface、focused tests 或迁移期兼容。
如果保留, 命名和注释必须明确它不是 v2 production selector。

## React surface 边界

React production surface 应按以下粒度拆分:

- transcript root 订阅 `turnIds`;
- turn component 订阅 turn status 和 `chunkIdsByTurnId[turnId]`;
- chunk component 订阅单个 bounded chunk;
- entry component 订阅单个 entry 或 chunk view 中的 bounded entry list;
- active tail component 独立订阅 `activeTailByTurnId[turnId]`;
- global status 独立订阅 runtime / transcript global status。

长历史 production surface 必须使用 windowing / virtualization, 至少保证不可见 chunk 不持续参与
常规 React render。没有 virtualization 时, reducer 和 selector 再有界也会在 DOM/render 层
退化。

Plain text shell 或 smoke UI 可以作为过渡面继续存在, 但不能被声明为 v2 production 完成标准。

## Streaming 与 finalize

Streaming 采用 stable region + mutable tail:

- active stream 保存 canonical raw source;
- delta 更新 raw source 和 active tail render revision;
- stable boundary 不能定义成“已经显示到屏幕”, 否则 queued-but-not-yet-committed 内容会重复显示;
- Markdown table/code 等结构化内容需要 holdback 或等价策略, 不能假设所有 delta 都是 plain text append;
- finalize 必须从完整 raw source canonicalize committed entry;
- finalized entry 保存 source, render width / viewport / renderer version 变化时重新派生 view;
- finalize 后 active stream controller 必须 reset, 避免下一条 assistant answer 继承旧 source。

当前 projection contract 尚未提供逐字 delta。v2 在设计上保留 streaming 边界, 但不要求在现有
projection-only 输入下伪造前端-only streaming。

## 不变量

Performance v2 的生产路径必须满足:

- 单条 live notification 的 reducer 写入成本不随完整 thread message count 增长;
- 单条 live notification 追加 committed entry 时, 最多复制一个 bounded chunk 的 entry ids;
- 单个长 turn 下 append/update 不复制完整 `turnViews[].messages[]`;
- selector 不从 `snapshotTurns + eventBuffer` full fold;
- production selector 不返回完整 transcript 巨树;
- active tail 更新只改变 active tail revision, 不修改 committed chunks;
- finalized source-backed entry 的 rendered output 是派生缓存;
- replay/reconnect rebuild 只发生在明确 replay 边界;
- React 长历史 production surface 不渲染不可见 chunk。

## 非目标

- 不设计多会话列表、thread switch 或 fork UI。
- 不重新设计 projection protocol。
- 不把 TUI `HistoryCell` / terminal scrollback / overlay object model 搬到 GUI。
- 不把 React node、DOM、wrapped lines 或 rendered Markdown tree 存进 Redux facts owner。
- 不在本设计中编写实施计划、任务清单或测试矩阵。

## 待后续设计确认

- Tool、hook、plan、reasoning 等非聊天 activity 的具体 UI 展示位置。
- Markdown table/code holdback 的 GUI 具体策略。
- 旧 complete tree selectors 的迁移期命名和废弃策略。
- virtualization 选型和 chunk 高度测量策略。
