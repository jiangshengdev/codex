# Codex GUI 分批代码质量评审汇总

日期：2026-09-08。评审基线：`63762612e56d332f474a5ba3861b22be761f0479`（dev）。本轮完成静态评审、各批独立复核及跨模块收敛；未修改产品代码或执行修复。

## 总体结论

共覆盖 396 个跟踪文件，划分为 13 批，发现 **8 项确定缺陷、3 项可维护性建议、4 项待验证风险**。确定缺陷均为 P2，集中在编辑能力失效、快照去重、合法活动渲染、未知交付记录清理与恢复入口。当前证据不足以认定存在 P0/P1 问题，也不代表这些问题不存在。

前端已有明确的 session、queue、projection 与 transcript 职责边界。主要问题出现在边界交接时，不能仅凭规模增长推导整体重构必要性。优先按下列具体根因安排修复，每项正文均保留整改方向、必须保持的约束及验收条件。

## 确定缺陷

| 编号 | 优先级 | 用户影响 | 权威正文 |
| --- | --- | --- | --- |
| QR-B03-001 | P2 | 普通流式更新使待发送编辑保存失败，丢本次修改，原队列文本仍保留 | [B03](./batch-03-sessions.md) |
| QR-B04-001 | P2 | 连接替换后历史详情 Retry 继续调用失效能力 | [B04](./batch-04-new-and-history.md) |
| QR-B06-001 | P2 | attach 时进行中的协作活动，后续完成事件被误去重而不显示 | [B06](./batch-06-transcript-state.md) |
| QR-B07-001 | P2 | 合法全下划线 AgentPath 美化后抛错，影响对话渲染 | [B07](./batch-07-transcript-display.md) |
| QR-B09-001 | P2 | unknown merge 无法移除，所有权检查使保存回滚并阻止发送 | [B09](./batch-09-input-queue.md) |
| QR-B09-002 | P2 | unknown 移除成功后界面快照未更新，合法待发项不能继续推进 | [B09](./batch-09-input-queue.md) |
| QR-X03-001 | P2 | 正常关闭连接后当前任务无提示变为空白，无页面内恢复入口 | [跨模块](./cross-module-review.md) |
| QR-X03-002 | P2 | 投影暂停已有正文通用重连提示及错误标记，但缺少具体原因与可执行恢复入口 | [跨模块](./cross-module-review.md) |

建议首先处理用户输入保存和队列继续的 QR-B03-001、QR-B09-001/002，再处理恢复能力与反馈的 QR-B04-001、QR-X03-001/002，以及活动状态和展示的 QR-B06-001、QR-B07-001。这是后续排期建议，不是已经获准执行的修复计划。

## 可维护性建议

| 编号 | 优先级 | 具体成本 | 正文 |
| --- | --- | --- | --- |
| QR-B09-003 | P2 | interrupt 持久化借用 steer validator，绑定两个独立契约演进面 | [B09](./batch-09-input-queue.md) |
| QR-B13-001 | P3 | README 仍为 Vite 模板，缺少当前项目入口指引 | [B13](./batch-13-engineering-tests.md) |
| QR-B13-002 | P3 | E2E 布局测量缺节点时回退为 0，仅上界断言可能虚通过；当前 .surface 仍存在 | [B13](./batch-13-engineering-tests.md) |

## 待验证风险

| 编号 | 已知事实与尚缺证据 | 正文 |
| --- | --- | --- |
| QR-B02-001 | RPC error 被视为明确未接受；当前 GUI settings 失败支路已排除，缺正常生产参数已接受后报错与显式恢复幂等证据。未确认重复发送 | [B02](./batch-02-connection.md) |
| QR-B09-004 | terminal 先于 accepted 且无 commit 时可能滞留；已有 snapshot 恢复收敛，缺完整生产转发时序证据 | [B09](./batch-09-input-queue.md) |
| QR-B12-001 | parentCommitId schema 可缺但 TS 必有，运行 predicate 保证偏强；当前 Rust 正常输出 null/string，未证明后端会省略。反例会显式暂停而非静默污染 | [B12](./batch-12-contracts-fixtures.md) |
| QR-B13-003 | eslint-plugin-react peer 范围与 ESLint 10 不符，当前仅消费 jsx-runtime 配置；未证实运行失败 | [B13](./batch-13-engineering-tests.md) |

