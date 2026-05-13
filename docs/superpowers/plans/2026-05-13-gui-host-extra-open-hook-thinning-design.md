# GUI Host Extra Open Hook Thinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 继续压薄 `codex-rs/app-server/src/in_process.rs` 中 extra connection open hook，让 opened connection 的字段知识集中在 `in_process_extra.rs`。

**架构：** GUI host ownership model 不变：TUI 只通过 `codex-app-server-client` 请求 launch URL，app-server runtime owns GUI host lifecycle，browser `/ws` traffic 仍作为 extra in-process connection 进入现有 `MessageProcessor` 和 `outbound_connections`。本计划只把 open 分支里的 writer bridge、per-extra outbound state、processor opened state 组装下沉到 `in_process_extra.rs`，`in_process.rs` 继续负责 runtime task、channel send ordering、主连接 writer、`outbound_connections` 和 shutdown ordering。

**技术栈：** Rust 2024, tokio, codex-app-server, codex-app-server-client, codex-app-server-protocol.

---

Source design: `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`.
Previous refactor plan: `docs/superpowers/plans/2026-05-11-gui-host/07-low-intrusion-refactor.md`.
Original GUI host spec: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`.

## 硬约束

- 不改变 GUI host 产品行为、安全边界、allowlist、launch URL shape 或 ownership model。
- 不把 GUI / WebSocket / allowlist / Origin 概念移入 `codex-rs/app-server/src/in_process.rs`。
- 不切换到 `TransportEvent`。
- 不新增第二套 app-server runtime、第二套 outbound router 或通用 virtual connection framework。
- 不改变主连接外部语义：
  - `InProcessClientHandle::{request, notify, sender}`
  - `InProcessClientSender::{request, notify, respond_to_server_request, fail_server_request}`
  - `ProcessorCommand::{Request, Notification}` 的处理路径
- `in_process.rs` 继续拥有 runtime task、`MessageProcessor` 构造、主连接 writer、`outbound_connections` `HashMap` 和 shutdown ordering。
- Extra open send ordering 保持不变：先发送 `OutboundControl::Register`，再发送 processor opened state。
- Extra close send ordering 保持不变：先发送 processor close，再发送 `OutboundControl::Unregister`。
- `in_process_extra.rs` 仍不依赖 `codex-gui-host`。

## 文件结构

- Modify: `codex-rs/app-server/src/in_process_extra.rs`
  - 新增 `PreparedExtraConnectionOpen` 聚合类型。
  - 新增 `OpenedExtraConnection` processor-side opened state，字段保持私有。
  - 新增 `prepare_opened_connection(...)` helper，集中创建 extra writer bridge、outbound state、`OutboundControl::Register` 和 `OpenedExtraConnection`。
  - 修改 `ExtraConnectionState::register_opened(...)`，改为接收 `OpenedExtraConnection`。
  - 添加 focused unit test 覆盖 `prepare_opened_connection(...)` 的结构性输出。
- Modify: `codex-rs/app-server/src/in_process.rs`
  - 将 `ProcessorCommand::ExtraConnectionOpened { ... }` 收窄为 `ProcessorCommand::ExtraConnectionOpened(OpenedExtraConnection)`。
  - 将 `ExtraConnectionCommand::Opened` 分支改成调用 `prepare_opened_connection(...)`，只保留两个 runtime channel send。
  - 保留 `ExtraConnectionCommand::{Request, Notification, Closed}` 的现有转发和 cleanup 顺序。
  - 更新 `processor_command_has_extra_variants` 测试。

## Task 0: Baseline Verification

**Files:**
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server/src/in_process_extra.rs`
- Verify: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Confirm the working tree has no unexpected code edits**

Run from repo root:

```bash
git status --short
```

Expected: no Rust code changes before implementation starts. Untracked or modified planning docs are acceptable.

- [ ] **Step 2: Confirm the current remaining open-hook shape**

Run from repo root:

```bash
rg -n "ExtraConnectionOpened|ExtraConnectionCommand::Opened|spawn_extra_writer_bridge|OutboundControl::Register|register_opened" \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server/src/in_process_extra.rs
```

Expected: `in_process.rs` still contains the `ExtraConnectionCommand::Opened` arm that calls `spawn_extra_writer_bridge`, creates `AtomicBool` / `RwLock<HashSet<String>>`, sends `OutboundControl::Register`, and sends `ProcessorCommand::ExtraConnectionOpened { ... }`.

