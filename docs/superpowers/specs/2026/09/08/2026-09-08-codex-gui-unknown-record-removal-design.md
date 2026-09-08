# Codex GUI 未知交付记录移除设计

日期：2026-09-08。

状态：设计已确认；本文按确认结果落盘。尚未编写或执行实施计划，未修改产品代码，未运行本设计的验收。

源码核对基线：`b1d8bda92f00f86008c3b42af32c8e2f1738c2a1`。

关联评审：[B09 输入队列评审](../../../../reports/2026/09/08/2026-09-08-codex-gui-quality-review/batch-09-input-queue.md)，覆盖 QR-B09-001、QR-B09-002。评审是问题依据，不构成实施授权。

## 目标与已确认范围

让用户能够成功移除交付结果未知的本地记录：合并记录及其原消息归属被完整释放，删除结果可靠保存，界面及时更新；现有发送条件允许时，其余消息按既有顺序继续。

最初目标为 QR-B09-001。范围决策已明确选择同时解决 QR-B09-001/002，闭合一次移除操作的数据、界面和队列推进行为。最终设计已确认。

本设计不改变现有合并方式和排队顺序，不重发被移除的消息，不放宽精确身份检查。移除仅处理本地记录，不取消或撤回服务端消息，也不把未知交付认定为未发送。

## 当前问题与证据

### QR-B09-001：只删除合并容器，遗留原消息归属

`composerInputQueue.ts` 的 `drainNextStart` 将 rejected steer 合成 `rejectedSteerMerge`，容器通过 `transfer` 持有原消息。正常结束由 `releaseStartClaim` 同时释放容器及 transfer 中的原消息。

目前 `composerStartQueueState.ts` 的 `discardUnknown` 只清空 pending 状态并返回 boolean，外层 `composerInputQueue.ts` 因而只删除传入 ID，无法取得被丢弃 claim 的完整归属。导出后原消息 ID 仍在登记集合中，但已没有对应的序列化 owner。

生产保存链为 coordinator 的 `discardUnknown` → `persistTransaction` → 持久化 store 的 `commit` → `decodeComposerCoordinatorRecord` → queue 重新导入。写入前的严格校验发现孤儿 ID，拒绝保存并回滚。现有记录保留，但保存错误继续阻塞发送。

### QR-B09-002：保存成功后未发布状态，也未推进队列

`composerInputQueueCoordinator.ts` 的 `discardUnknown` 目前只运行移除事务。成功事务仅执行操作显式登记的 effects，不自动发布快照或调用 drain。

`ComposerPersistenceStatus.tsx` 从 coordinator 快照读取未知条目及 persistence revision。因此删除成功后界面仍可能使用旧列表、旧 revision；再次移除或恢复继续可能被版本检查拒绝。已有待发消息也不会仅因删除成功而继续。

`liveActiveThreadSession.ts` 的转发和外层事务不重建 coordinator 内部缓存快照，不能弥补该缺口。

以上根因已通过当前源码链路核对；没有将静态核对或报告中的既有测试通过视为本设计已验收。

## 设计

### 完整释放由现有 owner 负责

start state 在确认目标 ID 属于当前未知记录后，移除 pending 状态并把实际释放的 claim 交给 queue。无匹配项时明确返回未移除，不触发归属清理或续发。

queue 使用现有完整释放路径处理该 claim：普通 start 释放自身 ID；`rejectedSteerMerge` 同时释放容器、rejected transfer 及全部原消息 ID。必要的本地展示身份清理与 revision 更新随移除一同完成。

普通 steer 继续由 steer owner 处理自身未知记录的释放。避免在 coordinator 或持久化解码器中重新推导消息归属，也不通过扫描并删除“多余 ID”修补结果。

内部返回类型及方法组织属于实现机制，在实施计划中落实；不新增持久化格式、迁移或兼容路径。

### 移除与允许的队列推进纳入同一持久化事务

coordinator 保留 disposed、expected revision 和已有保存失败检查。通过检查后，在候选状态中完成移除，并使用现有 queue drain 与 transition 消费路径准备允许的下一步。

