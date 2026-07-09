# Temporary grouping 重复处理完整 turn entries

日期: 2026-06-29
状态: ✅ 已修复
范围: `codex-gui/src/features/committedTranscriptSurface`
优先级: 未定

## 摘要

该 full-turn grouping 热路径已在 2026-06-30 修复，当前恢复为 chunk-level render boundary。

## 问题

`committedTranscriptSurface` 的 temporary content collapse 会在每次相关 turn 变化后重新处理该
turn 的全部 entries。当前路径先从所有 chunk view flatten 出完整 entries, 再执行 display
grouping。

单次 `groupTranscriptEntriesForDisplay` 调用不是 O(n²), 但它会执行多段线性扫描。随着同一 turn
持续追加 committed entries, 每次 chunk revision 变化都会让该 turn 重新 flatten/group 全量
entries, 累计成本会呈二次增长形态。

## 证据

2026-07-09 当前代码复核:

- 限定范围内搜索 `committedTranscriptDisplayGroups` / `groupTranscriptEntriesForDisplay` 未命中，旧 render-time grouping 文件和入口未见。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:127`: temporary module label 来自 reducer-owned `middleEntryCount`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:155`: 展开时按 `chunkIds.map(...)` 渲染 `MiddleTranscriptChunk`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:251`: `MiddleTranscriptModule` 接收 `turn.middleChunkIds`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:384`: `middleEntryCount` 在 append middle entry 时递增。

历史修复前证据:

完整 turn entries 派生路径:

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:141`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:145`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:146`

`groupTranscriptEntriesForDisplay` 的多段线性工作:

- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts:36`
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts:39`
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts:41`
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts:45`

temporary module id 额外扫描:

- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts:30`
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts:50`

## 判断

已修复。`committedTranscriptDisplayGroups.ts` 已移除，render path 不再重新推导 final answer boundary 或 flatten 全部 middle entries。

## 修复记录

2026-06-30:

- `committedTranscriptDisplayGroups.ts` 已在前序结构调整中移除，final answer boundary 不再由 render
  path 重新推导。
- `MiddleTranscriptModule` 保持 turn 级 disclosure 外观，但内部按 `middleChunkIds` 渲染
  `MiddleTranscriptChunk`，不再把所有 middle chunks flatten 成完整 entries 数组。
- `Intermediate updates` 数量来自 `TranscriptTurn.middleEntryCount`，label 不再扫描 chunks 或 entries。
- collapsed 状态下不再渲染 hidden temporary entries；展开后才挂载 chunk content。

剩余风险:

- 当前修复恢复 chunk-level render boundary；如果后续 temporary module 需要展示极长历史，虚拟化或分页应作为独立 issue 处理。

## 影响

修复前 chunk 化只限制了 selector materialization 的单 chunk 成本, 但 display grouping 又把成本提升回
turn 级别。跨 chunk temporary module 的需求会让该成本更容易出现在长 turn 中。修复后该 issue 记录的 full-turn grouping 热路径已消除。

## 后续处理

无需继续处理该 issue。若后续 temporary module 需要展示极长历史，应单独进入设计/计划阶段评估虚拟化或分页。

## 历史记录

修复前建议方向:

- 把 temporary grouping 改成 single pass, 在一次遍历中确定 final answer boundary、
  temporary segment 和输出 items。
- temporary module id 使用 grouping 过程中已经拿到的稳定边界, 例如 first temporary entry id,
  last temporary entry id 和 count, 不再表达完整 membership。
- 如果后续需要跨 chunk temporary module, 明确这是 turn-level display model, 并避免在每次
  chunk 变化后无条件重建完整 turn view-model。