- [ ] **Step 3: Run current in-process baseline tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server register_extra_connection
cargo test -p codex-app-server extra_connection
cargo test -p codex-app-server dropping_extra_handle_triggers_connection_closed
```

Expected: all matching tests pass. If a filter unexpectedly matches no tests, run:

```bash
cargo test -p codex-app-server in_process
```

Expected: the in-process runtime tests pass before refactoring.

- [ ] **Step 4: Run current GUI client facade tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
cargo test -p codex-app-server-client shutdown_drops_gui_host_manager_before_worker
```

Expected: both tests pass. If either fails, stop and diagnose before touching open-hook code.

- [ ] **Step 5: Commit nothing**

This is a baseline task only.

## Task 1: Add Prepared Open Types in `in_process_extra.rs`

**Files:**
- Modify: `codex-rs/app-server/src/in_process_extra.rs`
- Test: `codex-rs/app-server/src/in_process_extra.rs`

- [ ] **Step 1: Write the failing test for prepared open output**

Add this test inside `codex-rs/app-server/src/in_process_extra.rs` `#[cfg(test)] mod tests`:

```rust
    #[tokio::test]
    async fn prepare_opened_connection_builds_register_and_processor_open() {
        let connection_id = ConnectionId(41);
        let (outgoing_tx, _outgoing_rx) = mpsc::channel(4);
        let disconnect_token = CancellationToken::new();

        let prepared = prepare_opened_connection(
            connection_id,
            outgoing_tx,
            disconnect_token,
            /*channel_capacity*/ 4,
        );

        assert_eq!(prepared.connection_id, connection_id);
        assert_eq!(prepared.processor_open.connection_id(), connection_id);

        match prepared.outbound_control {
            OutboundControl::Register {
                connection_id: registered_id,
                writer,
                initialized,
                experimental_api_enabled,
                opted_out_notification_methods,
                disconnect_sender,
            } => {
                assert_eq!(registered_id, connection_id);
                assert!(!initialized.load(Ordering::Acquire));
                assert!(!experimental_api_enabled.load(Ordering::Acquire));
                assert_eq!(
                    opted_out_notification_methods
                        .read()
                        .expect("opted-out lock should not be poisoned")
                        .len(),
                    0
                );
                assert!(disconnect_sender.is_some());
                drop(writer);
            }
            OutboundControl::Unregister { .. } => {
                panic!("prepared open must register outbound state");
            }
        }
    }
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server prepare_opened_connection_builds_register_and_processor_open
```

Expected: FAIL with unresolved symbols such as `prepare_opened_connection`, `PreparedExtraConnectionOpen`, or `OpenedExtraConnection::connection_id`.

- [ ] **Step 3: Add `PreparedExtraConnectionOpen` and `OpenedExtraConnection`**

In `codex-rs/app-server/src/in_process_extra.rs`, add these types after `handle_outbound_control(...)` and before `spawn_extra_writer_bridge(...)`:

```rust
pub(crate) struct PreparedExtraConnectionOpen {
    pub(crate) connection_id: ConnectionId,
    pub(crate) outbound_control: OutboundControl,
    pub(crate) processor_open: OpenedExtraConnection,
}

pub(crate) struct OpenedExtraConnection {
    connection_id: ConnectionId,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}

impl OpenedExtraConnection {
    #[cfg(test)]
    pub(crate) fn connection_id(&self) -> ConnectionId {
        self.connection_id
    }

    #[cfg(test)]
    pub(crate) fn for_test(connection_id: ConnectionId) -> Self {
        Self {
            connection_id,
            outbound_initialized: Arc::new(AtomicBool::new(false)),
            outbound_experimental_api_enabled: Arc::new(AtomicBool::new(false)),
            outbound_opted_out_notification_methods: Arc::new(RwLock::new(HashSet::new())),
        }
    }
}
```

The fields stay private. `connection_id()` and `for_test(...)` are test-only helpers so production code cannot start depending on the opened-state field list.

- [ ] **Step 4: Add `prepare_opened_connection(...)`**

Add this function after `impl OpenedExtraConnection`:

