# External-store subscription 样板重复但共享边界待复核

日期: 2026-09-04
状态: 📏 待复核
范围: `codex-gui/src/features/**` 中使用 `Set<() => void>` 的 external-store owner 与 controller
优先级: P3

## 摘要

至少 10 个生产文件重复 listener 集合、subscribe/unsubscribe 和 publish notification 样板，但它们的 state、dispose、generation、请求合并与失败语义不同，尚不足以确认统一抽象。

## 问题

多个 owner 和 UI controller 都手写 React external-store 所需的订阅机制。机械部分相似，但实现被嵌入各自生命周期：有的拒绝 disposed 后订阅，有的管理异步 generation 和请求合并，有的只桥接 Lexical editor 更新。

因此当前问题分为两个层次：样板重复是事实；是否存在安全且有价值的共享 primitive 尚未闭合。不能直接抽取通用 owner 基类或统一异步状态机。

## 证据

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`；静态扫描确认 10 个生产文件创建 `Set<() => void>` listener 集合（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/skillCatalog/skillCatalogOwner.ts:30-58,168-180`: owner 同时维护 listener、disposed、generation、request coalescing，并在 publish 时通知。
- `codex-gui/src/features/threadHistory/threadHistoryListOwner.ts:39-64,155-167`: history list owner 重复 subscribe/publish 结构，并拥有分页与 generation 生命周期。
- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts:18-43,105-117`: history detail owner 使用相似结构，但状态与请求语义不同。
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx:319-382`: editor controller 也维护 listener 集合，但 publish 来源是 Lexical update，并没有上述异步 owner 的 dispose/generation 形状。

## 判断

重复数量已确认，共享抽象价值和最小边界仍待复核。当前最多能提出组合式 subscribe/notify primitive 作为调查候选；证据不支持继承基类、通用异步 owner 或统一 state storage。

## 影响

继续复制机械订阅代码会增加 unsubscribe、dispose 后行为和通知时序不一致的机会；过早统一则可能吞并每个 owner 的 generation、pagination、retry 和 stale-state 约束，形成更难理解的通用框架。

## 后续处理

先复核全部 10 个消费者的 subscribe、publish、dispose 和 reentrancy 语义，并量化可删除的纯机械代码；只有共同不变量稳定后，才进入设计阶段评估组合式 primitive，随后另行编写计划。
