# codex-gui frontend performance hot paths

日期:2026-06-23
状态:已拆分

这份文件原本混合记录多个 `codex-gui` 前端性能问题。为避免一个问题分散在多个段落中, 问题已拆到
`docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/` 下, 每个文件只记录一个问题。

## 问题文件

1. `codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md`
2. `codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md`
3. `codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
4. `codex-gui-frontend-performance-hot-paths/04-long-transcript-no-windowing.md`
5. `codex-gui-frontend-performance-hot-paths/05-heroui-full-css-import.md`
6. `codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`

## 迁移说明

- 2026-06-27 和 2026-06-28 的修复状态已移动到对应问题文件。
- 2026-06-29 新发现的 temporary grouping 完整 turn 扫描问题只记录在
  `06-temporary-grouping-full-turn-scan.md`。
- 本文件仅保留索引, 不再承载问题正文。