```rust
pub(crate) fn prepare_opened_connection(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    disconnect_token: CancellationToken,
    channel_capacity: usize,
) -> PreparedExtraConnectionOpen {
    let (extra_writer_tx, extra_writer_rx) =
        mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
    spawn_extra_writer_bridge(connection_id, outgoing_tx, extra_writer_rx);

    let initialized = Arc::new(AtomicBool::new(false));
    let experimental_api_enabled = Arc::new(AtomicBool::new(false));
    let opted_out_notification_methods = Arc::new(RwLock::new(HashSet::new()));

    PreparedExtraConnectionOpen {
        connection_id,
        outbound_control: OutboundControl::Register {
            connection_id,
            writer: extra_writer_tx,
            initialized: Arc::clone(&initialized),
            experimental_api_enabled: Arc::clone(&experimental_api_enabled),
            opted_out_notification_methods: Arc::clone(&opted_out_notification_methods),
            disconnect_sender: Some(disconnect_token),
        },
        processor_open: OpenedExtraConnection {
            connection_id,
            outbound_initialized: initialized,
            outbound_experimental_api_enabled: experimental_api_enabled,
            outbound_opted_out_notification_methods: opted_out_notification_methods,
        },
    }
}
```

`prepare_opened_connection(...)` must not send on runtime channels, must not access `MessageProcessor`, and must not access `outbound_connections`.

- [ ] **Step 5: Run the focused test and confirm it passes**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server prepare_opened_connection_builds_register_and_processor_open
```

Expected:

```text
test in_process_extra::tests::prepare_opened_connection_builds_register_and_processor_open ... ok
```

- [ ] **Step 6: Commit**

```bash
git add codex-rs/app-server/src/in_process_extra.rs
git commit -m "refactor(app-server): prepare extra connection open state"
```

## Task 2: Consume Prepared Open State from `in_process.rs`

**Files:**
- Modify: `codex-rs/app-server/src/in_process.rs`
- Modify: `codex-rs/app-server/src/in_process_extra.rs`
- Test: `codex-rs/app-server/src/in_process.rs`
- Test: `codex-rs/app-server/src/in_process_extra.rs`

- [ ] **Step 1: Update the processor command shape test first**

Replace the body of `processor_command_has_extra_variants` in `codex-rs/app-server/src/in_process.rs` with:

```rust
    #[test]
    fn processor_command_has_extra_variants() {
        fn requires_send<T: Send>() {}
        requires_send::<ProcessorCommand>();
        let _opened = ProcessorCommand::ExtraConnectionOpened(
            crate::in_process_extra::OpenedExtraConnection::for_test(ConnectionId(7)),
        );
        let _closed =
            ProcessorCommand::Extra(crate::in_process_extra::ExtraConnectionCommand::Closed {
                connection_id: ConnectionId(7),
            });
    }
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server processor_command_has_extra_variants
```

Expected: FAIL because `ProcessorCommand::ExtraConnectionOpened` still uses the old struct variant shape.

- [ ] **Step 3: Change `ProcessorCommand::ExtraConnectionOpened` to a single payload**

In `codex-rs/app-server/src/in_process.rs`, replace the old enum variant:

```rust
    ExtraConnectionOpened {
        connection_id: ConnectionId,
        outbound_initialized: Arc<AtomicBool>,
        outbound_experimental_api_enabled: Arc<AtomicBool>,
        outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
    },
```

with:

```rust
    ExtraConnectionOpened(crate::in_process_extra::OpenedExtraConnection),
```

Then replace the processor loop arm:

```rust
                            Some(ProcessorCommand::ExtraConnectionOpened {
                                connection_id,
                                outbound_initialized,
                                outbound_experimental_api_enabled,
                                outbound_opted_out_notification_methods,
                            }) => {
                                extra_connections.register_opened(
                                    connection_id,
                                    outbound_initialized,
                                    outbound_experimental_api_enabled,
                                    outbound_opted_out_notification_methods,
                                );
                            }
```

with:

```rust
                            Some(ProcessorCommand::ExtraConnectionOpened(opened)) => {
                                extra_connections.register_opened(opened);
                            }
```

- [ ] **Step 4: Change `ExtraConnectionState::register_opened(...)`**

In `codex-rs/app-server/src/in_process_extra.rs`, replace:

```rust
    pub(crate) fn register_opened(
        &mut self,
        connection_id: ConnectionId,
        outbound_initialized: Arc<AtomicBool>,
        outbound_experimental_api_enabled: Arc<AtomicBool>,
        outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
    ) {
        self.entries.insert(
            connection_id,
            ExtraConnectionEntry {
                session_state: Arc::new(ConnectionSessionState::new()),
                outbound_initialized,
                outbound_experimental_api_enabled,
                outbound_opted_out_notification_methods,
            },
        );
    }
