# Codex GUI Transcript Turn Structure 设计

日期: 2026-06-29

## 背景

当前 `transcriptState` 把一个 turn 内的 committed entries 统一放进 chunk。React 显示层再把这些 entries flatten 成完整 turn entries，并根据 `role` 和 `phase` 临时推导哪些内容应该进入折叠区、哪些内容是最终回复。

当前显示效果基本正确，但数据结构没有表达真实语义。为了做中间过程折叠，显示层每次相关 turn 更新后都需要重新解释完整 turn，导致长 turn 下重新引入性能热点。

本设计目标是保持当前显示语义和交互基本不变，同时把 turn 内结构下沉到 Redux transcript 数据层。

## 目标

Redux 层直接表达一个 turn 的三段结构:

```text
turn
  leadingPromptEntryId
  middleChunkIds
  finalAssistantEntryIds
```

React 层只消费已经分类好的结构:

```text
开场消息

Intermediate updates · N items
  中间过程，折叠或展开

最终助理回复
```

## 已确认决策

1. 开场槽位

   `leadingPromptEntryId` 只接收 turn 中第一条 materialized entry，且该 entry 不能是 assistant message。

   如果第一条 entry 是 assistant message，无论它是 `commentary`、`final_answer` 还是 `phase === null`，`leadingPromptEntryId` 都保持 `null`，该 entry 继续按后续规则分类。

2. 最终回复槽位

   最终回复使用数组保存:

   ```ts
   finalAssistantEntryIds: string[];
   ```

   所有 `role === "assistant"` 且 `phase === "final_answer"` 的 message entry 都进入该数组。通常只有一条最终回复，但数据结构不强制单条。

3. 中间折叠槽位

   除 `leadingPromptEntryId` 和 `finalAssistantEntryIds` 之外的所有 entry 都进入 `middle`。

   `middle` 使用 chunk:

   ```ts
   middleChunkIds: string[];
   ```

   `middle` 可以包含 assistant commentary、后续 user message、legacy assistant message、status entry，以及 final 之后出现的非-final entry。

4. Chunk 语义

   继续复用全局 chunk 表:

   ```ts
   chunksById: Record<string, TranscriptChunk>;
   entryChunkById: Record<string, string>;
   ```

   但 chunk 的语义改为只存 `middle` entries。`entryChunkById` 也只覆盖 middle entries。`leadingPromptEntryId` 和 `finalAssistantEntryIds` 指向 `entriesById`，不进入 chunk。

5. 不做旧结构兼容

   不保留旧 selector 语义桥接。不再提供“完整 turn chunk entries”作为主要消费形态。组件和测试直接迁移到新结构。

6. 组件边界

   React 层按三段语义拆分:

   ```text
   CommittedTranscriptTurn
     LeadingPromptEntry
     MiddleTranscriptModule
     FinalAssistantMessages
   ```

7. 折叠行为

   `MiddleTranscriptModule` 沿用当前行为:

   ```text
   finalAssistantEntryIds.length === 0
     middle 强制展开，禁用收起

   finalAssistantEntryIds.length > 0
     middle 默认折叠，允许用户展开
   ```

8. 可见文案

   折叠区标题改为:

   ```text
   Intermediate updates · N items
   ```

   不再使用 `Temporary updates`，因为 middle 里不只包含 temporary assistant 内容。

## Redux 数据结构

建议把 `TranscriptTurn` 扩展为:

```ts
export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  leadingPromptEntryId: string | null;
  middleChunkIds: string[];
  finalAssistantEntryIds: string[];
};
```

保留:

```ts
entriesById: Record<string, TranscriptEntry>;
chunksById: Record<string, TranscriptChunk>;
entryChunkById: Record<string, string>;
```

删除或替换:

```ts
chunkIdsByTurnId: Record<string, string[]>;
```

因为 chunk ids 已经挂在 turn 的 `middleChunkIds` 上。

## 分类规则

对每个 materialized entry，按 turn 内原始顺序处理。

第一条 entry:

