# GUI 新建未持久化任务加载：仅前端设计

状态：待用户确认；主目标已确认，设计文件创建已授权。

## 目标与边界

仅通过前端修改，让新建且未发送消息、尚未持久化的任务正常打开 GUI，同时保持已持久化任务的正常加载，并分别用测试覆盖。

- 不修改 Rust、后端协议定义、存储或持久化时机。
- 不纳入 `session_meta-only`，不处理存储损坏，也不重构通用工作流。
- 本文是新设计，不继承已回退设计和计划的实现授权。本轮只写本文，不写计划、不实现、不提交。

## 根因与现有能力

当前 `activeThreadSession.ts:421-429` 首次初始化无条件执行 `thread/resume`，随后才执行 `thread/projection/attach`。这要求一个本已在内存中的新任务先通过存储恢复入口；没有 rollout 时，恢复失败，GUI 无法继续连接。

“是否已加载”与“是否已持久化”是两个独立事实。前端应按前者决定是否需要 resume，不能根据 URL、历史列表、消息数量或浏览器保存的成员记录推断它。

现有能力已足够：

- `thread/loaded/list` 从当前后端的内存任务集合返回 ID，支持 `nextCursor` 分页；GUI host 已允许该方法。
- `thread/projection/attach` 可以连接没有 rollout 的已加载任务。后端已有 `thread_projection_attach_returns_empty_paginated_live_thread` 测试，断言 attach 前后均无 rollout、历史为空。
- 前端 `appServerProtocol.ts` 尚未选择 `thread/loaded/list`，`GuiHostCommands` 尚未暴露对应方法。
- 当前 recovery locator 测试只断言 resume 一次再 attach；共享 mock 默认让 resume 成功，没有表达“无 rollout 时 resume 必须失败”的前提。

以上为本轮源码及既有测试定义核验，不代表本轮执行过测试或真实 GUI 验收。

## 加载设计

在现有会话初始化 owner 内增加加载状态查询，沿用原有投影构建、事件接收、身份校验和发布流程。

1. 请求 `thread/loaded/list`，查找目标 thread ID。
2. 找到目标即直接 attach。未找到且存在 `nextCursor` 时继续请求下一页；只有全部页成功读取且仍未找到，才调用 resume。
3. resume 成功并通过任务身份校验后，调用 attach。
4. attach 成功后，继续原有初始化流程，完成后才发布可用会话。

加载状态仅用于本次初始化，不写入浏览器持久状态，也不建立另一个任务状态来源。已就绪会话沿用既有复用行为，不因切换视图再次初始化。

| 测试前提 | 预期路径 | 用户结果 |
| --- | --- | --- |
| 未持久化、已加载 | loaded/list → attach | 打开空会话，可以发送首条消息 |
| 已持久化、已加载 | loaded/list → attach | 保留历史和当前运行状态 |
| 已持久化、未加载 | loaded/list 完整查询 → resume → attach | 恢复历史并进入可用会话 |

未加载且无可恢复存档的 ID 不属于可恢复的新会话；保留后端真实错误，不创建替代任务。

## 失败、重试与生命周期

- 加载列表查询失败或响应校验失败时，呈现初始化失败，保留原始错误，不将查询失败解释为“未加载”。失败阶段须能准确区分查询、resume 和 attach。
- attach 失败时沿用现有错误及清理流程，不自动 fallback 到 resume，不把任意错误转换成空历史。
- 查询与 attach 不是原子操作。如果期间任务卸载，报告实际失败；用户通过既有重试或再次继续入口触发初始化时，重新查询加载列表。
- 查询分页和新增异步边界同样遵守现有连接失效检查，失效后不继续发起恢复或连接，不发布过期结果。
- 保持现有初始化去重、订阅清理、前后台会话隔离、队列保护和失败清理后重试语义。

## 前端影响范围

- `features/guiHost/appServerProtocol.ts`：选择后端已有的 `thread/loaded/list`。
- `features/guiHost/guiHostCommandGateway.ts`：通过现有协议请求机制暴露加载列表命令，使用既有协议类型和响应校验。
- `features/activeThreadSession`：初始化分流及对应失败阶段表达；不新增平行会话管理器。
- 前端相关 unit、Browser 测试和共享 mock：明确加载与持久化前提，保留原有行为断言。
- 前端协议生成物通过已有 `protocol:generate-validators` 入口更新。其输入只读使用已有后端 schema；输出位于 `src/generated/appServerProtocol` 和 `src/generated/guiHostContract`，审查完整生成差异，不手改生成物。

不修改 `codex-rs/**`。如后续发现现有后端能力不足，应先报告具体证据和受影响项，不自行补 Rust 或扩大范围。

## 回归与验收要求

三个正常状态分别建立独立用例。未持久化 fixture 必须使 resume 返回 `no rollout found`，同时允许已加载任务 attach；测试不能只检查“不调用 resume”，还须检查会话确实进入可用状态。持久化与加载前提独立建模，不使用“所有 ID 均可恢复”的默认成功行为代替场景条件。

补充覆盖：目标出现在后续页、所有页均未找到、查询失败、resume 失败、attach 失败不触发恢复兜底、重试时加载状态改变、查询期间连接失效。保持现有身份不匹配、清理失败和前后台隔离测试的检查能力。

Browser 回归分别验证新任务空态与首发、已加载持久化任务的历史/运行状态、未加载持久化任务的恢复；继续检查已有队列和恢复暂停行为。不通过统一修改调用次数来代替这些产品结果断言。

实施验证应保留新任务回归在修改前失败、修改后通过的证据，并完成相关前端测试、类型、lint 和生成一致性检查；具体执行范围留待计划阶段核验。

真实 GUI 验收必须使用当次有效 URL，并记录真实前提。新任务在 GUI 首次打开前须确认尚未发送消息且无 rollout；不得调用会触发 persist 的 `thread/read(includeTurns=true)` 来准备或探测该前提。另行验证已持久化任务。只提供一个已落盘任务 URL 不能作为新任务验收证据。

真实验收默认无头；需要启动或操作运行时的具体动作在计划阶段明确。当前文档不授权有状态诊断，也不复用旧 URL 或旧 token。

## 证据入口与待确认事项

- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts:421`：当前初始化链；`:281`：现有重试入口。
- `codex-gui/src/features/activeThreadSession/__tests__/activeThreadSession.test.ts:562`：当前 recovery locator 测试。
- `codex-gui/src/__tests__/appBrowserTestSupport.ts:84`：共享命令 mock。
- `codex-gui/scripts/protocolValidators/cli.ts:347`：生成输入与输出边界。
- `codex-rs/app-server/src/request_processors/thread_processor.rs:2744`：内存加载列表及分页。
- `codex-rs/gui-host/src/filter.rs:12`：现有方法许可。
- `codex-rs/app-server/tests/suite/v2/thread_projection.rs:292`：无 rollout 的空任务 attach 既有测试。

已确认目标与约束可以确定本设计，无需另造产品选择题。待用户确认本文后再进入计划阶段；当前没有修复完成或验收通过的结论。