```

with:

```rust
    pub(crate) fn register_opened(&mut self, opened: OpenedExtraConnection) {
        let OpenedExtraConnection {
            connection_id,
            outbound_initialized,
            outbound_experimental_api_enabled,
            outbound_opted_out_notification_methods,
        } = opened;

        self.entries.insert(
            connection_id,
            ExtraConnectionEntry {
                session_state: Arc::new(ConnectionSessionState::new()),
                outbound_initialized,
                outbound_experimental_api_enabled,
                outbound_opted_out_notification_methods,
            },
        );
    }
```

- [ ] **Step 5: Thin the `ExtraConnectionCommand::Opened` branch**

In `codex-rs/app-server/src/in_process.rs`, replace the opened branch body:

```rust
                                    // Runtime-abort path: if `SHUTDOWN_TIMEOUT` fires before all
                                    // close commands are drained, remaining extra connections are
                                    // torn down indirectly via the existing shutdown tail.
                                    let (extra_writer_tx, extra_writer_rx) =
                                        mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
                                    crate::in_process_extra::spawn_extra_writer_bridge(
                                        connection_id,
                                        outgoing_tx,
                                        extra_writer_rx,
                                    );
                                    let initialized = Arc::new(AtomicBool::new(false));
                                    let experimental_api_enabled =
                                        Arc::new(AtomicBool::new(false));
                                    let opted_out_notification_methods =
                                        Arc::new(RwLock::new(HashSet::new()));
                                    if outbound_control_tx
                                        .send(crate::in_process_extra::OutboundControl::Register {
                                            connection_id,
                                            writer: extra_writer_tx,
                                            initialized: Arc::clone(&initialized),
                                            experimental_api_enabled: Arc::clone(
                                                &experimental_api_enabled,
                                            ),
                                            opted_out_notification_methods: Arc::clone(
                                                &opted_out_notification_methods,
                                            ),
                                            disconnect_sender: Some(disconnect_token),
                                        })
                                        .await
                                        .is_err()
                                    {
                                        break;
                                    }
                                    if processor_tx
                                        .send(ProcessorCommand::ExtraConnectionOpened {
                                            connection_id,
                                            outbound_initialized: initialized,
                                            outbound_experimental_api_enabled:
                                                experimental_api_enabled,
                                            outbound_opted_out_notification_methods:
                                                opted_out_notification_methods,
                                        })
                                        .await
                                        .is_err()
                                    {
                                        break;
                                    }
```

with:

```rust
                                    // Runtime-abort path: if `SHUTDOWN_TIMEOUT` fires before all
                                    // close commands are drained, remaining extra connections are
                                    // torn down indirectly via the existing shutdown tail.
                                    let prepared =
                                        crate::in_process_extra::prepare_opened_connection(
                                            connection_id,
                                            outgoing_tx,
                                            disconnect_token,
                                            channel_capacity,
                                        );

                                    if outbound_control_tx
                                        .send(prepared.outbound_control)
                                        .await
                                        .is_err()
                                    {
                                        break;
                                    }

                                    if processor_tx
                                        .send(ProcessorCommand::ExtraConnectionOpened(
                                            prepared.processor_open,
                                        ))
                                        .await
                                        .is_err()
                                    {
                                        break;
                                    }
```

Keep the send order exactly as shown: outbound registration first, processor registration second.

- [ ] **Step 6: Run focused tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server processor_command_has_extra_variants
cargo test -p codex-app-server prepare_opened_connection_builds_register_and_processor_open
```

Expected: both tests pass.

- [ ] **Step 7: Confirm `in_process.rs` no longer owns extra open field construction**

Run from repo root:

```bash
rg -n "spawn_extra_writer_bridge|ExtraConnectionOpened \\{|mpsc::channel::<QueuedOutgoingMessage>\\(channel_capacity\\)|Arc::new\\(AtomicBool::new\\(false\\)\\)|Arc::new\\(RwLock::new\\(HashSet::new\\(\\)\\)\\)" \
  codex-rs/app-server/src/in_process.rs
```

Expected: no matches for the extra open branch. Matches from the main connection writer setup near `IN_PROCESS_CONNECTION_ID` are acceptable for `mpsc::channel::<QueuedOutgoingMessage>(channel_capacity)`, `AtomicBool`, and `RwLock<HashSet<String>>`; if those appear, inspect the lines and confirm they are only for the main connection.

