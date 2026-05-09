# rust-v0.130.0 Projection Merge Design

日期：2026-05-09

状态：设计待审阅

## 目标

在当前 `port/lazy-proj-129` 分支上使用 merge commit 合入 `rust-v0.130.0`，保留 GUI thread projection 功能，并让分支站到 130 基线。

这次工作只处理合并和冲突解决，不主动扩展 projection 协议语义，不重构 projection snapshot/read 路径，也不引入 catch-up、commit log 或 server-side GUI store。

## 当前上下文

当前分支以 `rust-v0.129.0` 为基础，新增了 GUI thread projection 的 Rust 侧最小实现：

- `thread/projection/attach`
- `thread/projection/detach`
- `thread/projection/event`
- projection snapshot
- per-connection subscription
- per-thread projection commit chain
- typed notification envelope fanout

`rust-v0.130.0` 相对当前分支的共同祖先是 `a8488fec5`。预检显示当前分支相对 130 有 15 个本地提交、缺少 44 个上游提交。冲突集中在：

- `codex-rs/app-server-protocol`
- `codex-rs/app-server`
- generated schema / TypeScript fixtures
- `codex-rs/thread-store`

## 合并原则

采用这个规则：

```text
130 是基础设施真相；projection 是当前分支新增能力。
```

因此：

- 对 130 已删除或替换的旧功能，接受 130。
- 对当前分支新增的 projection 文件和 API，保留当前分支。
- 对共同修改的 orchestration 文件，手工合并两边意图。
- 对 generated schema / TypeScript fixtures，合并后重新生成，不手工维护最终形态。

## 保留 130 的内容

合并时应保留 `rust-v0.130.0` 的基础设施变化：

- `thread/turns/list` 的 `itemsView` 支持。
- `thread/turns/items/list` 协议入口，虽然当前实现仍返回 unsupported。
- `ThreadStore` contract 更新，包括 turn/item pagination 类型。
- remote thread-store implementation 删除。
- device-key API 和相关 processor/test/schema 删除。
- plugin hooks、plugin share metadata、discoverability 等协议和 app-server 改动。
- `codex remote-control` 相关入口和 protocol surface。
- app-server live config refresh、feedback/account id、analytics/OTEL 等 130 侧改动。
- CI、dependency、Cargo profile、doctest target 等 130 侧 housekeeping。

## 保留 projection 的内容

合并后应继续保留当前分支新增的 projection surface：

- `codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection_runtime.rs`
- `codex-rs/app-server/src/request_processors/thread_projection.rs`
- `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
- generated projection schema / TypeScript files
- `app-server/README.md` 中的 projection API 文档

协议上应继续暴露：

```text
thread/projection/attach
thread/projection/detach
thread/projection/event
```

runtime 上应继续保持：

- attach response 在 thread listener 顺序内发送。
- attach 成功后才创建 projection subscription。
- connection close 会清理 projection subscriptions。
- projection subscribers 会参与 thread unload 延迟判断。
- `ThreadScopedOutgoingMessageSender::send_server_notification` 会 tap 白名单 typed notifications，并向 projection subscribers 发送 projection envelope。

## 冲突处理设计

### app-server-protocol

`src/protocol/common.rs`：

- 保留 130 的 `ThreadTurnsItemsList`、plugin/share、remote-control、permission payload 等新增或调整。
- 删除 130 已移除的 device-key request/response。
- 重新加入 projection request 和 notification definitions。

`src/protocol/v2/mod.rs`：

- 保留 130 的模块布局，包括删除 `device_key`、新增 `remote_control` 等。
- 重新加入 `mod thread_projection;` 和 `pub use thread_projection::*;`。

`src/protocol/v2/thread_projection.rs`：

- 保留当前分支文件。
- 保留协议序列化/反序列化测试在该文件内。

generated schema / TypeScript：

- 合并时不用逐个手工调最终内容。
- 冲突解决后运行 `just write-app-server-schema`。
- 最终 fixtures 应同时反映 130 删除 device-key 和当前分支新增 projection。

### app-server

`src/lib.rs`：

- 保留 130 的模块。
- 重新加入 `mod thread_projection;` 和 `mod thread_projection_runtime;`。

`src/request_processors.rs`：

- 保留 130 的 request processor modules。
- 删除 device-key processor。
- 重新加入 `mod thread_projection;`。

`src/message_processor.rs`：

- 保留 130 的 request routing 和 connection/session behavior。
- 重新加入 projection attach/detach request routing。
- connection close 清理中保留 projection subscription cleanup，但不改变 130 的 cleanup 顺序含义。

`src/outgoing_message.rs`：

- 保留 130 的 outgoing/request-context/analytics 变化。
- 保留 projection manager field 和 `thread_projection_manager()` accessor。
- 在 `ThreadScopedOutgoingMessageSender::send_server_notification` 中继续先投递 projection envelope，再发送普通 typed notification。

`src/thread_state.rs`：

- 保留 130 的 thread state 字段和 listener command variants。
- 重新加入 `SendThreadProjectionAttachResponse` listener command variant。

`src/request_processors/thread_lifecycle.rs`：

- 保留 130 的 listener lifecycle 和 unload behavior。
- 重新接入 `ProjectionSubscriberWatch`，让 projection subscribers 也阻止 thread unload。
- 保留 listener command handling 中对 projection attach response 的调用。

`src/request_processors/thread_processor.rs`：

- 以 130 的 thread read / turns pagination 逻辑为主。
- 不把 projection request 主逻辑重新塞回这个大文件。
- 只保留 `request_processors/thread_projection.rs` 需要调用的窄 helper 可见性。

`src/request_processors/thread_projection.rs`：

- 保留 projection attach/detach/snapshot implementation。
- 根据 130 的 `ThreadRequestProcessor` helper 签名修正调用。
- 保留测试确认普通 `thread/read` 不合并 active turn，而 projection snapshot 合并 active turn。

### thread-store

`codex-rs/thread-store` 以 130 为准：

- 接受 remote thread-store 删除。
- 接受 `ThreadStore` contract、pagination params、stored turn/item 类型更新。
- projection 不直接依赖 remote thread-store，因此不恢复已删除 remote implementation。

## 非目标

这次合并不做：

- 不把 projection snapshot 改成分页返回。
- 不新增 projection catch-up 或 missed commits API。
- 不新增 server-side GUI store。
- 不扩大 projection event 白名单。
- 不修改 GUI 客户端策略。
- 不主动重构 `ThreadStore` 或 `ThreadRequestProcessor` 之外的 130 代码。

## 验证策略

完成 merge 和冲突解决后运行：

```bash
cd codex-rs
just fmt
just write-app-server-schema
cargo test -p codex-app-server-protocol
cargo test -p codex-app-server thread_projection --no-fail-fast
cargo test -p codex-app-server --no-fail-fast
just fix -p codex-app-server
```

如果 protocol schema 生成修改了 fixtures，要检查 projection generated files 仍存在，device-key generated files 不应被恢复。

不默认运行完整 `cargo test` 或 `just test`，因为这次触及 app-server/protocol/common 面较广，完整套件可能明显变慢。若需要完整套件，应单独确认后再运行。

## 成功标准

- 当前分支包含一个 merge commit 合入 `rust-v0.130.0`。
- `rust-v0.130.0` 的基础设施变化存在。
- projection API、runtime、tests 和 docs 仍存在。
- app-server protocol schema 能重新生成。
- projection 相关测试和 app-server protocol 测试通过。
- 未恢复 130 删除的 device-key API 和 remote thread-store implementation。
