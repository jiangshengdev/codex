# B09 输入队列评审

日期：2026-09-08。源码基线：`63762612e56d332f474a5ba3861b22be761f0479`。

依据：[设计](./design.md)、[计划](./plan.md)、[覆盖与进度](./coverage-and-progress.md)。主范围为 `codex-gui/src/features/composerInputQueue/**`，共 44 个文件，包含 16 个实现文件和 28 个测试及 fixture 文件。路径与行号均对应固定基线，以下源码路径相对仓库根目录。

## 结论与证据边界

发现两个 P2 确定缺陷、一个 P2 可维护性问题、一项待验证时序风险。没有修改源码或测试，也未在本调查节点运行测试。现有测试内容仅作为静态覆盖依据，不代表本轮测试通过。Level 2、Level 3 不在本计划授权范围，均未执行。

已逐一读取主范围文件并追踪发送、steer、中断、持久化恢复、编辑与排序路径。调查结束时，针对主范围执行 `git diff 63762612e56d332f474a5ba3861b22be761f0479 -- codex-gui/src/features/composerInputQueue` 无差异。全局源码身份与最终验证由覆盖进度记录管理。

## 七个检查维度

| 维度 | 检查结论与依据 |
| --- | --- |
| 行为正确性 | 普通 FIFO、直接 steer、普通项提升、拒绝合并具有独立状态转移；移除 unknown 后快照和续发缺失见 QR-B09-002。 |
| 状态与生命周期 | claim、线程、turn、client ID 与 generation 防止跨 owner 消费；release readiness 纳入待发、待确认、恢复、编辑与保存失败。merge discard 漏掉子消息所有权见 QR-B09-001。 |
| 异常恢复 | `composerInputQueueCoordinator.ts:449-500` 先准备候选、保存，再执行 effects；保存失败保留原状态，`:513-518` 缓存服务端事实。start/steer issuing 刷新后变 unknown，恢复暂停不会自动重发 unknown。 |
| 契约与安全 | 请求参数直接引用权威协议类型，输入复制保留 variant；中断持久化却借用 steer validator，见 QR-B09-003。没有把业务数据持久化本身判作泄漏。 |
| 性能 | 预览按 grapheme 截断，详情分页；事务会复制并序列化队列。未测量成本，不由其存在推断性能缺陷。 |
| 职责与耦合 | ordinary/start/steer/interrupt 分别拥有状态，coordinator 拥有持久化和外部 effects；QR-B09-001/002 暴露 discard 未接入完整所有权与发布流程，建议按职责修正，不按文件长度拆分。 |
| 测试有效性 | 现有测试覆盖 claim 归属、乱序 start、中断响应、事务回滚、编辑 reservation、FIFO 移动与恢复。缺少 unknown merge discard、coordinator discard 后发布/续发及 terminal-before-steer-ack 组合。 |

## QR-B09-001：移除未知 merge 记录遗留原消息所有权

