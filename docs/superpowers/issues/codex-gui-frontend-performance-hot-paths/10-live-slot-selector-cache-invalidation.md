# Live slot selector cache 高频失效

日期:2026-07-06
状态:未修复
范围:`codex-gui/src/features/transcriptState`

## 问题摘要

`selectCachedLiveItemsForTurn` 用 `liveTurn.revision`、`slotKeys` 和 `slotRevisions` 判断缓存是否可复用:

```ts
const slotRevisions = slots.map(({ slot }) => slot.revision);
```

每个 projection delta 都会执行:

```ts
slot.revision += 1;
```

因此每个 delta 都会让当前 turn 的 live item view cache 失效, 重新 materialize
`TranscriptRenderableLiveItem[]`。缓存能限制重建范围, 但不能避免高频 delta 对当前 live turn selector
的持续 invalidation。

## 原始证据

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:115`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:267`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:441`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:525`

## 当前判断

这个问题独立于字符串累加。即使文本累积结构优化了, 只要每个 delta 都 bump `slot.revision`, 并让
selector 立刻暴露新的 renderable view, 当前 turn 的 live item selector 仍会按 delta 频率重建 view。

## 建议方向

1. 区分内部 delta 接收频率和 UI view invalidation 频率。
2. 评估按帧或节流 bump render revision。
3. 保持 `slotOrder` 的稳定顺序语义, 但避免纯文本追加导致整个 live turn view 每次重建。
