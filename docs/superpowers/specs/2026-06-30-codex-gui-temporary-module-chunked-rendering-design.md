# Codex GUI temporary module chunked rendering design

日期: 2026-06-30
状态: 设计中
范围: `codex-gui/src/features/transcriptState`, `codex-gui/src/features/committedTranscriptSurface`

## 背景

`committedTranscriptSurface` 当前已经把 turn 的展示结构拆成 leading prompt、middle temporary
content 和 final assistant message 三段。这修掉了旧 `committedTranscriptDisplayGroups.ts`
在 UI 层重新判断 final boundary 的问题，但 temporary module 仍会在 render 路径中把一个 turn
的所有 middle chunks 展平成完整 entries 数组。

这违反 `codex-gui/AGENTS.md` 中的 transcript 性能边界:

- transcript hot path 不应把 chunked data 重新变成 full-turn arrays。
- 折叠状态下不应渲染所有 hidden entries。
- unchanged chunks 应保持稳定 selector results，并避免被后续 chunk append 牵连重渲染。

目标是保留当前用户可见行为，同时恢复 temporary content 的 chunk-level 渲染边界。

## 设计决策

### Final answer 保持简单路径

Final answer 不参与 chunk-level temporary rendering。正常情况下 final answer 只有一个，即使异常
情况下出现多个，也不是主要性能热点。继续通过 `finalAssistantEntryIds` 和 `FinalAssistantMessages`
渲染即可。

### Temporary module 保持 turn 级外观，内部按 chunk 渲染

`MiddleTranscriptModule` 继续代表一个 turn 的 temporary disclosure:

- final answer 出现前强制展开并 disabled。
- final answer 出现后可折叠，默认折叠。
- 跨多个 middle chunks 时仍只显示一个 temporary module。

但 module content 内部不再构造 `entries = chunks.flatMap(...)`。展开时渲染一组
`MiddleTranscriptChunk` 子组件，每个子组件只接收一个 `chunkId`，并在子组件内部调用
`selectTranscriptChunk(state, chunkId)`。

结构如下:

```text
CommittedTranscriptTurn
  LeadingPromptEntry
  MiddleTranscriptModule
    trigger: Intermediate updates · middleEntryCount items
    content:
      MiddleTranscriptChunk(chunkId: turn.middleChunkIds[0])
      MiddleTranscriptChunk(chunkId: turn.middleChunkIds[1])
      ...
  FinalAssistantMessages
```

这样新增 temporary entry 通常只影响最后一个 chunk。旧 chunk 的 `TranscriptChunkView` 和 React
子树可以继续保持稳定。

### 折叠时不渲染 hidden entries

当 `hasFinalAnswer === true` 且 temporary module 未展开时，`MiddleTranscriptModule` 只渲染
disclosure trigger 和空 content，不渲染 `MiddleTranscriptChunk`，也不创建任何 temporary entry
组件。

当 `hasFinalAnswer === false` 时，temporary module 仍强制展开，因此可以渲染 chunk content。

### `Intermediate updates` 数量来自 `TranscriptTurn.middleEntryCount`

为避免 label 自身重新扫描 chunks，`TranscriptTurn` 增加 `middleEntryCount`:

```ts
export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  leadingPromptEntryId: string | null;
  middleChunkIds: string[];
  middleEntryCount: number;
  finalAssistantEntryIds: string[];
};
```

`middleEntryCount` 与 `middleChunkIds` 同属 transcript state 的 committed render facts:

- 新建 turn 时初始化为 `0`。
- `appendEntryToMiddleChunk` 成功追加 entry 时递增。
- baseline rebuild 通过相同分类路径填充该计数。
- live update 修改已存在 middle entry 时不递增，只 bump 所属 chunk revision。
- final assistant entry 不计入 `middleEntryCount`。
- leading prompt entry 不计入 `middleEntryCount`。

UI 直接读取 `turn.middleEntryCount` 生成 label，不再为了 label 扫描所有 middle chunks。

## 不做的事

- 不恢复 `committedTranscriptDisplayGroups.ts`。当前 Redux turn structure 已经表达 leading /
  middle / final 三段，再恢复 display grouping 会重复推导并可能重新引入 full-turn scan。
- 不把 final answer 改成 chunk-level 渲染。
- 不重新引入 `hasFinalAnswerBeforeChunk` / `hasFinalAnswerAfterChunk` 这类过渡式 chunk boundary
  参数。
- 不在 collapsed temporary module 中用 `display: none` 隐藏已创建的所有 entries。

## 测试与验证

实现时需要更新或新增回归覆盖:

- final answer 出现前 temporary content 仍 forced open，trigger disabled。
- final answer 出现后 temporary module 默认折叠，final answer 在 module 外部可见。
- collapsed 状态下 temporary entry 文本不在 DOM 中；展开后才渲染出来。
- 101 条 commentary 跨 chunk 时仍只有一个 temporary module，label 显示 `101 items`。
- later user message 仍进入 temporary module。
- 多个 final assistant messages 仍在 temporary module 外部显示。
- transcript state 测试覆盖 `middleEntryCount` 初始化、baseline rebuild、live append、existing entry update
  不重复计数。

已确认 `codex-gui/package.json` 中存在以下脚本。实现后的建议验证命令:

```bash
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
pnpm run lint
pnpm run type-check
```

在 `codex-gui` 目录执行 `pnpm` 前，需要先按仓库规则初始化用户的 `fnm` 环境，并确认命中的
`pnpm` 不是 Codex runtime 自带版本。

## Issue 状态更新

实现完成后更新
`docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`:

- 记录旧 `groupTranscriptEntriesForDisplay` 路径已移除。
- 记录 temporary module render path 不再 full-turn flatten。
- 记录 collapsed 状态不再渲染 hidden temporary entries。
- 保留任何未解决风险，例如未来如果 temporary module 需要虚拟化或分页，应另开 issue。
