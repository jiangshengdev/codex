# Thread History 标题选择规则重复实现

日期: 2026-09-04
状态: 🔴 未修复
范围: `codex-gui/src/features/threadHistory`
优先级: P3

## 摘要

History list 与 detail 分别实现 `name`、`preview`、fallback 的 trim 和优先级规则，规则相同但没有 feature-local owner。

## 问题

两个同属 `threadHistory` 的消费者独立决定线程标题：先使用 trim 后的 `name`，否则使用 trim 后的 `preview`，最后使用 fallback。List 还基于相同 normalized 值决定是否显示 summary。

这是 feature-local 重复，不是跨应用字符串基础设施缺失；将其提升为全局 string helper 会丢失 History 标题语义。

## 证据

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx:132-138`: list card 独立 trim `name`/`preview`，选择 `name || preview || t\`Untitled task\``，并用 normalized 值决定 summary。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx:100-103`: detail 的 `threadTitle` 重复 `name || thread.preview.trim() || fallback` 规则。

## 判断

问题仍成立，且 owner 边界清楚：应先作为 `threadHistory` 内部领域规则处理。当前没有跨 feature 消费证据支持将其升级为全局设施。

## 影响

后续调整空白归一化、fallback 或 summary 判定时，list 与 detail 可能显示不同标题；重复也会让测试分别固化近似但不完全一致的规则。

## 后续处理

需要在 `threadHistory` 范围内复核标题与 summary 的完整产品语义，再进入设计或计划阶段确定 feature-local 契约和验证边界；不创建全局字符串 util。
