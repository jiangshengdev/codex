# Thread switch 可能返回已失效的 active owner

日期: 2026-08-24
状态: 🔴 未修复
范围: `codex-gui` thread switch / history continue
优先级: P1

## 摘要

线程切换提交期间发生重入销毁时，`continueThread()` 仍可能返回 `switched`，但结果中的 active owner 已经失效，history continue 页面会把该结果当作成功并导航。

## 问题

`ThreadSwitchCoordinator` 允许 `dispose()` 在提交进行中将销毁延后，但成功路径最终仍返回 `switched`。因此，`switched` 当前不能保证其携带的 active owner 在调用方消费结果时仍然有效。

`ThreadHistoryDetailPage` 将 `current` 与 `switched` 都解释为可导航的成功结果，没有再次检查 owner 的生命周期状态。两处契约组合后，页面可能导航到一个已经失效、无法继续服务后续操作的 task。

## 证据

- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts:190-223`：提交并协调新 owner 后，流程执行 replay、旧 owner 清理与 detach，最终无条件返回 `{ type: "switched", activeOwner: preparedOwner.activeOwner, ... }`。
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts:387-399`：`dispose()` 在 `commitInProgress` 时只设置 `disposeRequested` 并返回，说明提交过程允许发生重入销毁并延后处理。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:304-314`：调用方对 `current` 和 `switched` 统一执行 `navigateToCurrentTask(outcome.activeOwner.threadId)`，未区分结果中的 owner 是否已失效。
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts:517-543`：现有测试覆盖 dispatch/publish 阶段的重入销毁，并明确断言结果仍为 `switched`，同时断言返回 owner 的 queue readiness 已因 `disposed` 被阻塞、读取 pending input 返回 `ownerGone`。这说明测试当前固定了“成功结果携带已失效 owner”的异常状态，而不是证明该状态正确。

## 判断

该问题仍未修复。现有测试为代码中的异常契约提供了静态证据，但本轮仅整理 issue，未运行该测试或其他验证命令；因此这里不声称当前测试执行通过。

## 影响

- history continue 可能导航到已经失效的 task owner，成功导航与实际可用状态不一致。
- 上层无法仅凭 `switched` 判断切换是否产生了可继续使用的 active owner，扩大了线程切换、恢复和后续操作的竞态风险。
- 测试把异常状态写成预期结果，会降低后续改动暴露该生命周期缺陷的能力。

## 后续处理

需要作为独立修复入口，先明确 thread switch 成功结果与 owner 生命周期之间的契约，再进入相应设计或修复流程；不要并入其他 GUI 大型重构问题。
