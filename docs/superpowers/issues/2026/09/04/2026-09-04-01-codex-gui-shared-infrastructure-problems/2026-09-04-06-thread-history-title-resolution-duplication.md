# Thread History 标题选择规则重复实现

日期: 2026-09-04
状态: ✅ 已修复
范围: `codex-gui/src/features/threadHistory`
优先级: P3

## 摘要

History list 与 detail 已共用 `threadHistory` 内部的 `resolveThreadHistoryPresentation`，统一标题选择与摘要去重，保持原有显示行为。

## 问题

修复前，两个同属 `threadHistory` 的消费者独立决定线程标题：先使用 trim 后的 `name`，否则使用 trim 后的 `preview`，最后使用 fallback。List 还基于相同 normalized 值决定是否显示 summary。

这是 feature-local 重复，不是跨应用字符串基础设施缺失；将其提升为全局 string helper 会丢失 History 标题语义。

## 证据

- 修复提交：`84c9725d6`（`refactor(gui): centralize thread history title presentation`）。
- `codex-gui/src/features/threadHistory/threadHistoryPresentation.ts`: `resolveThreadHistoryPresentation` 从协议 `Thread` 派生输入字段，统一返回 `{ title, summary }`；列表使用两者，详情使用标题。
- `codex-gui/src/features/threadHistory/__tests__/threadHistoryPresentation.test.ts`: 覆盖空值、纯空白、标题优先级、摘要去重、大小写差异和内部空白保留。
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx`: 新增预览与默认标题回退的页面断言。

以下为修复前的历史证据，行号对应研究基线：

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx:132-138`: list card 独立 trim `name`/`preview`，选择 `name || preview || t\`Untitled task\``，并用 normalized 值决定 summary。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx:100-103`: detail 的 `threadTitle` 重复 `name || thread.preview.trim() || fallback` 规则。

## 判断

问题已修复。标题选择和摘要去重由 `threadHistory` 内部单一函数维护；默认标题仍由页面翻译后传入。浏览器标签标题的空白压缩、截断和后缀规则继续由原模块维护。

## 修复记录

2026-09-05：新增共用展示规则并接入列表、详情，删除原有重复计算；未创建全局字符串 util，未改变标题与摘要的产品语义。

## 验证记录

2026-09-05，在修复提交对应代码上完成：

- Level 1：规则单元测试 12/12 通过；列表与详情读取测试在 Chromium、Firefox、WebKit 中合计 75/75 通过（6 个测试文件实例）。
- `lint`、`type-check`、`format:oxfmt` 与 `git diff --check` 均通过。
- Level 2、Level 3：按已确认计划不适用；本次为内部规则抽取，不涉及运行时集成或桌面行为，未执行真实应用或可见桌面验收。

## 影响

已消除列表与详情因分别维护标题选择规则而发生漂移的风险；现有标题、摘要去重与翻译行为保持不变。

## 后续处理

本问题已关闭。后续如需调整标题或摘要语义，在共用规则及对应测试中维护。

## 历史记录

2026-09-04：判断问题仍成立，建议先复核标题与 summary 的完整产品语义，再设计 feature-local 契约和验证边界；没有跨 feature 消费证据支持升级为全局设施。该待处理结论已由上述修复记录取代。
