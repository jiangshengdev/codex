# itemStarted 无可见 transcript 变化仍 dirty transcriptState

日期: 2026-06-23
状态: ✅ 已修复
范围: `codex-gui/src/features/transcriptState`
优先级: 未定

## 摘要

首次 `itemStarted` 仍会创建 renderable live slot，属于预期 live-state 写入；重复 live `itemStarted` 的窄边界已修复。

## 问题

修复前，`threadRuntimeEventBuffered` 进入 `transcriptState` 后会先做 duplicate window 记录, 随后
`itemStarted` 分支直接返回。该事件不会产生 committed entry, 也不会更新当前可见 transcript
内容, 但此时 `appliedEventIdsById` / `appliedEventOrder` 已经被修改。

这会让 transcript slice 在无可见输出变化时变脏, 触发相关 selector 重新运行。

2026-07-04 评估后，首次 `itemStarted` 不再是纯 no-op；问题边界收窄为已有 live slot 但不同
`commitId` 的重复 `itemStarted`。2026-07-09 该窄边界已修复。

## 证据

2026-07-09 当前代码复核:

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:162`: `recordAppliedEvent` 仍负责写入
  `appliedEventIdsById` / `appliedEventOrder`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:548`: `threadRuntimeEventBuffered` 现在会在
  `recordAppliedEvent` 前识别已有 live slot 的 `itemStarted` 并直接返回。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:220`: `hasLiveItem` 复用 live item key 规则，
  使重复 live `itemStarted` 能按 `turnId + item.id` 判断。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:237`: 新 live item 的 `transientText` 初始化为空字符串，
  首次 `agentMessage` started item 仍是 renderable live state。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:249`: duplicate live
  `itemStarted` 覆盖 `transcriptState` identity，证明重复事件是 true no-op。

历史验证证据:

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:47` 覆盖 `itemStarted`
  创建 started live slot 且不创建 committed transcript entry。
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts:1031` 覆盖
  `snapshotDuplicate` 不触碰 live slots。

## 判断

2026-07-04 评估:原问题描述已经部分过期。当前 `itemStarted` 不再是纯 no-op, 它会创建
`turnId + itemId` keyed live slot, 并通过 `selectTranscriptLiveItem` /
`selectTranscriptLiveItemsForTurn` 暴露 renderable live item。该路径仍不创建 committed entry /
chunk, 也不更新 committed scroll key。

2026-07-09 判断:该 issue 已修复。首次 `itemStarted` dirty `transcriptState` 属于预期的 renderable
live slot 写入；同一 `turnId + item.id` 已存在 live slot 时，重复 live `itemStarted` 会在
`recordAppliedEvent` 前返回，不再写入 applied-event window，也不改变 renderable transcript state。

## 修复记录

2026-07-09:

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts` 中 duplicate live
  `itemStarted` 测试新增 `transcriptState` identity 断言，证明重复事件必须 true no-op。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts` 在 `ensureLiveItemsForTurn` 后新增
  `hasLiveItem` helper。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts` 的 `threadRuntimeEventBuffered` reducer 在
  `recordAppliedEvent` 前对已有 live slot 的 `itemStarted` 直接 `return`，使不同 `commitId` 但同
  `turnId + item.id` 的 duplicate live `itemStarted` 不再写入 applied-event window，也不改变 renderable
  transcript state。

## 验证记录

- 在 `/Users/jiangsheng/cnb/codex/codex-gui` 运行
  `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`:
  exit 0，`Test Files 1 passed (1)`, `Tests 28 passed (28)`, `Type Errors no errors`。
- 在 `/Users/jiangsheng/cnb/codex/codex-gui` 运行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`: exit 0，`All matched files use the correct format.`。
- 在 `/Users/jiangsheng/cnb/codex/codex-gui` 运行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`: exit 0，`tsc -b --noEmit` 无错误。

## 影响

首次 `itemStarted` dirty `transcriptState` 现在属于预期 live-state 写入, 不再属于“无可见 transcript
变化”的问题。对 committed transcript 输出而言, 当前仍不创建 entry/chunk, 且 chunk view / live item
view 缓存降低了下游重算成本。

重复 live slot 的不同 `commitId` `itemStarted` 现在不会改变 live slot 或 committed transcript 输出，
也不会更新 applied event window；该 issue 无已知残留影响。

## 后续处理

该 issue 无剩余处理项。未来如果触碰 live item indexing 或 stale-index 防御，可另开 issue 记录新的问题边界；
本 issue 不再写 implementation plan。
