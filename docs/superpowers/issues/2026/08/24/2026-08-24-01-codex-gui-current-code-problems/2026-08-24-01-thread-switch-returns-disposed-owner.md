# Thread switch 可能返回已失效的 active owner

日期: 2026-08-24
状态: ✅ 已修复
范围: `codex-gui` thread switch / history continue
优先级: P1

## 摘要

线程切换终态契约现已阻止重入销毁返回成功结果；history continue 页面只在收到 `ready` 时导航，不再消费可能失效的 active owner。

## 问题

修复前，`ThreadSwitchCoordinator` 允许 `dispose()` 在提交进行中将销毁延后，但成功路径最终仍返回 `switched`。因此，`switched` 不能保证其携带的 active owner 在调用方消费结果时仍然有效。

修复前，`ThreadHistoryDetailPage` 将 `current` 与 `switched` 都解释为可导航的成功结果，没有再次检查 owner 的生命周期状态。两处契约组合后，页面可能导航到一个已经失效、无法继续服务后续操作的 task。

## 证据

- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts:573-630`：统一终态分类先检查 attempt 是否仍 live；仅当提交、发布、内部 owner、已发布 owner 与 store identity 全部一致时才返回 `ready`，重入销毁则返回 `unavailable` / `connectionLost`。
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts:849-888`：dispatch 与 publish 阶段的重入销毁均断言返回 `unavailable`，进度为 `afterCommit`，且 coordinator 不再保留 active owner。
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts:713-737`：提交完成后、旧 projection detach 尚未结束时发生销毁，同样返回 `connectionLost` / `afterCommit`。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:356-374`：history continue 页面只对 `ready` 导航；`unavailable` 留在当前页面并显示失败状态。

## 判断

该问题已修复。线程切换结果不再暴露 active owner，也不会在重入销毁后返回 `ready`；history continue 调用方只消费经过终态校验的 thread id。

## 修复记录

- `ae7c2e2606def038bbe94b5ba84a971960f0d306`（`fix(gui): make thread switch outcomes terminal`）：将 `current` / `switched` 收敛为 `ready` / `unavailable` 终态，并把重入销毁分类为连接中断。
- `c92cfa65191c71a15913a5707701fa1f7877cdeb`（`fix(gui): handle thread switch terminal outcomes`）：history continue 页面仅对 `ready` 导航，并展示 `unavailable` 终态。

## 验证记录

- 2026-08-24：运行 `/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`，结果为 1 个测试文件、37 个测试全部通过，Type Errors 为 0。

## 影响

- 原有的失效 owner 导航风险已消除。
- 提交后若连接或 owner 生命周期失效，页面会保留在 history detail 并显示不可用状态，不再伪装为成功导航。
- 回归测试现已把重入销毁固定为失败终态，可阻止旧异常契约回归。

## 后续处理

无需继续修复。后续若调整 thread switch 终态契约，应保留重入销毁与 history continue 不导航的回归覆盖。
