# Committed Transcript State Cleanup Design

日期: 2026-06-17
状态: 设计草案, 待确认
范围: YOLO single-session chat GUI performance v2 的 committed transcript facts owner 清理

## 目标

本设计把 Performance v2 的第一块落地边界收敛到 committed transcript facts owner。

总设计已经确认 active chat path 必须从完整 turn tree 迁移到 stable ids、bounded chunks 和
active tail。这个小设计只处理其中的 committed transcript 部分: 删除旧
`incrementalChatState` owner 及其 complete-tree 契约, 新建 `transcriptState` owner, 用按
turn 分块的 committed entries 作为后续 production chat surface 的事实输入。

本设计不是实施计划, 不定义任务顺序、checkbox、测试命令或提交策略。

## 已确认决策

1. `chatTextModel` 只定性为过时 surface, 本设计不执行清理。
2. 新建 `transcriptState` owner, 不沿用 `incrementalChatState` 名称或 reducerPath。
3. 删除整个旧 `incrementalChatState` owner, 不做兼容层。
4. Production selector 只覆盖 committed transcript 的 chunk/id 读取, 不定义 active tail。
5. 删除旧 complete-tree 测试, 重写为 `transcriptState` chunk/id 契约测试。
6. 固定 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100`, append/update 写入必须 bounded。

## 范围

本设计覆盖:

- `transcriptState` 的 committed transcript facts shape;
- attach baseline rebuild 如何生成 bounded chunks;
- live `itemCompleted` 如何 append 或 update committed entries;
- committed transcript production selectors 的最小集合;
- 旧 `incrementalChatState` complete-tree owner 的删除边界;
- 旧测试契约如何替换为新 selector 契约。

本设计不覆盖:

- active tail / streaming / running / transient items 的状态入口;
- production chat surface、React component 拆分或 virtualization;
- Markdown holdback、render cache 或 viewport-width-specific 派生结果;
- `chatTextModel` 的删除或替换实施;
- app-server projection protocol 变更。

## 旧契约清理

旧 `incrementalChatState` owner 已经和 complete turn view 绑定:

- `IncrementalChatTurnView.messages`;
- `turnViews`;
- `messagesByTurnId`;
- `turnViewIndexById`;
- `messageViewIndexById`;
- `selectIncrementalChatTurns`;
- 围绕 read-model identity 的旧测试断言。

这些都属于过时契约。实施本设计时不迁移、不保留、不提供兼容 selector。旧 owner 应作为整体
删除, 并由 `transcriptState` 的 committed transcript facts 和 bounded selectors 替代。

`chatTextModel` 也属于旧 complete grouped surface, 因为它输出完整 `turns -> entries` model,
并且仍从 timeline material fold 得到结果。但它不属于本设计的执行范围。本设计不会为
`chatTextModel` 提供 `turnViews/messages[]` 兼容输入, 也不能为了让它继续工作而保留旧
`incrementalChatState` 契约。后续 production chat surface / windowing 设计必须单独删除或替换
`chatTextModel`。

## 新状态所有权

新增 owner 命名为 `transcriptState`。它是 committed transcript facts owner, 不保存 React node、
DOM、wrapped lines、rendered Markdown tree 或完整 turn view。

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
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};
```

`transcriptState` 不定义 active tail。running tool、hook、plan、reasoning、assistant streaming
和其他 transient items 会在后续 active tail 小设计中处理。

## Committed Transcript Model

Turn 只保存 committed transcript 的稳定状态:

```ts
type TranscriptTurn = {
  id: string;
  status: "inProgress" | "completed" | "interrupted" | "failed";
};
```

Committed entries 按 turn 分块:

```ts
type TranscriptChunk = {
  id: string;
  turnId: string;
  entryIds: string[];
  revision: number;
};
```

Committed entry 保存 serializable canonical facts:

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
      type: "status";
      id: string;
      turnId: string;
      status: "interrupted" | "failed";
      revision: number;
    };
```

本设计的 committed transcript 不把 running activity 写入 entry。只有已经 finalized、可以作为
committed history 的内容才进入 chunk。

## Chunk 写入契约

Chunk size 固定为:

```ts
const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;
```

写入规则:

- append committed entry 只修改目标 turn 的最后一个 chunk, 或创建一个新 chunk;
- 当最后一个 chunk 已达到 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT` 时, 下一次 append 创建新
  chunk;
