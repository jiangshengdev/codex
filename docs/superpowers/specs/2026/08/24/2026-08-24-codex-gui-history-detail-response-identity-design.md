# Codex GUI History Detail 响应线程身份设计

设计状态：已确认

确认日期：2026-08-24

确认原文：`确认设计，计划落盘`

设计日期：2026-08-24

设计分支：`dev`

设计时 HEAD：`4a28da9efebafb34b7a9b9ee577397dc37d5d705`

## 唯一主目标

为 Codex GUI history detail 的 `thread/read` 响应建立请求线程与响应线程的身份一致性边界，
阻止错误身份的线程进入 ready 状态，避免页面展示线程 A、后续却继续线程 B。

本设计只修复 history detail 响应接收边界，不修改 app-server 协议、生成 validator、GUI Host
gateway、thread switch 流程或历史详情页面结构。

## 关联问题

- Issue：`docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-02-history-detail-response-identity.md`
- 历史任务设计：`docs/superpowers/specs/2026/08/16/2026-08-16-codex-gui-thread-history-list-design.md`

## 当前问题与根因

`ThreadHistoryDetailOwner.requestThread()` 使用路由 `threadId` 调用
`thread/read({ threadId, includeTurns: true })`。响应返回后，owner 只用 generation 与 disposed
状态排除过期结果，随后直接用 `response.thread` 构建 transcript 并发布 ready：

- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts:74-98`

generation 只能证明响应属于当前请求代次，不能证明响应内的 `thread.id` 就是请求 ID。

页面标题、文档标题和 transcript 都使用 ready 状态内的响应线程，但继续操作仍使用路由
`threadId`：

- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:147-159`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:193-207`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:281-288`

因此，结构合法但身份错误的响应会形成两个不同的操作对象：用户看到响应线程，继续操作却指向
路由线程。

## 权威契约边界

app-server v2 是 `thread/read` 的权威协议来源。协议分别定义请求 `threadId: string` 与响应
`thread.id: string`，但类型和单响应 schema 无法表达“两者必须相等”的请求—响应关系：

- `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1644-1659`
- `codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs:193-198`
- `codex-gui/src/generated/appServerProtocol/requestDescriptors.ts:46-50`

生成 validator 只拥有响应 result，没有请求 params；JSON-RPC `id` 只关联 pending request，
两者都不能维护线程身份不变量。`ThreadHistoryDetailOwner` 同时持有请求 `threadId` 与解码后的响应，
因此它是最窄且完整的校验 owner。

这项关系校验是 consumer 持有的请求上下文不变量，不是新的协议结构定义。不得为此手写协议 DTO、
修改生成 validator，或把权威类型擦除成宽泛类型后重新校验。

## 已确定的产品语义

本次设计访谈没有需要用户选择的实质决策。现有加载状态与相邻身份校验惯例已经确定以下语义：

1. 身份错误必须在响应进入 ready 状态之前暴露，不能信任错误响应，也不能改用响应 ID 继续任务。
2. 身份错误属于 history detail 加载失败，复用现有可重试 `error` 状态。
3. 页面保留“返回历史记录”、加载失败 Alert 和 Retry；不得展示错误线程的标题、消息、空记录提示
   或“继续此任务”。
4. Retry 继续请求 owner 固定持有的原路由 `threadId`。若再次不匹配，仍保持错误状态；若匹配，
   正常进入 ready。
5. 错误消息沿用相邻路径的约定：`thread/read returned a different thread identity`。

把该错误设计成新的不可重试终态没有事实依据，还会扩大页面状态和文案范围；自动改用响应 ID、
静默重试或自动重定向都会隐藏身份错误，不属于修复。

## 接收边界设计

`ThreadHistoryDetailOwner.requestThread()` 的成功回调按以下顺序处理响应：

1. 使用现有 `canSettle(generation)` 确认 owner 未销毁且响应仍属于当前代次。
2. 严格比较 `response.thread.id` 与 `this.threadId`。
3. 不一致时抛出普通 `Error("thread/read returned a different thread identity")`。
4. 一致时才调用 `buildTranscriptStateFromTurns(response.thread.turns)`。
5. transcript 构建成功后才发布 `ready`。

身份检查必须位于现有 `try/catch` 内。这样，不匹配与 transcript 构建错误都通过既有路径发布
`{ type: "error", error }`；不能把检查放到 `try/catch` 外而让 Promise rejection 遗失、页面停在
loading。

不新增状态 variant、共享错误类、cleanup 阶段或全局状态。`thread/read` 是纯读取，没有需要释放的
subscription 或 candidate owner。

## 页面行为

本设计不修改 `ThreadHistoryDetailPage.tsx`。现有互斥渲染已经提供所需语义：

- `error` 显示 `Unable to load task history`、底层错误文本和 Retry；
- 只有 `ready` 才发布响应线程的文档标题、渲染 transcript 和挂载 `ContinueTaskAction`；
- Retry 调用同一个 detail owner，owner 再次读取原路由线程。

因此，只要身份错误不能进入 ready，页面就不会再形成“展示 A、继续 B”。

## 验证设计

### Owner 单元测试

在 `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts` 覆盖：

1. 请求 ID 与响应 ID 一致时保持现有 ready 行为。
2. 响应结构合法但 ID 不一致时发布完整 error，绝不发布错误线程或为它构建 ready transcript。
3. mismatch 后 Retry 仍以原请求 `threadId` 调用 `thread/read`，匹配响应可恢复到 ready。

断言沿用现有完整状态 `toStrictEqual` 与精确请求参数断言，不新增手写协议 fixture。

### Browser Mode 测试

在 `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx` 覆盖：

1. mismatch 后显示现有加载失败 Alert 与精确错误信息。
2. 错误响应的标题和消息不可见，“继续此任务”不存在。
3. 点击 Retry 后返回匹配响应，页面恢复正确详情。

异步 DOM 断言使用本地 Vitest Browser Mode 文档推荐的 `expect.element` locator 断言。无需新增
App 级集成测试、E2E、截图或样式断言；owner 测试与局部 Browser Mode 测试已经分别覆盖根因边界
和用户可见后果。

## 预计实现范围

只涉及以下三个文件：

- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts`
- `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx`

明确排除：

- app-server Rust 协议与实现；
- 生成 TypeScript、schema 和 runtime validator；
- GUI Host transport、command gateway 与 allowlist；
- `ThreadHistoryDetailPage.tsx` 页面结构、HeroUI 组件和 Lingui catalog；
- thread resume、projection attach、thread switch 与 live owner 生命周期；
- 兼容层、fallback、自动重试和错误响应修正。

## 完成标准

1. 只有 `response.thread.id === requested threadId` 的响应可以进入 ready。
2. mismatch 响应不会影响标题、transcript 或继续操作。
3. mismatch 通过现有错误界面暴露，Retry 始终读取原路由线程。
4. generation/dispose 的既有过期响应防护保持不变。
5. 权威生成协议及其 failure propagation 保持不变，没有 consumer-owned contract 镜像。

## 反向审计结论

独立反向审计未发现需要扩大设计范围的遗漏。问题只存在于 history detail owner 的请求—响应
关系边界；现有错误状态、页面渲染与 retry 生命周期足以承载修复。
