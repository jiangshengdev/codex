# Projection Readability Refactor Design

## 目标

对比当前 `port/lazy-proj-129` 分支和 `rust-v0.130.0`，只针对当前分支引入或修改的手写代码做可读性重构。目标不是改变 GUI projection 的行为，而是让当前分支的改动更容易阅读、解释和维护，同时保持后续继续合并上游版本时的低冲突面。

## 背景

当前分支相对 `rust-v0.130.0` 增加了 GUI thread projection 能力，包括：

- `thread/projection/attach`
- `thread/projection/detach`
- `thread/projection/event`
- projection snapshot
- projection commit chain
- projection subscriber 对线程卸载生命周期的影响

功能主体已经放在新增文件中，但部分函数承担了太多职责。例如 `thread_projection_attach` 同时处理参数解析、线程存在性校验、卸载状态检查、连接存活检查、listener 启动、snapshot future 构造、listener command 投递和完成等待。这样的代码即使补注释，用户仍然难以顺着函数自然理解当前分支做了什么。

## 最高约束

1. 不重构 `rust-v0.130.0` 原始无关代码。
2. 只修改当前分支相对 `rust-v0.130.0` 已经新增或改动的手写代码。
3. 自动生成文件不手工修改，包括 `codex-rs/app-server-protocol/schema/**`。
4. 不为了极小侵入引入过度抽象、复杂搬迁、trait、泛型参数对象或多层 indirection。
5. 上游既有文件里的当前分支改动只允许围绕 projection 挂接点局部整理。
6. 行为必须保持不变：RPC 名称、wire schema、snapshot 语义、detach status、commit chain、线程卸载行为都不应改变。

## 设计原则

### 新增文件承担主要逻辑

projection 的主体逻辑继续留在当前分支新增文件中：

- `codex-rs/app-server/src/request_processors/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection_runtime.rs`
- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`

如果既有上游文件中出现复杂 projection 逻辑，优先把复杂度移回这些 projection 文件。既有上游文件应尽量只保留薄挂接点，例如 module 声明、match arm、转发调用、projection event 的忽略分支。

### 中等粒度局部重构

本次不追求“零侵入”。如果为了减少一两行上游 diff 需要引入复杂回调、trait 或多文件跳转，就不做。重构应当保持读者能在 projection 模块附近理解流程。

可以提取 helper 的条件：

- helper 名称能直接表达业务意图。
- 原函数因此少掉一个明确职责。
- helper 位于同一 projection 模块或紧邻模块中。
- helper 不需要复杂参数对象。

不应提取 helper 的情况：

- 只是把三行普通代码换成一个新函数。
- helper 只会让读者多跳文件。
- 需要改动上游原始控制流。
- 只是为了让上游文件少一行 diff。

### 少注释，先让代码表达意图

本次目标不是大量添加解释性注释。注释只用于解释难以从代码结构中直接看出的设计原因，例如 listener 顺序化、连接关闭竞态、projection subscriber 对卸载的影响。主要可读性应来自更清晰的函数边界和命名。

## 重构范围

### 优先重构

#### `thread_projection_attach`

文件：`codex-rs/app-server/src/request_processors/thread_projection.rs`

当前函数职责过多。重构后主流程应表达为：

1. 解析 attach 目标线程。
2. 拒绝正在卸载的线程。
3. 获取当前 live connection 对应的 thread state。
4. 确保 listener task 运行。
5. 构造 projection snapshot future。
6. 把 attach 响应投递给 listener 顺序化处理。
7. 返回 `Ok(None)`，避免重复发送响应。

预期拆分为同文件内的小 helper，避免改动上游 `thread_processor.rs` 主体。

#### `read_thread_projection_snapshot`

文件：`codex-rs/app-server/src/request_processors/thread_projection.rs`

当前函数混合了 thread/read 降级、active turn 合并和 live status 修正。重构目标是让 snapshot 构造流程更像：

1. 读取 projection 所需的基础 thread view。
2. 合并 live active turn。
3. 如果存在 running turn，则刷新 thread status 并标记 stale turn。

#### `handle_projection_attach_response`

文件：`codex-rs/app-server/src/thread_projection_runtime.rs`

当前函数处理关闭检查、snapshot await、连接存活检查、attach、二次连接检查和响应发送。重构目标是保留线性流程，但提取重复的关闭检查和 attach 后连接关闭清理。

#### `ThreadProjectionManager`

文件：`codex-rs/app-server/src/thread_projection.rs`

保留当前数据结构：

- `threads`
- `connection_index`
- `head_commit_id`
- `has_subscribers_tx`

允许做局部 helper 提取，让 attach/detach/remove/project 的职责更清楚。但不重写为新 service、trait 或事件总线。

#### `thread_lifecycle.rs` 中 projection subscriber 的卸载条件

文件：`codex-rs/app-server/src/request_processors/thread_lifecycle.rs`

只整理当前分支加入 projection subscriber 后变复杂的判断。目标是让读者看出：普通 subscriber、projection subscriber、active turn 三者都空闲后，线程才进入卸载倒计时。

### 只做薄化或保持不动

这些既有上游文件只允许保持薄挂接点，不做主体重构：

- `codex-rs/app-server/src/message_processor.rs`
- `codex-rs/app-server/src/outgoing_message.rs`
- `codex-rs/app-server/src/thread_state.rs`
- `codex-rs/app-server/src/request_processors/thread_processor.rs`
- `codex-rs/app-server-protocol/src/protocol/common.rs`
- `codex-rs/app-server-protocol/src/protocol/v2/mod.rs`
- `codex-rs/tui/src/app/app_server_event_targets.rs`
- `codex-rs/tui/src/chatwidget.rs`

如果这些文件里已有的 projection 插入块很短，就不为了形式上的“新增优先”继续抽象。

### 非目标

本次不处理以下内容：

- CNB marketplace mirror 改动。
- apps feature 默认关闭相关测试配置。
- `Cargo.toml` / `Cargo.lock` 版本元数据。
- schema / TypeScript 生成物。
- 过程性 docs 的压缩或拆分。

这些内容可以在后续单独评估，不混入 projection 可读性重构。

## 行为保持要求

重构前后必须保持：

- `thread/projection/attach` 对无效 thread id 返回 invalid request。
- `thread/projection/attach` 对不存在 thread 返回 invalid request。
- 正在卸载的 thread 拒绝 attach。
- 已关闭 connection 不创建 projection subscription。
- attach response 仍由 listener command 顺序化发送。
- detach 仍返回 `detached`、`notSubscribed` 或 `notLoaded`。
- projection event 仍只包装 turn/item 生命周期通知。
- commit chain 中 `parentCommitId` 仍指向上一条 projection event 的 `commitId`。
- projection subscriber 仍会阻止线程卸载。
- TUI 仍忽略 projection event。

## 验收标准

1. 相对 `rust-v0.130.0`，新增 projection 文件仍承担主要逻辑。
2. 上游既有文件里的 projection 挂接点没有变厚。
3. `thread_projection_attach` 能通过函数名和 helper 顺序自然解释。
4. `handle_projection_attach_response` 的竞态处理更清晰。
5. `ThreadProjectionManager` 的订阅索引和 commit 链职责更清楚。
6. 不修改生成文件。
7. 不改 wire API。
8. `just fmt` 通过。
9. `cargo test -p codex-app-server-protocol` 通过。
10. app-server projection 相关测试通过。