- 分类：确定缺陷。优先级：P2。
- 位置：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts:486-492`。
- 触发条件：steer 被拒绝或未发送的 steer 遇到目标终止，合并为 `rejectedSteerMerge` start；该 start 交付未知，或 issuing 时刷新；用户移除该本地未知记录。
- 证据：同文件 `:1094-1111` 创建合并容器，原 steer 仍由 transfer 所有。`:486-492` 只删除容器 ID；正常释放路径 `:1190-1203` 则调用 `releaseRejected` 并清理全部原 ID。discard 未调用完整释放路径。导出后子 ID 留在 `knownMessageIds`，但 transfer 已不在 start/recovery 序列化树中；`:531-570` 的精确所有权检查拒绝这些孤儿 ID。
- 生产闭合：`composerInputQueueCoordinator.ts:433-437` 通过持久化事务执行 discard；`composerCoordinatorPersistence.ts:40-42` 重新导入 queue；`codex-gui/src/features/browserPersistence/browserPersistenceStore.ts:128-139` 在写入前 decode，产生 payload 错误并回滚。
- 影响：用户无法移除合并未知记录，保存错误继续阻止发送。旧可恢复记录仍保留，没有证据表明消息已经丢失。
- 根因：start discard 只返回 boolean，调用方没有消费被丢弃 claim 的完整消息所有权。
- 验证状态：静态路径确定；未运行该组合。`__tests__/composerQueueRecordIdentityPersistence.test.ts:28`、`:122` 已构建 merge 并检查容器/原 ID，但未 discard；`__tests__/composerInputQueuePersistence.test.ts:78-88` 只丢弃普通 start。
- 整改涉及模块：start state、queue 所有权、coordinator persistence。
- 修正方向：在 start owner 丢弃未知 claim 时统一释放合并容器与 rejected transfer；让调用方取得需要释放的完整所有权信息。
- 必须保留：unknown 不自动重发、原子保存、精确身份检查、其余条目顺序。不得放宽 orphan 检查。
- 验收条件：live unknown 和刷新 issuing 两种 merge 均可成功 discard、保存与重新导入；无孤儿 ID、不重发被移除 merge、不影响其他条目。
- 关联：QR-B09-002 同属 discard 入口，但根因与整改点不同；X02 复核恢复与移除链路。

## QR-B09-002：移除未知记录后不发布快照或推进队列

- 分类：确定缺陷。优先级：P2。
- 位置：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts:433-437`。
- 触发条件：普通 start 或 steer 进入 unknown，用户按当前 revision 成功移除本地记录。
- 证据：该方法仅执行 `persistTransaction(() => this.queue.discardUnknown(id))`；没有 `publishSnapshot`、`consumeTransition` 或 drain。`:478-500` 的成功事务只执行操作显式排入的 effects，而该操作没有 effects。缓存 snapshot 因此仍包含旧 unknownMessages 与旧 persistence revision。
- 生产调用方：`codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts:178-183` 仅转发；`:437-470` 的外层事务不重建 coordinator 内部 snapshot。`codex-gui/src/features/composerTurnControl/ComposerPersistenceStatus.tsx:83-116` 仍依据旧 unknown 列表显示按钮，并传入旧保存 revision。再次点击被新的内部 revision 拒绝。
- 队列影响：若 idle 时已有待发 ordinary B，discard 后未 drain，B 不会发出；`composerInputQueue.ts:1261-1290` 的新 submit C 因已有 ordinary 条目只继续排队。live unknown 场景中 `restoredPaused=false`，界面也没有恢复继续按钮。
- 根因：discard 只提交领域状态，遗漏成功提交后的权威快照发布和受屏障控制的队列推进。
- 验证状态：静态路径确定；现有 `__tests__/composerInputQueuePersistence.test.ts:86-88` 在 discard 后手动调用 `drainPendingInput`，未覆盖 coordinator 行为。本节点未执行测试。
- 整改涉及模块：coordinator 的 discard 事务、快照发布与自动发送屏障。
- 修正方向：成功删除后发布新快照；按当前 sendingBarrier、restoredPaused、recovery 与其余 unknown 决定是否推进。
- 必须保留：不能为续发绕过恢复暂停或其他未知交付阻塞；删除不撤回服务端消息，不重发被删除项。
- 验收条件：订阅者收到更新，未知条目立即消失，剩余未知条目得到新 revision；恢复暂停仍生效；允许发送时既有待发条目按序推进。
- 关联：QR-B09-001；X01/X02 闭合生产调用与恢复语义。

## QR-B09-003：中断持久化使用 steer 的运行时校验契约