- update existing committed entry 只修改 `entriesById[entryId]` 和所属 chunk 的 `revision`;
- 删除或移动 entry 如果后续需要支持, 只能重建所属 bounded chunk 的 `entryIds`;
- 写路径不得复制某个 turn 下所有 committed entries;
- 写路径不得维护 `turnViews[].messages[]` 或等价的完整嵌套 view。

Chunk id 必须稳定且可由 turn id 和 chunk 顺序推导或持久保存。设计不要求 chunk id 对用户可见。

## 输入语义

### Attach accepted

Attach accepted 是允许 baseline rebuild 的边界。`transcriptState` 在 attach 时:

- 清空旧 committed transcript facts;
- 按 snapshot turn 顺序生成 `turnIds` 和 `turnsById`;
- 按 snapshot item 顺序 materialize finalized user / assistant message entries;
- 按 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT` 构造 `chunkIdsByTurnId`、`chunksById` 和
  `entryChunkById`;
- 清空旧 interrupted global status;
- 清空 applied event window。

### Live notification

Live notification 只能按条 apply:

- 先用 deterministic apply key 做幂等判断;
- `turnStarted` / `turnCompleted` 只 upsert turn status;
- `itemStarted` 不写入 committed transcript;
- `itemCompleted` 对 finalized user / assistant message append 或 update committed entry;
- manual reconnect required 只更新 global status, 不 replay event buffer。

Live path 禁止从 `snapshotTurns + eventBuffer` 重新 materialize committed transcript。

## Selector 契约

Production selector 只暴露 committed transcript 的 stable ids 和 bounded chunk:

```ts
selectTranscriptTurnIds(state): string[]
selectTranscriptTurn(state, turnId): TranscriptTurn | null
selectTranscriptChunkIdsForTurn(state, turnId): string[]
selectTranscriptChunk(state, chunkId): TranscriptChunkView | null
selectTranscriptEntry(state, entryId): TranscriptEntry | null
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

本设计不定义 `selectActiveTailForTurn`。后续 active tail 设计会补上 running / streaming /
transient items 的事实 owner 和 selector。

本设计禁止新增或保留 production complete-tree selector:

```ts
type CompleteTurnView = {
  id: string;
  messages: TranscriptEntry[];
};
```

## 测试契约

旧 `incrementalChatState` complete-tree tests 应删除, 不保留对
`selectIncrementalChatTurns`、`IncrementalChatTurnView.messages` 或旧 read-model identity 的断言。

新的 `transcriptState` 契约测试应覆盖行为, 而不是兼容旧 shape:

- 初始 state 返回空 committed transcript selectors;
- attach baseline rebuild 生成 turn ids、bounded chunk ids、entries 和 global status reset;
- live `itemCompleted` append committed entry 时只增加目标 turn 的最后 chunk 或新 chunk;
- 超过 100 entries 后创建新 chunk;
- update existing entry 只更新 entry 和所属 chunk revision;
- duplicate apply key 不重复写入 entry;
- manual reconnect required 更新 global status, 不重建 committed transcript;
- `itemStarted` 不写入 committed transcript。

这些测试不需要为 active tail、windowing 或 `chatTextModel` 负责。

## 不变量

本设计完成后应满足:

- 代码中不再存在 `incrementalChatState` owner;
- production path 不再暴露 `selectIncrementalChatTurns`;
- committed transcript 写入不复制完整 turn message list;
- committed transcript selector 不返回完整 turn tree;
- chunk 内 entry 数量以 100 为边界;
- active tail 仍是未实现的后续设计范围, 不能由旧 complete tree 临时代替;
- `chatTextModel` 被视为过时 surface, 但不由本设计执行清理。

## 后续设计

本设计之后至少还需要两个独立小设计:

- active tail facts owner: 覆盖 running / streaming / transient transcript-like items;
- production chat surface / windowing: 删除或替换 `chatTextModel`, 让 React surface 消费
  `transcriptState` 和 active tail 的 bounded selectors。
