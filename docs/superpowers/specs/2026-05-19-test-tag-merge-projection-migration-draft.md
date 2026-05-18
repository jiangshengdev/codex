# test Tag Merge Projection Migration Draft

## 背景

`test` 是长期维护分支，基于原始 `rust-v0.130.0` 开发。它不能合并回 `main`，后续只能通过官方发布 tag，把 `main` 的变化一次一次单向合并到 `test`。

当前目标是把官方 `rust-v0.131.0` 吸收到 `test`，同时保留 `test` 上新增的核心功能：thread projection。

thread projection 在 `test` 上是本地 overlay，不是 `rust-v0.131.0` 的官方功能。`rust-v0.131.0` 提供了相近但不等价的能力，例如 `thread/read`、`thread/turns/list` 和普通 `turn/item` notification stream；它没有 `thread/projection/attach`、`thread/projection/detach`、`thread/projection/event`，也没有 projection subscription、commit chain、独立 detach lifecycle。

## 目标

- 以 `rust-v0.131.0` tag 为官方基线，把官方代码完整吸收到 `test`。
- 保留 `test` 的 thread projection API、runtime、测试和文档。
- 让 projection 适配 `rust-v0.131.0` 的新 app-server、protocol、TUI 结构。
- 保持后续 tag 升级可重复：每次都是“官方 tag merge + test overlay 修复”。

## 非目标

- 不把 `test` 合并回 `main`。
- 不把 projection 改写成 upstream-ready PR。
- 不用整文件覆盖方式回退官方 `rust-v0.131.0` 的结构性改动。
- 不为了迁移 projection 而扩展无关功能。
- 不在草案阶段修改生产代码或运行大范围测试。

## 已知现状

本地只读 dry-run 显示，`test` 合并 `rust-v0.131.0` 的硬冲突文件包括：

- `.github/workflows/rust-release.yml`
- `codex-rs/app-server-protocol/schema/typescript/ClientRequest.ts`
- `codex-rs/app-server/src/lib.rs`
- `codex-rs/app-server/src/request_processors.rs`
- `codex-rs/model-provider-info/src/lib.rs`
- `codex-rs/tui/src/chatwidget.rs`

projection 相关源码多数可以自动合并，但这不代表语义安全。`rust-v0.131.0` 大幅改动了 app-server、app-server-protocol、TUI 和 schema surface，projection 需要按新结构重新接线。

## 推荐迁移策略

采用 `tag merge + overlay re-integration`。

1. 从当前 `test` 创建临时迁移分支，例如 `test-merge-rust-v0.131.0`。
2. 在临时分支合并官方 tag `rust-v0.131.0`。
3. 冲突解决时以官方 tag 的新结构为底座。
4. 把 `test` 的 projection 作为 overlay 重新接回官方新结构。
5. 先让手写源码编译和测试通过，再重新生成 schema/TypeScript 文件。
6. 用小提交分层落地，避免把官方合并、projection 修复、生成物和 release/version 调整混在一起。

## 冲突解决原则

### 官方结构优先

如果冲突来自官方新增模块、官方重构、官方 API 变更，默认保留 `rust-v0.131.0` 的结构，再把 `test` 的必要功能补进去。

典型例子：

- `codex-rs/app-server/src/lib.rs` 要保留 `rust-v0.131.0` 新增的 `attestation`、`extensions`、`skills_watcher` 等模块，再补回 `thread_projection` 和 `thread_projection_runtime`。
- `codex-rs/app-server/src/request_processors.rs` 要保留 0.131 的新增 processor/import，再补回 projection request 类型和 handler 所需导入。
- `codex-rs/tui/src/chatwidget.rs` 不能按 0.130 的旧位置硬套，因为 0.131 已把大量逻辑拆到 `chatwidget/*` 子模块。

### projection 作为 test overlay

projection 不是官方 0.131 功能，所以不应尝试在官方代码里寻找一比一替代。保留 overlay 的核心语义：

- `thread/projection/attach` 返回 `subscriptionId` 和 `snapshot`。
- `snapshot` 包含当前 `thread` 和 `headCommitId`。
- `thread/projection/event` 包含 `threadId`、`subscriptionId`、`commitId`、`parentCommitId` 和 wrapped event。
- projection subscription 与普通 thread subscription 独立。
- `thread/unsubscribe` 不 detach projection subscription。
- connection close 需要清理 projection subscription。
- projection subscriber 需要参与 thread unload 判断。

### 生成物后置

schema JSON 和 TypeScript 生成物不作为主要冲突解决来源。先迁移手写 Rust 源码，再运行 schema generator 产出最终生成物。

需要避免在冲突中手工拼接以下文件作为最终状态：

- `codex-rs/app-server-protocol/schema/json/*`
- `codex-rs/app-server-protocol/schema/typescript/*`

手工修改只可作为临时 unblock；最终状态以 generator 输出为准。

## projection 迁移设计

### protocol 层

保留 `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs` 作为 projection API 定义文件。

在 0.131 的 protocol registry 中重新注册：

- `ClientRequest::ThreadProjectionAttach`
- `ClientRequest::ThreadProjectionDetach`
- `ServerNotification::ThreadProjectionEvent`

同时确认：

- v2 export namespace 仍是 `#[ts(export_to = "v2/")]`。
- wire method 仍是 `thread/projection/attach`、`thread/projection/detach`、`thread/projection/event`。
- projection event wrapped notification 仍只包含 `turn/started`、`turn/completed`、`item/started`、`item/completed`。

### app-server module 层

在 0.131 的 `codex-rs/app-server/src/lib.rs` 上追加 projection modules：

