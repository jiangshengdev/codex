# Projection delta transientText 字符串累加热路径

日期:2026-07-06
状态:未修复
范围:`codex-gui/src/features/transcriptState`

## 问题摘要

当前实现把 agent message delta 直接追加到 `TranscriptLiveSlot.transientText`:

```ts
slot.transientText += delta;
slot.status = "streaming";
slot.revision += 1;
```

JS 字符串不可变。长回答如果按小 delta 高频追加, `transientText += delta` 会反复复制已有文本。
随着 `transientText` 增长, 单次追加成本也会增长, 整体可能接近 `O(n^2)` 累积成本。

## 原始证据

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:27`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:256`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:267`

## 当前判断

这个问题独立于 Redux action 频率。即使未来做了 dispatch 节流, 如果内部仍用长字符串反复 `+=`,
长文本 streaming 仍可能在合并点出现复制成本。

## 建议方向

1. 避免用 `transientText += delta` 作为长文本累积结构。
2. 可评估 delta 数组、rope-like buffer 或提交前 join。
3. 对 UI 暴露仍可保持最终 `transientText` 字符串, 但内部累积结构不应强制每个 delta 都复制全文。
