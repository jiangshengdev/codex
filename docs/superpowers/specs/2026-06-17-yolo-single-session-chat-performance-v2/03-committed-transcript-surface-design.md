# Committed Transcript Surface Design

日期: 2026-06-17
状态: 设计草案, 待确认
范围: YOLO single-session chat GUI performance v2 的 committed transcript production surface

## 目标

本设计定义 Performance v2 的第二块落地边界: 删除旧 `chatTextModel` complete grouped surface,
新增 `committedTranscriptSurface`, 让 GUI production chat surface 直接消费 `transcriptState`
的 bounded committed transcript selectors。

本阶段只处理 finalized / committed transcript 的展示链路。Active tail、streaming、running
tool、hook、plan、reasoning 等 transient items 仍属于 v2 总设计的后续阶段, 不是永久移除。

本设计不是实施计划, 不定义任务顺序、checkbox、测试命令或提交策略。

## 设计依据

TUI 参考模型把 committed transcript 和 active / running tail 分开:

- `ChatWidget` 同时拥有 finalized `HistoryCell`s 和 in-flight `active_cell`;
- `TranscriptState.active_cell` 使用 `active_cell_revision` 作为 cache invalidation key;
- streaming controller 使用 stable region + mutable tail;
- finalize 后把 transient cells 合并成 source-backed committed cell。

因此 GUI 本阶段采用 committed-only surface 不违背 TUI 边界, 但不能被描述为完整 live chat
surface。它只完成 committed transcript 的生产展示路径, 不提供 running content 的即时可见性。

## 已确认决策

1. 本阶段不做 active tail、streaming 或 running transient items。
2. 不修改 `00-overall-design.md` 的远期 v2 目标; active tail 只是阶段性 defer。
3. 删除 `chatTextModel`, 不保留 complete grouped text model 作为 production path。
4. 新替代层命名为 `committedTranscriptSurface`。
5. `committedTranscriptSurface` 直接消费 `transcriptState` 的 bounded selectors。
6. 本阶段只建立 chunk-level component boundary, 不引入真实 virtualization / windowing。

## 范围

本设计覆盖:

- `committedTranscriptSurface` 的职责和边界;
- React chat surface 如何按 root / turn / chunk / entry 拆分订阅;
- `chatTextModel` 的删除边界;
- committed-only 阶段如何处理缺失的 running / streaming UI;
- chunk-level render boundary 的最小性能不变量;
- 后续 active tail 和 virtualization 设计的接口预留。

本设计不覆盖:

- active tail facts owner;
- `selectActiveTailForTurn`;
- assistant token streaming;
- running tool、hook、plan、reasoning 的即时展示;
- Markdown table/code streaming holdback;
- 真实 virtualization / windowing 选型和滚动测量;
- app-server projection protocol 变更。

## 旧契约清理

`chatTextModel` 属于过时的 complete grouped surface。它的问题不是名字, 而是生产契约:

- 输出 `turns -> entries[]` 的完整树;
- 从 timeline materials fold 得到完整 text model;
- 让 production UI 继续依赖按 turn 聚合的大对象;
- 无法表达 bounded chunk subscription;
- 无法表达未来 committed transcript 与 active tail 的分区。

实施本设计时应删除 `codex-gui/src/features/chatTextModel/**` 以及所有对以下符号的引用:

```ts
buildChatTextModel
selectChatTextModel
ChatTextModel
ChatTextTurn
ChatTextMessageEntry
ChatTextGlobalStatus
```

不得用新名字重新创建等价的完整树 selector。尤其不能新增如下形态作为 production surface:

```ts
type CompleteTranscriptSurface = {
  turns: Array<{
    id: string;
    entries: TranscriptEntry[];
  }>;
  globalStatus: TranscriptGlobalStatus[];
};
```

## 新 surface 边界

`committedTranscriptSurface` 是 React UI 读取层, 不是新的 facts owner。它不复制
`transcriptState` 的事实, 不维护独立顺序索引, 不保存 React node、DOM、wrapped lines 或
rendered Markdown tree。

它只能组合和导出面向组件粒度的读取入口:

```ts
selectTranscriptTurnIds(state): string[]
selectTranscriptTurn(state, turnId): TranscriptTurn | null
selectTranscriptChunkIdsForTurn(state, turnId): string[]
selectTranscriptChunk(state, chunkId): TranscriptChunkView | null
selectTranscriptEntry(state, entryId): TranscriptEntry | null
selectTranscriptGlobalStatus(state): TranscriptGlobalStatus[]
```

如果实现需要为 React ergonomics 增加 wrapper hooks 或 tiny view helpers, 这些 wrapper 必须保持
bounded:

- root 级读取只能返回 turn ids 和 global status;
- turn 级读取只能返回该 turn 的 status 和 chunk ids;
- chunk 级读取只能返回单个 bounded chunk view;
- entry 级读取只能返回单个 entry 或 chunk 内的 bounded entry list;
- helper 不得重新 materialize 完整 transcript tree。

## React component boundary

Production chat surface 按以下组件粒度拆分:

```text
CommittedTranscriptRoot
  -> CommittedTranscriptGlobalStatus
  -> CommittedTranscriptTurnList
      -> CommittedTranscriptTurn
          -> CommittedTranscriptChunk
              -> CommittedTranscriptEntry
```

