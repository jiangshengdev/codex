# codex-gui frontend performance hot paths

日期: 2026-06-23
状态: ✅ 已拆分
范围: `codex-gui` 前端性能热点
优先级: 未定

## 摘要

该 issue 已拆分为更小的独立问题文件。

## 拆分索引

- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-01-projection-event-top-level-react-state.md`: Projection event 顶层 React state 热路径。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-02-transcript-chunk-selector-view-rebuild.md`: Transcript chunk selector 重建 view 热路径。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-03-item-started-dirties-transcript-state.md`: itemStarted 无可见 transcript 变化仍 dirty transcriptState。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-04-long-transcript-no-windowing.md`: 长 transcript 没有窗口化或渲染裁剪。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-05-heroui-full-css-import.md`: 首屏同步加载 HeroUI 全量 CSS。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-06-temporary-grouping-full-turn-scan.md`: Temporary grouping 重复处理完整 turn entries。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-07-transcript-revision-invariant.md`: Transcript revision invalidation invariant。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-08-projection-delta-redux-action-frequency.md`: Projection delta Redux action 频率热路径。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-09-projection-delta-transient-text-concat.md`: Projection delta transientText 字符串累加热路径。
- `docs/superpowers/issues/2026/06/2026-06-23-01-codex-gui-frontend-performance-hot-paths/2026-06-23-10-live-slot-selector-cache-invalidation.md`: Live slot selector cache 高频失效。

## 后续处理

后续更新在对应子 issue 中维护；父 issue 只保留索引。
