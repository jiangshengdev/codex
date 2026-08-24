# History detail 未核对响应线程身份

日期: 2026-08-24
状态: ✅ 已修复
范围: `codex-gui` thread history detail
优先级: P1

## 摘要

History detail 现已在 `thread/read` 响应接收边界核对请求与响应线程身份；身份不一致时进入现有可重试错误状态，不再出现“展示线程 A、继续线程 B”。

## 问题

修复前，History detail owner 发起 `thread/read` 后，只检查请求 generation 和 owner 是否仍有效，随后直接把 `response.thread` 发布为 ready 状态，没有确认 `response.thread.id` 与请求的 `this.threadId` 一致。

页面的标题、文档标题和 transcript 均取自 ready 状态中的响应线程；但“继续任务”操作收到并使用的是路由 `threadId`。因此在原实现中，如果服务端、transport 或 fixture 返回了错误身份的线程，页面展示对象和后续继续对象会分裂。

## 证据

- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts:74-95`：`requestThread()` 在 generation 防护之后、构建 transcript 之前检查 `response.thread.id !== this.threadId`；不匹配时抛出 `thread/read returned a different thread identity`，并由现有 `catch` 发布 error 状态。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:153-159`：文档标题事实使用 `state.thread.id` 以及响应线程的名称和预览。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:193-207`：transcript 使用 `state.thread` 派生的数据，但 `ContinueTaskAction` 接收的是独立的路由 `threadId`。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:281-313`：继续操作调用 `continueThread(threadId)`，确认实际继续目标来自路由参数而不是已展示的 `state.thread.id`。
- `codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts:152-157`：相邻启动路径在 attach 后明确检查 `attachResponse.snapshot.thread.id !== threadId` 并报错，说明线程身份一致性在现有代码中已被视为必要约束。
- `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts:52-84`：覆盖错误身份进入 error、Retry 继续请求原 `threadId`，以及匹配响应恢复 ready。
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx:223-276`：覆盖错误信息可见、错误线程内容和 Continue 不可见，以及 Retry 后恢复正确详情。

## 判断

问题已修复。History detail owner 现在同时维护 generation 有效性和请求—响应线程身份一致性；只有身份匹配的响应才能构建 transcript 并发布 ready。

## 修复记录

- `c5e64a04818787e4a95cc0c801ccc461132a2798`（`fix(gui): reject mismatched history thread reads`）：增加响应线程身份门禁及 owner、Browser Mode 回归测试。
- `ee6a18a8acb77ceeb09c986e82bc0c8c7e1c6ad2`：将修复分支本地合并到 `dev`。

## 验证记录

- GUI CI 通过：protocol validator、oxfmt、oxlint、ESLint、TypeScript type-check，以及 54 个 unit test 文件中的 801 个测试。
- Chromium、Firefox、WebKit Browser Mode 通过：54 个测试文件、744 个测试；目标 history detail 用例在三种浏览器中均执行并通过。
- 验证使用 GUI frontend 固化入口；本修复未修改 `scripts/format.py` 管理范围，因此未运行仓库级 `just fmt`。

## 影响

原风险是错误线程响应会造成展示对象与继续对象分裂。当前实现会在响应接收边界暴露身份错误，并保留 Retry 能力，因此错误响应不会进入 ready、渲染 transcript 或暴露 Continue。

## 后续处理

无需继续修复。若未来修改 history detail 的读取或恢复路径，应保留请求—响应线程身份检查及现有 owner、Browser Mode 回归覆盖。