- `thread_projection`
- `thread_projection_runtime`

不要覆盖 0.131 新增 modules。

### request processor 层

保留 `codex-rs/app-server/src/request_processors/thread_projection.rs`，但需要重新对齐 0.131 的 `ThreadRequestProcessor` 构造、字段和 helper。

关键语义：

- `thread_projection_attach` 不是同步直接返回。
- attach request 需要进入 thread listener command 队列。
- snapshot 读取、closing-thread guard、connection live check、attach、late-close cleanup、response send 必须按 listener 顺序完成。
- `thread_projection_detach` 的 wire status 保持 `detached`、`notSubscribed`、`notLoaded`。
- manager 内部没有 projection entry 时仍映射为 wire `notSubscribed`，只有 thread 本身未加载才返回 wire `notLoaded`。

### projection manager/runtime 层

保留：

- `codex-rs/app-server/src/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection_runtime.rs`

需要重新对齐 0.131 的：

- `OutgoingMessageSender`
- `ThreadScopedOutgoingMessageSender`
- `ThreadStateManager`
- listener command enum
- thread unload watcher

关键语义：

- 普通 thread notification 仍发给普通 subscribers。
- 对 projection subscribers 额外 fanout `ServerNotification::ThreadProjectionEvent`。
- projection commit chain 由 manager 生成，不能依赖普通 notification ordering 外部推断。
- connection close cleanup 作为 projection 尾步骤接入，不改变上游已有 close 顺序。

### thread lifecycle 层

thread unload 判断需要同时考虑：

- 普通 thread subscribers。
- thread active status。
- projection subscribers。

当最后一个 projection subscriber detach 或 connection close 后，要能唤醒 unload watch。

### TUI 层

projection event 对 TUI 不是 actionable notification。迁移时要在 0.131 的新 notification handling 位置忽略它。

不能只沿用旧改法修改 `codex-rs/tui/src/chatwidget.rs`，因为 0.131 已经拆出 `codex-rs/tui/src/chatwidget/protocol.rs` 等文件。需要先定位当前 0.131 中 exhaustive `ServerNotification` match 的真实位置，再添加 no-op。

### docs 层

`codex-rs/app-server/README.md` 保留 projection API 说明，但需要放到 0.131 新 README 结构中，避免覆盖官方新增的 remote control、environment、attestation、config namespace 等内容。

## 提交分层建议

### Commit 1: merge official rust-v0.131.0 into test

只做官方 tag 合并和机械冲突解决，不做 projection 语义修复之外的额外重构。

### Commit 2: restore projection protocol source

接回 protocol source registry 和 v2 module exports，但不提交生成物最终状态。

### Commit 3: restore projection app-server runtime

接回 app-server modules、manager、runtime、request processor、outgoing fanout、lifecycle cleanup。

### Commit 4: adapt TUI notification handling

在 0.131 新 TUI structure 中忽略 `ThreadProjectionEvent`。

### Commit 5: regenerate schema and TypeScript fixtures

运行 app-server schema generator，提交生成物。

### Commit 6: focused verification fixes

只修复 narrow test/compile 暴露的问题，不扩大 scope。

## 验证策略

默认只跑窄范围验证，不跑全量测试。

建议顺序：

1. `just fmt`，在 `codex-rs` 目录。
2. `cargo test -p codex-app-server-protocol`。
3. `cargo test -p codex-app-server thread_projection --no-fail-fast`。
4. schema 变化后运行 `just write-app-server-schema`。
5. 如果 TUI match 编译失败，只跑最小 TUI compile/clippy filter；不默认跑 `cargo test -p codex-tui`。

如果修改了 `Cargo.toml` 或 `Cargo.lock` 中的依赖，而不是单纯版本/merge drift，需要按仓库规则补跑 Bazel lock 更新和检查。

## 风险与处理

### 风险：0.131 的 thread history path 与 projection snapshot 重叠

0.131 新增 `thread/turns/list`，并在分页历史时合并 live active turn。projection snapshot 也要合并 live active turn。

处理：

- 不删除 projection snapshot。
- 可以复用 0.131 的 thread reconstruction helper，但必须保留 projection 的 snapshot + commit chain + subscription lifecycle。
- 保持测试覆盖：普通 `thread/read(includeTurns: true)` 与 projection snapshot 的差异需要重新确认。

### 风险：TUI 文件重构导致旧 no-op 位置失效

处理：

- 迁移前用 `rg "ServerNotification"` 找真实 exhaustive match。
- 在新 owner 文件添加 no-op。
- 不把旧 `chatwidget.rs` 当唯一目标。

### 风险：schema 手工合并产生漂移

处理：

- 不把手工冲突解决后的 schema 当最终结果。
- 源码稳定后运行 generator。
- review generated diff，只确认 projection types 仍存在，官方 0.131 新 types 未丢失。

### 风险：release/version 文件被错误覆盖

处理：

- 版本、release workflow、npm package surface 单独看。
- 如果目标是吸收官方 tag，则默认保留官方 0.131 发布面；`test` 特有发布配置另开提交处理。

## 成功标准

- `test` 包含 `rust-v0.131.0` 的官方代码。
- projection API surface 仍存在并通过协议测试。
- projection attach/detach/event runtime 通过 app-server targeted tests。
- TUI 能处理新增 `ThreadProjectionEvent` variant，不因 exhaustive match 编译失败。
- schema/TypeScript 生成物包含官方 0.131 API 和 test projection API，没有互相覆盖。
- 迁移提交分层清楚，便于下一次 tag 重复执行。