- 分类：可维护性问题。优先级：P2；依据是两个独立协议演进面被非机械转换绑定，非当前值域错误。
- 位置：`codex-gui/src/features/composerInputQueue/composerInterruptState.ts:87-91`。
- 证据：代码把 `{threadId, turnId}` 改写为 `{threadId, expectedTurnId, input: []}`，调用 `validateV2TurnSteerParams`，再重建 `TurnInterruptParams`。权威来源分别为 `codex-rs/app-server-protocol/schema/typescript/v2/TurnInterruptParams.ts:5` 与 `TurnSteerParams.ts:6-10`。当前生成 validator 声明中未找到 `TurnInterruptParams` validator。
- 维护成本：steer schema 的约束变化会影响 interrupt 恢复；interrupt 自身 schema 的约束变化未必由借用的 validator 捕获。当前两个目标字段均为 string，不能把未来变化写成已发生的运行错误。
- 根因：为复用已有校验器，引入语义无关的参数转换，运行时校验并非从被校验类型自身机械派生。
- 验证状态：静态确定依赖错位；未生成、修改或运行协议校验。
- 整改涉及模块：协议 validator 生成配置与 interrupt persistence decoder。
- 修正方向：从权威 `TurnInterruptParams` schema 机械生成并直接使用对应校验器。
- 必须保留：跨契约不兼容变化的失败传播；禁止手写镜像 schema、宽化断言或静默 fallback。
- 验收条件：interrupt decoder 使用自身权威类型的生成 validator；合法中断目标可恢复，非法目标被拒绝；steer 独立变化不成为 interrupt 恢复的额外依赖。
- 关联：B12 生成契约评审。

## QR-B09-004：terminal 先于 steer accepted 的收敛风险

- 分类：待验证风险。未设已确认缺陷严重度。
- 位置：`codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts:906-923`、`:1004-1063`。
- 静态观察：terminal 保留 issuing/unknown/mismatch，避免把未确认交付转换为可重发 rejection。若随后 accepted 到达，仅设置 `acceptedAwaitingCommit`，不处理已记录的 `closedTargets`。`composerInputQueue.ts:1442` 仅尝试 `drainSteer`，activeTurnId 已空时不推进下一 start。
- 尚缺证据：生产后端是否允许 accepted 对应消息没有 commit 且 turn 已终止，及其事件顺序。若 commit 会正常到达，则 pending 由 commit 清理，不能把合成序列直接算作真实缺陷。
- 条件性影响：若上述序列合法且没有后续 commit，待确认项会滞留并阻止安全释放，直到 snapshot reconciliation 等后续处理。
- 现有测试：`__tests__/composerSteerQueueState.test.ts` 覆盖 commit-before-settlement、terminal 保留 issuing；没有 terminal-before-accepted-without-commit 组合。未执行定向测试。
- 整改交接：先由 X01 只读追踪生产契约及事件发出顺序；确认可达后才设计状态收敛修正。
- 必须保留：unknown 不凭裸 terminal 自动重发；精确 thread/turn/client ID 归属；有效 commit 能消费旧 claim，晚到 settlement 不重复消费。
- 验收条件：若序列可达，验证两种先后顺序最终具有同等消息所有权和调度结果；若不可达，记录生产保证及一手依据，不新增兼容分支。

## 定向现有测试与缺口

主代理 V-02 于 15:50:43（本地时间）在 codex-gui 执行 `/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/composerInputQueue/__tests__/composerQueueRecordIdentityPersistence.test.ts src/features/composerInputQueue/__tests__/composerInputQueuePersistence.test.ts src/features/composerInputQueue/__tests__/composerCoordinatorPersistence.test.ts`，3 文件合计 32 测试通过、无类型错误、退出 0。验证了现有 merge 身份、普通 unknown 基础与事务/恢复屏障；未运行 interrupt snapshot 测试。

这些现有测试即使通过，也不覆盖 QR-B09-001/002 的新组合。评审期间不新增测试；组合验收作为后续修复交接保留。QR-B09-004 先完成生产契约核实，不用合成序列冒充可达性证据。

## 覆盖记录

下列文件均实际读取。逐文件覆盖身份在 [覆盖与进度](./coverage-and-progress.md) 中维护，不重复保存哈希。没有主范围排除文件。