```text
如果 entry 不是 assistant message
  写入 leadingPromptEntryId
  不进入 middle chunk

如果 entry 是 assistant message
  leadingPromptEntryId 保持 null
  继续按 final/middle 规则分类
```

最终回复:

```text
如果 entry 是 assistant message 且 phase === "final_answer"
  append 到 finalAssistantEntryIds
  不进入 middle chunk
```

其他 entry:

```text
append 到 middle 的最后一个 chunk
```

这意味着 final 之后出现的非-final entry 也进入 middle。第一版不引入 `postFinal`。

## 数据流

Snapshot attach:

```text
threadRuntimeAttached
  rebuildFromSnapshot()
    for each turn
      upsert turn
      materialize entries in order
      classify into leadingPrompt / middle chunks / finalAssistant
```

Live item completed:

```text
threadRuntimeEventBuffered(itemCompleted)
  materialize entry
  classify against current turn structure
  update only the affected slot:
    leadingPromptEntryId
    middle last chunk
    finalAssistantEntryIds
```

## Selector 方向

组件不再调用完整 turn chunk selector 来重建完整 entries。

建议保留或新增这些 selector:

```ts
selectTranscriptTurn(state, turnId)
selectTranscriptEntry(state, entryId)
selectTranscriptChunk(state, chunkId)
```

`selectTranscriptChunk()` 继续返回 chunk view，但该 chunk view 只代表 middle entries。

`CommittedTranscriptTurn` 读取 turn 后:

```text
leadingPromptEntryId -> selectTranscriptEntry
middleChunkIds -> selectTranscriptChunk
finalAssistantEntryIds -> selectTranscriptEntry
```

## React 渲染结构

`CommittedTranscriptTurn` 负责三段排列。

`LeadingPromptEntry`:

```text
如果 leadingPromptEntryId 为 null，返回 null。
否则渲染对应 entry。
```

`MiddleTranscriptModule`:

```text
如果 middleChunkIds 为空，返回 null。
否则渲染 Disclosure。
Disclosure 内按 chunk 渲染 middle entries。
```

`FinalAssistantMessages`:

```text
如果 finalAssistantEntryIds 为空，返回 null。
否则按数组顺序渲染所有 final assistant entries。
```

## 性能收益

当前路径:

```text
turn 更新
  读取所有 chunk
  flatten 完整 turn entries
  scan/group 完整 turn entries
  render display items
```

新路径:

```text
turn 更新
  只更新对应结构槽位
  middle 追加只影响最后一个 middle chunk
  final 到达只 append finalAssistantEntryIds
  render 直接消费三段结构
```

这不能消除“展开后渲染所有可见 middle entries”的成本，但可以消除为了判断结构而反复 flatten/group 完整 turn 的成本。

## 测试策略

需要覆盖 Redux 分类和 React 显示两层。

Redux 单元测试:

- 第一条 user message 进入 `leadingPromptEntryId`。
- 第一条 assistant commentary 时 `leadingPromptEntryId` 留空，该 entry 进入 middle chunk。
- 第一条 assistant final answer 时 `leadingPromptEntryId` 留空，该 entry 进入 `finalAssistantEntryIds`。
- 多条 final answer 都进入 `finalAssistantEntryIds`，顺序保持。
- 除 leading 和 final 之外的 user/commentary/status/legacy assistant 都进入 middle chunk。
- `entryChunkById` 只包含 middle entries。

React browser 测试:

- 正常 turn 显示为开场消息、中间折叠区、最终回复。
- 没有 final 时 middle 强制展开并禁用收起。
- 有 final 时 middle 默认折叠，可展开。
- 折叠区标题显示 `Intermediate updates · N items`。
- 多 final answer 按顺序显示。

## 非目标

- 不改变 app-server 协议。
- 不改变 `ThreadItem` 的 wire shape。
- 不引入 `postFinal`。
- 不做旧 selector 兼容桥接。
- 不持久化用户展开状态。
- 不做 transcript 虚拟列表或 DOM 窗口化。
- 不处理 temporary module id 的独立小修；该问题已有单独设计补充。
