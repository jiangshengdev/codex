# itemStarted 无可见 transcript 变化仍 dirty transcriptState

日期:2026-06-23
状态:部分过期，仍有窄边界
范围:`codex-gui/src/features/transcriptState`

## 问题摘要

`threadRuntimeEventBuffered` 进入 `transcriptState` 后会先做 duplicate window 记录, 随后
`itemStarted` 分支直接返回。该事件不会产生 committed entry, 也不会更新当前可见 transcript
内容, 但此时 `appliedEventIdsById` / `appliedEventOrder` 已经被修改。

这会让 transcript slice 在无可见输出变化时变脏, 触发相关 selector 重新运行。

## 现状更新

2026-07-04 评估:原问题描述已经部分过期。当前 `itemStarted` 不再是纯 no-op, 它会创建
`turnId + itemId` keyed live slot, 并通过 `selectTranscriptLiveItem` /
`selectTranscriptLiveItemsForTurn` 暴露 renderable live item。该路径仍不创建 committed entry /
chunk, 也不更新 committed scroll key。

仍存在的窄边界是: `recordAppliedEvent` 仍在事件分支前执行。如果同一 `turnId + item.id`
已经有 live slot, 但又收到不同 `commitId` 的 `itemStarted`, `upsertStartedLiveSlot` 会直接返回,
此时除了 `appliedEventIdsById` / `appliedEventOrder` 外没有新增可渲染状态变化。

## 证据

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:182` 记录 applied event window。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:560` 先检查重复 `commitId`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:564` 在事件分支前写入 applied event window。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:582` `itemStarted` 进入 live slot 分支。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:235` `upsertStartedLiveSlot` 创建 live slot, 已存在时直接返回。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:44` 覆盖 `itemStarted`
  创建 started live slot 且不创建 committed transcript entry。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:659` 覆盖
  `snapshotDuplicate` 不触碰 live slots。

## 影响

首次 `itemStarted` dirty `transcriptState` 现在属于预期 live-state 写入, 不再属于“无可见 transcript
变化”的问题。对 committed transcript 输出而言, 当前仍不创建 entry/chunk, 且 chunk view / live item
view 缓存降低了下游重算成本。

残留影响集中在重复 live slot 的不同 `commitId` `itemStarted`: 该事件不会改变 live slot 或 committed
transcript 输出, 但仍会更新 applied event window, 使 `transcriptState` 变脏。

## 建议方向

复核 `transcriptState` 的 renderable-state 边界:

1. 保留首次 `itemStarted` 写入 live slot 的 renderable-state 边界。
2. 如需继续收敛该问题, 只处理“已有 live slot + 不同 `commitId` 的重复 `itemStarted`”这一窄边界。
3. 继续区分 `ProjectionIngressAdapter` 的 commit-chain 去重和 `transcriptState` 的 reducer 幂等窗口:
   前者按 projection head / commit chain 过滤, 后者仍保护 slice 内重复应用。