删除结果、下一项发送所需的队列状态和发送 claim 一起接受原有编码、重新导入校验及保存。只有事务成功提交后，才执行登记的外部发送 effects 和快照通知。不得先发送再补保存，也不得先对界面宣告删除成功。

候选准备或校验失败时沿用原有失败传播；保存失败时回滚候选状态，保留原记录并发布保存错误，不执行候选发送 effects。

### 发布权威快照，复用既有发送约束

成功移除必须发布 coordinator 的最新权威快照，即使 drain 没有产生发送 effect。快照同时更新未知列表和 persistence revision，使剩余条目及 Continue sending 使用当前版本。

队列推进复用既有调度与屏障：`sendingBarrier`、`restoredPaused`、recovery、其余未知交付，以及 pending/active turn 等状态继续按原规则生效。移除本身不解除恢复暂停，也不绕过其他未知记录对发送的阻塞。

允许推进时，rejected steer 合并项与普通项保持当前优先级和 FIFO 规则。不增加直接调用 RPC 的第二条发送路径。

## 用户可见结果

| 情况 | 预期结果 |
| --- | --- |
| 移除未知合并记录并保存成功 | 合并记录和原消息归属完整释放，界面条目消失 |
| 移除普通未知 start 或 steer | 使用同一提交后更新流程，界面和 revision 同步更新 |
| 仍有其他未知记录 | 其他记录保留并取得最新 revision，可继续操作；发送仍遵守现有阻塞条件 |
| 删除后允许继续且已有待发项 | 按既有顺序推进，不重复发送被删除项 |
| 恢复暂停、recovery 或其他发送屏障仍存在 | 删除可以按现有入口条件完成，但不借此解除暂停或强行续发 |
| 保存失败 | 原记录和归属保留，显示保存错误，不执行新的发送 |
| 旧 revision、无匹配目标或已 disposed | 沿用现有拒绝语义，不因失败的移除推进队列 |

## 验收条件

1. 实时交付未知的 merge，以及 issuing 时刷新后恢复为 unknown 的 merge，均可移除、保存并重新导入；容器和原消息 ID 无残留，其他记录完整保留。
2. 普通未知 start、steer 和合并记录均覆盖 coordinator 入口；成功后订阅者得到最新未知列表和 revision，而非仅直接测试 queue。
3. 连续移除多个未知条目可使用最新 revision；恢复暂停场景中的 Continue sending 不再被移除前的旧快照版本阻碍。
4. 无发送阻塞时，已有待发项按既有顺序推进，发送所需状态先保存；被移除项不重发。
5. 恢复暂停、recovery、sendingBarrier 和其他未知记录仍按各自原有规则阻塞发送；移除不改变这些约束。
6. 保存失败时，删除和候选队列推进一起回滚，原记录仍可恢复，外部发送未执行；原有严格孤儿 ID 检查继续拒绝不合法数据。
7. 界面消费最新快照后条目消失，剩余条目的移除操作和恢复继续操作使用最新版本。自动化证据与真实运行验收分别记录，不相互替代。

具体测试文件、命令、执行顺序及提交边界在后续实施计划中确定；本设计不声明这些验收已执行。

## 范围外

- QR-B09-003 的中断校验契约及 QR-B09-004 的服务端事件时序风险。
- TUI 行为修改、GUI/TUI 合并表示统一、后端协议或幂等能力扩展。
- 服务端消息撤回、未知消息自动重发、持久化 schema 迁移。
- 新增 UI 交互、样式改版或放宽现有检查。

## 关键源码入口

以下路径相对仓库根目录：

- `codex-gui/src/features/composerInputQueue/composerStartQueueState.ts`：未知 start 释放及 pending claim。
- `codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`：未知 steer、rejected transfer 及原消息归属。
- `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`：discard、完整 claim 释放、合并与 drain。
- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`：事务、提交后 effects、快照、revision 与发送屏障。
- `codex-gui/src/features/composerInputQueue/composerCoordinatorPersistence.ts`：持久化记录重新导入校验。
- `codex-gui/src/features/browserPersistence/browserPersistenceStore.ts`：写入前 JSON 表示解码及保存错误。
- `codex-gui/src/features/composerTurnControl/ComposerPersistenceStatus.tsx`：未知条目与恢复继续的界面入口。
- `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts`：生产转发边界。
