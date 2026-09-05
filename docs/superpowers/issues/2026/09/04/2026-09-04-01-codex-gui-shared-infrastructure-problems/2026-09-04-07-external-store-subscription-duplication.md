# External-store subscription 样板重复

日期: 2026-09-04
状态: ✅ 已修复
范围: `codex-gui/src/subscriptions/**` 及 `codex-gui/src/features/**` 中 10 个 external-store owner 与 controller
优先级: P3

## 摘要

10 个生产消费者已共用 `createListenerSet` 的订阅、同步通知与清空机制，各自继续管理 state、dispose、generation、请求合并与失败语义。

## 问题

修复前，多个 owner 和 UI controller 都手写 React external-store 所需的订阅机制。机械部分相似，但实现被嵌入各自生命周期：有的拒绝 disposed 后订阅，有的管理异步 generation 和请求合并，有的只桥接 Lexical editor 更新。

原问题分为样板重复与共享边界待复核两个层次。复核后仅抽取 listener 集合机制，不引入通用 owner 基类或统一异步状态机。

## 证据

- 修复提交：`0b25ce4eb`（`refactor(gui): share external store listener subscriptions`）。
- `codex-gui/src/subscriptions/listenerSet.ts`: `createListenerSet` 提供 `subscribe / notify / clear`，直接同步遍历实时 Set；不管理业务状态或生命周期。
- 10 个生产消费者已接入：`activeThreadSession` 的 session、live session、status，Composer 的 editor、input queue coordinator、pending-input session、turn application，skill catalog，以及 history list/detail owner。
- `codex-gui/src/subscriptions/__tests__/listenerSet.test.ts`: 6 个测试覆盖去重、取消、实例隔离、清空后订阅、通知期间增删与清空、同步重入、原始异常传播及后续可用性。

以下为修复前的历史证据，行号对应研究基线：

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`；静态扫描确认 10 个生产文件创建 `Set<() => void>` listener 集合（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/skillCatalog/skillCatalogOwner.ts:30-58,168-180`: owner 同时维护 listener、disposed、generation、request coalescing，并在 publish 时通知。
- `codex-gui/src/features/threadHistory/threadHistoryListOwner.ts:39-64,155-167`: history list owner 重复 subscribe/publish 结构，并拥有分页与 generation 生命周期。
- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts:18-43,105-117`: history detail owner 使用相似结构，但状态与请求语义不同。
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx:319-382`: editor controller 也维护 listener 集合，但 publish 来源是 Lexical update，并没有上述异步 owner 的 dispose/generation 形状。

## 判断

问题已修复。共同机制收敛到组合式 listener 工具；disposed 门禁、状态更新、通知条件及清理顺序仍由各 owner 维护。会话销毁前最后一次通知与其他 owner 销毁时不通知的差异均保留。

## 修复记录

2026-09-05：新增共用工具及契约测试，迁移 10 个生产消费者；保留实时 Set 的同步遍历、重入和异常传播行为。独立复核未发现可操作问题。

## 验证记录

2026-09-05，在修复提交对应代码上完成：

- Level 1：相关单元测试 412/412 通过（40 个文件）；新工具测试经 lint 写法修正后再次运行，6/6 通过。
- Level 1：历史页面、编辑器生命周期、Composer 会话及 `AppActiveThreadSession` 的无头 Browser 回归，在 Chromium、Firefox、WebKit 中合计 219/219 通过（18 个测试文件实例）。
- `type-check`、`lint`、`format:oxfmt` 与 `git diff --cached --check` 均通过。
- Level 2、Level 3：按已确认计划不适用；本次为内部订阅机制抽取，未执行真实应用或可见桌面验收。

## 影响

订阅与通知机制集中维护，减少各处重复修改产生差异的机会；generation、pagination、retry、stale-state 及各自生命周期约束继续由原功能维护。

## 后续处理

本问题已关闭。后续通知机制变化在共用工具及契约测试中维护；业务状态和生命周期变化仍在对应 owner 中处理。

## 历史记录

2026-09-04：确认 10 个生产文件存在样板重复，共享边界尚待复核；建议先核对 subscribe、publish、dispose 和 reentrancy 语义并量化纯机械代码，再进入设计与计划。该待复核结论已由上述修复记录取代。