风险不计入确定缺陷；其潜在后果不能替代可达性证据。

## 范围、方法与报告索引

以职责确定唯一文件主归属，关联读取允许重叠但不重复计覆盖或发现。每批检查行为、状态生命周期、异常恢复、契约安全、性能、职责耦合和测试有效性；逐文件 SHA-256 与完成状态见 [覆盖与进度](./coverage-and-progress.md)。跟踪的生成物按权威生成链检查，锁文件按声明与解析检查；缓存、依赖目录、构建和测试运行产物排除。后端只追踪直接相关契约，不属于后端全量评审。

| 批次 | 职责 | 文件数 | 报告 |
| --- | --- | --- | --- |
| B01 | 应用入口、页面装配与导航 | 29 | [B01](./batch-01-app-shell.md) |
| B02 | 连接、认证与 RPC | 20 | [B02](./batch-02-connection.md) |
| B03 | 会话生命周期与持久化 | 24 | [B03](./batch-03-sessions.md) |
| B04 | 新建与历史 | 22 | [B04](./batch-04-new-and-history.md) |
| B05 | 运行事件接入 | 4 | [B05](./batch-05-runtime-ingress.md) |
| B06 | 对话状态、分块与分页 | 25 | [B06](./batch-06-transcript-state.md) |
| B07 | 对话与活动展示 | 25 | [B07](./batch-07-transcript-display.md) |
| B08 | 编辑器、输入与技能 | 29 | [B08](./batch-08-editor.md) |
| B09 | 输入队列与交付 | 44 | [B09](./batch-09-input-queue.md) |
| B10 | 输入操作与会话集成 | 37 | [B10](./batch-10-turn-controls.md) |
| B11 | 公共反馈、身份、国际化与样式 | 21 | [B11](./batch-11-shared-platform.md) |
| B12 | 生成契约与 fixture | 41 | [B12](./batch-12-contracts-fixtures.md) |
| B13 | 工程配置与集成测试 | 75 | [B13](./batch-13-engineering-tests.md) |
| 合计 | 13 批 | 396 | [跨模块复核](./cross-module-review.md) |

[设计](./design.md) 与 [计划](./plan.md) 保留落盘时历史状态；后续用户明确确认执行，实际状态以覆盖记录为准。未对账旧报告。

## 实际验证

cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`，fnm 管理的 pnpm 为 10.34.5。

- V-01：本地 15:43:13 开始，liveActiveThreadSession 与 subAgentActivityPresentation 两个单测文件，32 测试通过、无类型错误，退出 0，1.27 秒。精确命令见 B03。
- V-02：本地 15:50:43 开始，composerQueueRecordIdentityPersistence、composerInputQueuePersistence、composerCoordinatorPersistence 三个单测文件，32 测试通过、无类型错误，退出 0，1.05 秒。精确命令见 B09。

合计 **5 个不同文件、64 测试通过**。B03 stale-edit、B07 合法名字 throw 的现有断言接受当前问题行为；B09 测试只覆盖邻近所有权、事务和基础恢复条件。不能以这些通过结果证明新发现的组合场景已通过，更不表示修复完成。

本轮未运行 Browser Mode、E2E、完整 CI/lint、协议生成、性能测量、后端测试或真实 runtime。Level 2 与可见桌面 Level 3 验收均未执行。所有缺陷的运行验证缺口保留在对应正文，后续验收应覆盖具体触发组合。

## 执行与交接

实际并行覆盖初批七个独立调查分支及主代理 B01/B05；后续批次、独立复核与跨模块子问题按产物就绪推进。V-01/V-02 独占同一 runner 顺序执行。早期 B04/B08/B13 等待七个子代理槽位释放，无按批次编号制造串行门禁。

实际关键路径为前置文档提交 → 固定基线 → 会话/队列等调查与独立复核 → X01/X02/X03 → 汇总与最终独立审查 → 报告提交。计划内报告纠错已吸收，不转为源码修复。最终覆盖、组合核验和提交边界见 [执行记录](./coverage-and-progress.md)。

本轮交付是可追踪的评审与整改交接；未新建修复 issue、未改代码、未操作远程。前置文档提交为 `63762612e`；报告作为独立本地提交交付。
