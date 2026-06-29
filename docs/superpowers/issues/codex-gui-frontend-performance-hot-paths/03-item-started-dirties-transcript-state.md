# itemStarted 无可见 transcript 变化仍 dirty transcriptState

日期:2026-06-23
状态:未修复
范围:`codex-gui/src/features/transcriptState`

## 问题摘要

`threadRuntimeEventBuffered` 进入 `transcriptState` 后会先做 duplicate window 记录, 随后
`itemStarted` 分支直接返回。该事件不会产生 committed entry, 也不会更新当前可见 transcript
内容, 但此时 `appliedEventIdsById` / `appliedEventOrder` 已经被修改。

这会让 transcript slice 在无可见输出变化时变脏, 触发相关 selector 重新运行。

## 证据

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:325`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:342`

## 影响

大量 `itemStarted` 会制造无可见 committed transcript 输出的 state 写入。chunk view 缓存已降低
后续成本, 但该 slice dirty 行为仍然存在。

## 建议方向

复核 `transcriptState` 的 renderable-state 边界:

1. 如果当前 `itemStarted` 不产生可渲染 transcript state, 避免写入 applied-event window。
2. 如果未来要支持 pending / in-progress / streaming transcript UI, 再把 `itemStarted` 纳入
   renderable transcript state。
3. 去重职责优先确认是否已由 `ProjectionIngressAdapter` 覆盖。