| 实现文件（相对主范围） | 检查职责 |
| --- | --- |
| `composerCoordinatorPersistence.ts` | 记录导入及跨 owner 校验 |
| `composerInputPreview.ts` | 预览截断、非文本汇总 |
| `composerInputQueue.ts` | 队列调度、所有权与恢复 |
| `composerInputQueueContracts.ts` | 领域状态与交互契约 |
| `composerInputQueueCoordinator.ts` | RPC、持久化事务、发布与生命周期 |
| `composerInputQueueProjection.ts` | 队列视图和 release blockers |
| `composerInputQueueRuntimeObservation.ts` | live 事实转换与 replay 排除 |
| `composerInterruptState.ts` | 停止声明、响应/终态乱序与恢复 |
| `composerLanePersistenceValidation.ts` | 持久化基础值检查 |
| `composerOrdinaryQueueState.ts` | 普通 FIFO、编辑与移动 |
| `composerPendingInputIdentity.ts` | revision、cursor 与展示键归属 |
| `composerPendingInputLiveManagement.ts` | 编辑生命周期与事实重放 |
| `composerPendingInputMove.ts` | 移动位置计算 |
| `composerQueueMessagePersistence.ts` | 输入与草稿导入导出 |
| `composerStartQueueState.ts` | start 声明、事实收敛与恢复 |
| `composerSteerQueueState.ts` | steer 交付、拒绝与 transfer |

测试与 fixture（均位于主范围 `__tests__/`）：

- `composerCoordinatorPersistence.test.ts`
- `composerCoordinatorRecordCodec.test.ts`
- `composerInputPreview.test.ts`
- `composerInputQueueCoordinatorInterruptDelivery.test.ts`
- `composerInputQueueCoordinatorManagementLifecycle.test.ts`
- `composerInputQueueCoordinatorManagementRecovery.test.ts`
- `composerInputQueueCoordinatorManagementReplay.test.ts`
- `composerInputQueueCoordinatorMove.test.ts`
- `composerInputQueueCoordinatorRelease.test.ts`
- `composerInputQueueCoordinatorStartDelivery.test.ts`
- `composerInputQueueCoordinatorSteerDelivery.test.ts`
- `composerInputQueueCoordinatorTestFixtures.ts`
- `composerInputQueueInterruptionRecovery.test.ts`
- `composerInputQueueManagement.test.ts`
- `composerInputQueuePendingProjection.test.ts`
- `composerInputQueuePersistence.test.ts`
- `composerInputQueueRuntimeObservation.test.ts`
- `composerInputQueueStart.test.ts`
- `composerInputQueueStartObservation.test.ts`
- `composerInputQueueSteer.test.ts`
- `composerInputQueueTestFixtures.ts`
- `composerInterruptSnapshotPersistence.test.ts`
- `composerInterruptState.test.ts`
- `composerLanePersistence.test.ts`
- `composerPendingInputMovement.test.ts`
- `composerPendingInputScheduling.test.ts`
- `composerQueueRecordIdentityPersistence.test.ts`
- `composerSteerQueueState.test.ts`

关联读取不计入 B09 主覆盖：`browserPersistence/browserPersistenceStore.ts` 全文、`composerTurnControl/ComposerPersistenceStatus.tsx` 全文、`activeThreadSession/liveActiveThreadSession.ts` 直接转发与事务相关段落、权威 `TurnInterruptParams.ts` 和 `TurnSteerParams.ts`。其余主范围和跨模块链路由对应批次与 X 节点负责。

## X01 / X02 最终收敛

QR-B09-002 的旧 revision 也会使 `composerInputQueueCoordinator.ts:404-411` 的 resumeRestored 拒绝 Continue sending，直到其他操作发布新快照；同根因不新增编号。

QR-B09-004 保持待验证：Core `session/turn_input.rs:638-647,485-486` 的 accepted 只保证进入 pending；`tasks/mod.rs:631-650,902-1000,583-586` 的停止/abort 与 `session/turn.rs:637-665` 清理可能不产生 userMessage commit，但尚未闭合生产 terminal 与响应转发的完整调度。前端 `composerSteerQueueState.ts:289-334,485-515`、`composerInputQueue.ts:461-478` 可通过恢复 snapshot 按 client ID 与 terminal 收敛，恢复触发受 coordinator `:387-390` 限制，不能称为在线即时自愈。真实时序未复现，未据此升级确定缺陷。