- [ ] **Step 8: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "refactor(app-server): thin extra connection open hook"
```

## Task 3: Regression Verification

**Files:**
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server/src/in_process_extra.rs`
- Verify: `codex-rs/app-server-client/src/gui.rs`

- [ ] **Step 1: Run app-server extra connection tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server register_extra_connection
cargo test -p codex-app-server extra_connection
cargo test -p codex-app-server dropping_extra_handle_triggers_connection_closed
```

Expected: all matching tests pass. These preserve request roundtrip, notification, close, and backpressure-related behavior around extra connections.

- [ ] **Step 2: Run main in-process smoke test**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server in_process_start_initializes_and_handles_typed_v2_request
```

Expected:

```text
test tests::in_process_start_initializes_and_handles_typed_v2_request ... ok
```

- [ ] **Step 3: Run GUI client launch/shutdown tests**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-client gui_launch_url_returns_real_url_for_in_process
cargo test -p codex-app-server-client shutdown_drops_gui_host_manager_before_worker
```

Expected: both tests pass. This confirms the thinning did not change GUI launch URL behavior or shutdown ordering.

- [ ] **Step 4: Run formatting and scoped lint fix**

Run from `codex-rs`:

```bash
just fmt
just fix -p codex-app-server
```

Expected: both commands complete successfully. Per repo convention, do not rerun tests after `fmt` or `fix`; inspect any automatic changes before committing.

- [ ] **Step 5: Run whitespace check**

Run from repo root:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add codex-rs/app-server/src/in_process.rs codex-rs/app-server/src/in_process_extra.rs
git commit -m "test(app-server): verify extra open hook thinning"
```

If Task 3 only runs verification and produces no file changes after `fmt` / `fix`, skip this commit.

## 验收标准

- `ProcessorCommand::ExtraConnectionOpened` 只持有 `OpenedExtraConnection` 一个 payload。
- `in_process.rs` 的 `ExtraConnectionCommand::Opened` 分支只调用 `prepare_opened_connection(...)`，然后按顺序发送 `prepared.outbound_control` 和 `prepared.processor_open`。
- `in_process.rs` 不直接构造 extra writer bridge。
- `in_process.rs` 不直接创建 extra connection 的 `AtomicBool` / `RwLock<HashSet<String>>` outbound state。
- `ExtraConnectionState::register_opened(...)` 接收 `OpenedExtraConnection`，不再接收多参数 outbound state。
- `OpenedExtraConnection` 的字段保持私有。
- `prepare_opened_connection(...)` 不发送 channel，不访问 `MessageProcessor`，不访问 `outbound_connections`。
- `ExtraConnectionCommand::{Request, Notification, Closed}` 的现有转发和 cleanup 顺序不变。
- `in_process_extra.rs` 仍不依赖 `codex-gui-host`。
- `in_process.rs` 仍不包含 GUI / WebSocket / allowlist / Origin 概念。
- 主连接外部语义不变。
- 所有 scoped verification commands 通过，或失败时有明确环境/既有失败说明。

## 风险与未决事项

- `prepare_opened_connection(...)` 会先 spawn writer bridge，再由 `in_process.rs` 发送 outbound/processor registration。若后续 send 失败，writer bridge 仍依靠 channel drop 自然退出；这与 design 文档的错误语义一致，不新增补偿路径。
- Task 2 的 `rg` 检查可能命中主连接初始化代码；不能机械删除主连接使用的 `QueuedOutgoingMessage`、`AtomicBool`、`RwLock<HashSet<String>>`。
- 如果 `just fix -p codex-app-server` 因环境问题失败，保留前面 `cargo test` 结果，并在最终交付中说明具体错误；不要扩大到 workspace-wide `just fix`。

## Self-Review

- Spec coverage: 本计划覆盖新增 `PreparedExtraConnectionOpen`、新增 `OpenedExtraConnection`、新增 `prepare_opened_connection(...)`、`ProcessorCommand` 收窄、open 分支收窄、`register_opened(...)` 收窄、request/notification/close 不大改、错误语义和验收测试。
- Placeholder scan: 本文件未发现禁用占位词或无代码的泛化测试步骤。
- Type consistency: `PreparedExtraConnectionOpen`、`OpenedExtraConnection`、`prepare_opened_connection(...)`、`ProcessorCommand::ExtraConnectionOpened(...)`、`ExtraConnectionState::register_opened(...)` 在各任务中的名称和签名保持一致。
