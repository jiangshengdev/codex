# History detail 未核对响应线程身份

日期: 2026-08-24
状态: 🔴 未修复
范围: `codex-gui` thread history detail
优先级: P1

## 摘要

History detail 接受 `thread/read` 返回的任意线程并用于展示，但继续操作仍使用路由中的 `threadId`，因此响应身份不一致时可能出现“展示线程 A、继续线程 B”。

## 问题

History detail owner 发起 `thread/read` 后，只检查请求 generation 和 owner 是否仍有效，随后直接把 `response.thread` 发布为 ready 状态。它没有确认 `response.thread.id` 与请求的 `this.threadId` 一致。

页面的标题、文档标题和 transcript 均取自 ready 状态中的响应线程；但“继续任务”操作收到并使用的是路由 `threadId`。如果服务端、transport 或 fixture 返回了错误身份的线程，页面展示对象和后续继续对象会分裂。

## 证据

- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts:74-98`：`requestThread()` 调用 `readThread({ threadId: this.threadId, includeTurns: true })`，响应落地时直接发布 `response.thread`，未比较 `response.thread.id` 与 `this.threadId`。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:153-159`：文档标题事实使用 `state.thread.id` 以及响应线程的名称和预览。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:193-207`：transcript 使用 `state.thread` 派生的数据，但 `ContinueTaskAction` 接收的是独立的路由 `threadId`。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:281-313`：继续操作调用 `continueThread(threadId)`，确认实际继续目标来自路由参数而不是已展示的 `state.thread.id`。
- `codex-gui/src/features/appShell/routeConnectionStartupCoordinator.ts:152-157`：相邻启动路径在 attach 后明确检查 `attachResponse.snapshot.thread.id !== threadId` 并报错，说明线程身份一致性在现有代码中已被视为必要约束。
- 本轮未运行测试；结论来自当前源码静态核对。

## 判断

问题当前仍成立。现有 generation/dispose 防护只能阻止过期异步结果落地，不能证明返回线程就是请求线程；history detail 路径缺少与 route connection startup 路径同类的身份不变量检查。

## 影响

一旦 `thread/read` 返回错误线程身份，用户看到的标题和消息记录与“继续任务”实际打开的线程可能不一致。这既会误导用户，也会使后续行为难以从当前页面内容解释；身份错误还会被 ready 状态正常渲染，而不是在边界处暴露。

## 后续处理

需要单独发起修复任务，在 history detail 的响应接收边界维护请求与响应线程身份一致性，并单独验证身份匹配和身份不匹配时的行为。本 issue 不包含修复设计、实施计划或代码改动。