订阅规则:

- `CommittedTranscriptRoot` 订阅 `selectTranscriptTurnIds` 和 global status;
- `CommittedTranscriptTurn` 订阅 `selectTranscriptTurn` 和 `selectTranscriptChunkIdsForTurn`;
- `CommittedTranscriptChunk` 订阅 `selectTranscriptChunk`;
- `CommittedTranscriptEntry` 只消费父 chunk 传入的 bounded entry 或按 id 订阅单 entry;
- component memoization 的边界是 turn id、chunk id、chunk revision 和 entry revision。

本阶段允许 DOM 中仍挂载所有 committed chunks, 因为真实 virtualization 被 defer。但代码结构必须让
后续 windowing 可以在 turn/chunk 层插入, 而不需要重新设计 transcript facts 或恢复完整树 model。

## Committed-only 阶段语义

本阶段的新 production chat surface 只展示已经进入 `transcriptState` committed chunks 的内容:

- attach snapshot 中 finalized user / assistant messages;
- live `itemCompleted` 生成或更新的 finalized user / assistant messages;
- committed global status, 例如 subscription interrupted。

本阶段不展示:

- `itemStarted` 产生的 running activity;
- assistant token streaming delta;
- running tool / hook / plan / reasoning;
- active tail live preview;
- TUI transcript overlay 的 live tail 等价物。

这些缺口必须在 UI 语义中显式接受。不能为了补 running visibility 而把 transient items 写入
committed chunks, 也不能恢复 `chatTextModel` 作为临时 complete-tree fallback。

## 与 `transcriptState` 的关系

`transcriptState` 是 committed transcript facts owner。`committedTranscriptSurface` 是它的
production UI consumer。

边界:

- `transcriptState` 负责 attach rebuild、live committed entry apply、dedupe、chunk revision;
- `committedTranscriptSurface` 负责把 bounded selectors 接到 React component tree;
- `committedTranscriptSurface` 不解释 app-server projection event;
- `committedTranscriptSurface` 不读取 `snapshotTurns + eventBuffer`;
- `committedTranscriptSurface` 不依赖 `selectThreadTimelineMaterials`;
- `committedTranscriptSurface` 不拥有 active tail 状态。

## 与 TUI 的关系

TUI 的完整 live chat surface 包含 committed cells 和 active cell。本阶段只实现 committed half:

- 对齐: source-backed finalized entry、committed/read path 分离、bounded render unit;
- 不对齐: active cell、streaming tail、running hook/tool live cells、overlay live tail;
- 后续: active tail 设计应独立补齐不对齐部分, 并提供类似 `active_cell_revision` 的 revision /
  cache key。

因此本设计不能被当作 GUI v2 完成标准。它只是删除 complete-tree surface、建立 committed
production path 的阶段性设计。

## Windowing 策略

真实 virtualization / windowing 本阶段 defer。原因是当前最小目标是先移除 complete grouped data
path, 建立 chunk-level component boundary。

本阶段必须做到:

- 不从 selector 返回完整 transcript tree;
- 不在 surface helper 中聚合所有 chunks;
- 不要求 single component 订阅所有 chunk views;
- chunk component 能被后续 windowing 独立挂载或卸载;
- entry rendering 的 memoization key 能以 entry revision 或 chunk revision 表达。

本阶段不承诺:

- 不可见 chunk 不参与 DOM render;
- 滚动位置测量;
- dynamic height cache;
- prepend / backfill 历史;
- scroll anchoring。

这些属于后续 production windowing 设计。若实施中发现必须先做真实 virtualization 才能删除
`chatTextModel`, 应停止计划或实现, 回到设计层重新拆分。

## 测试契约

测试应证明新 surface 的边界, 而不是复制旧 `chatTextModel` 行为:

- surface root 只读取 turn ids 和 global status;
- turn component 或 helper 只读取单 turn 和 chunk ids;
- chunk component 或 helper 只读取单 bounded chunk;
- chat UI 可以渲染 attach snapshot 中的 finalized user / assistant messages;
- live `itemCompleted` 后对应 chunk 更新;
- `itemStarted` 不产生 committed UI entry;
- 删除 `chatTextModel` 后没有旧 symbol 引用;
- 不新增 complete-tree selector 或 `turns -> entries[]` production model。

测试不需要覆盖 active tail、streaming、running transient items 或真实 virtualization。

## 不变量

本设计完成后应满足:

- production chat surface 不再消费 `chatTextModel`;
- 代码中不再存在 `codex-gui/src/features/chatTextModel/**`;
- production chat surface 不消费 `selectThreadTimelineMaterials`;
- production chat surface 不读取 `snapshotTurns + eventBuffer`;
- production chat surface 不返回完整 transcript tree;
- React component boundary 至少拆到 turn / chunk / entry;
- active tail 仍是后续设计范围, 不能由 committed surface 临时代替;
- windowing 仍是后续设计范围, 但当前 component boundary 不阻碍后续插入。

## 后续设计

本设计之后至少还需要两个独立小设计:

- active tail facts owner: 覆盖 running / streaming / transient transcript-like items, 并补齐
  `selectActiveTailForTurn`;
- production windowing / virtualization: 在 committed chunk boundary 上实现真实可见窗口、滚动测量
  和不可见 chunk 卸载。
