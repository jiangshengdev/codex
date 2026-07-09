# 长 transcript 没有窗口化或渲染裁剪

日期: 2026-06-23
状态: 🔴 未修复
范围: `codex-gui/src/features/committedTranscriptSurface`
优先级: 未定

## 摘要

长 transcript 仍缺少窗口化或渲染裁剪，DOM 数量和布局成本会随历史增长。

## 问题

当前 committed transcript surface 会渲染全部 turn、全部 chunk 和全部 entry。`memo` 可以减少
未变化子组件的 render, 但不能减少历史 DOM 节点数量, 也不能避免父组件每次 render 时遍历完整
turn 列表。

长时间会话或大 snapshot attach 后, 浏览器仍需要持有并布局完整历史 DOM。

## 证据

原始证据:

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:170`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:121`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:71`

2026-06-29 复核时, 该结构性风险仍存在:

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:236`

## 判断

未修复。selector 和 memo 优化不能替代渲染裁剪或窗口化；当前风险仍是结构性的长会话前端性能问题。

## 影响

这是长会话下最结构性的前端性能风险之一。即使 selector 和 memo 已优化, DOM 数量和布局成本仍会
随 transcript 历史增长。

## 后续处理

设计 committed transcript 的渲染裁剪或窗口化方案。该方案应保留:

- sticky-bottom 语义。
- snapshot attach 后的历史浏览能力。
- browser/snapshot 覆盖。
