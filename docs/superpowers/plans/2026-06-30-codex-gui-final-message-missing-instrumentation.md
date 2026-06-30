# Codex GUI final message missing instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add temporary Rust-side instrumentation that proves where projection cursor state diverges when Codex GUI refresh loses the final assistant message.

**Architecture:** Instrument only the app-server projection/listener path. The plan records attach cut cursor, listener match/rebuild state, listener baseline, cursor writes, and event cursor advancement without changing projection behavior. Logs use stable event names and `thread_id` so one repro can be queried from `logs_2.sqlite`.

**Tech Stack:** Rust, `tracing`, Codex app-server, projection manager, thread listener lifecycle, `just` recipes from the repository root.

---

## File Structure

- Modify: `codex-rs/app-server/src/thread_state.rs`
  - Add a small read-only inspection type and method for listener match state.
  - Keep `listener_matches` behavior unchanged.
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
  - Log listener match/rebuild decision.
  - Log listener start baseline.
  - Log event cursor advancement.
- Modify: `codex-rs/app-server/src/thread_projection.rs`
  - Log `set_history_cursor` old/new values.
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs`
  - Log attach cut cursor and head commit before snapshot reconstruction.
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md`
  - Record implementation and verification steps as they happen.

No frontend files are in scope. No rollout, reconstruction, cursor monotonicity, or listener behavior should be changed in this plan.

## Task 1: Add Listener Match Inspection

**Files:**
- Modify: `codex-rs/app-server/src/thread_state.rs:99-105`
- Test: compile via `just test -p codex-app-server`

- [ ] **Step 1: Add a read-only inspection struct**

Add this near `ThreadState` or above its `impl` block:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ListenerMatchStatus {
    pub(crate) listener_present: bool,
    pub(crate) listener_weak_upgrade_ok: bool,
    pub(crate) listener_arc_matches: bool,
}

impl ListenerMatchStatus {
    pub(crate) fn matches(self) -> bool {
        self.listener_present && self.listener_weak_upgrade_ok && self.listener_arc_matches
    }
}
```

- [ ] **Step 2: Add an inspection method without changing behavior**

Replace the current `listener_matches` body with a call through the new helper:

```rust
pub(crate) fn listener_match_status(
    &self,
    conversation: &Arc<CodexThread>,
) -> ListenerMatchStatus {
    let listener_present = self.listener_thread.is_some();
    let upgraded_listener = self.listener_thread.as_ref().and_then(Weak::upgrade);
    let listener_weak_upgrade_ok = upgraded_listener.is_some();
    let listener_arc_matches = upgraded_listener
        .as_ref()
        .is_some_and(|existing| Arc::ptr_eq(existing, conversation));

    ListenerMatchStatus {
        listener_present,
        listener_weak_upgrade_ok,
        listener_arc_matches,
    }
}

pub(crate) fn listener_matches(&self, conversation: &Arc<CodexThread>) -> bool {
    self.listener_match_status(conversation).matches()
}
```

- [ ] **Step 3: Verify there is no behavior change**

Run from repo root:

```sh
just test -p codex-app-server
```

Expected: codex-app-server tests pass or existing unrelated failures are recorded in `execution-log.md` with exact failing test names.

## Task 2: Instrument Listener Match and Baseline

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:243-312`
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md`
- Test: compile via `just test -p codex-app-server`

- [ ] **Step 1: Log listener match state before the early return**

Inside `ensure_listener_task_running`, replace the direct `listener_matches` check with status capture:

```rust
let listener_match_status = thread_state.listener_match_status(&conversation);
tracing::info!(
    thread_id = %conversation_id,
    listener_generation = thread_state.listener_generation,
    listener_present = listener_match_status.listener_present,
    listener_weak_upgrade_ok = listener_match_status.listener_weak_upgrade_ok,
    listener_arc_matches = listener_match_status.listener_arc_matches,
    will_rebuild_listener = !listener_match_status.matches(),
    "projection_listener_match"
);
if listener_match_status.matches() {
    return Ok(());
}
```

This answers whether old URL attach only ensured the existing listener or actually rebuilt it.

- [ ] **Step 2: Replace the baseline helper with a diagnostic return value**

Add this private struct near `projection_history_cursor_for_listener_start`:

```rust
struct ProjectionListenerStartCursor {
    cursor: ProjectionHistoryCursor,
    is_ephemeral: bool,
    load_history_ok: bool,
    history_item_count: usize,
}
```

Change the helper to return the struct:

```rust
async fn projection_history_cursor_for_listener_start(
    conversation: &Arc<CodexThread>,
) -> ProjectionListenerStartCursor {
    if conversation.config_snapshot().await.ephemeral {
        return ProjectionListenerStartCursor {
            cursor: ProjectionHistoryCursor::default(),
            is_ephemeral: true,
            load_history_ok: false,
            history_item_count: 0,
        };
    }

    match conversation.load_history(/*include_archived*/ true).await {
        Ok(history) => {
            let history_item_count = history.items.len();
            ProjectionListenerStartCursor {
                cursor: ProjectionHistoryCursor::new(history_item_count),
                is_ephemeral: false,
                load_history_ok: true,
                history_item_count,
            }
        }
        Err(err) => {
            tracing::debug!(
                "starting projection history cursor at zero because history is not available: {err}"
            );
            ProjectionListenerStartCursor {
                cursor: ProjectionHistoryCursor::default(),
                is_ephemeral: false,
                load_history_ok: false,
                history_item_count: 0,
            }
        }
    }
}
```

- [ ] **Step 3: Log the listener start baseline before writing it**

Immediately after computing `projection_history_cursor` and before `set_history_cursor`:

```rust
let projection_listener_start_cursor =
    projection_history_cursor_for_listener_start(&conversation).await;
let projection_history_cursor = projection_listener_start_cursor.cursor;
tracing::info!(
    thread_id = %conversation_id,
    is_ephemeral = projection_listener_start_cursor.is_ephemeral,
    load_history_ok = projection_listener_start_cursor.load_history_ok,
    history_item_count = projection_listener_start_cursor.history_item_count,
    baseline_cursor_item_count = projection_history_cursor.item_count(),
    "projection_listener_baseline"
);
outgoing
    .thread_projection_manager()
    .set_history_cursor(conversation_id, projection_history_cursor)
    .await;
```

This records whether the listener start baseline is lower than the target rollout tail `244`.

- [ ] **Step 4: Record the implementation step**

Append to `execution-log.md`:

```markdown
### 临时 instrumentation：listener match 与 baseline

- 动作：在 `ensure_listener_task_running` 记录 `projection_listener_match`，在 listener start cursor 写入前记录 `projection_listener_baseline`。
- 目标：确认旧 URL attach 是否重建 listener，以及 baseline 是否小于目标 rollout tail `244`。
- 下一步：继续记录 cursor 写入和 event cursor 推进。
```

## Task 3: Instrument Cursor Writes

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection.rs:210-217`
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md`
- Test: compile via `just test -p codex-app-server`

- [ ] **Step 1: Log old/new cursor values in the centralized setter**

Change `set_history_cursor` to read the old value before assignment:

```rust
pub(crate) async fn set_history_cursor(
    &self,
    thread_id: ThreadId,
    history_cursor: ProjectionHistoryCursor,
) {
    let mut inner = self.inner.lock().await;
    let entry = inner.thread_entry_mut(thread_id);
    let old_history_cursor = entry.history_cursor;
    tracing::info!(
        thread_id = %thread_id,
        old_history_cursor_item_count = old_history_cursor.item_count(),
        new_history_cursor_item_count = history_cursor.item_count(),
        is_cursor_regression = history_cursor.item_count() < old_history_cursor.item_count(),
        old_head_commit_id = ?entry.head_commit_id,
        subscriber_count = entry.subscribers.len(),
        "projection_cursor_set"
    );
    entry.history_cursor = history_cursor;
}
```

This answers whether any caller writes a smaller cursor over a larger one.

- [ ] **Step 2: Record the implementation step**

Append to `execution-log.md`:

```markdown
### 临时 instrumentation：cursor 写入集中点

- 动作：在 `ThreadProjectionManager::set_history_cursor` 记录 `projection_cursor_set` old/new cursor。
- 目标：捕获是否存在 cursor 从 `244` 或更大写回 `240` 或更小。
- 下一步：继续记录 attach cut 和 event cursor 推进。
```

## Task 4: Instrument Event Cursor Advancement

**Files:**
- Modify: `codex-rs/app-server/src/request_processors/thread_lifecycle.rs:356-363`
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md`
- Test: compile via `just test -p codex-app-server`

- [ ] **Step 1: Add a compact event type label helper**

Add this private helper near `projection_persisted_rollout_item_count_for_event`:

```rust
fn projection_event_msg_type(event: &EventMsg) -> &'static str {
    match event {
        EventMsg::AgentMessage(_) => "agent_message",
        EventMsg::RawResponseItem(_) => "raw_response_item",
        EventMsg::TurnComplete(_) => "turn_complete",
        _ => "other",
    }
}
```

- [ ] **Step 2: Log cursor before and after event advancement**

In the event loop, replace the current direct assignment with explicit before/after variables:

```rust
let persisted_item_count =
    projection_persisted_rollout_item_count_for_event(&event.msg);
let cursor_before = projection_history_cursor;
let cursor_after = projection_history_cursor.advance_by(persisted_item_count);
tracing::info!(
    thread_id = %conversation_id,
    event_id = %event.id,
    event_msg_type = projection_event_msg_type(&event.msg),
    persisted_item_count,
    cursor_before_item_count = cursor_before.item_count(),
    cursor_after_item_count = cursor_after.item_count(),
    "projection_event_cursor_advance"
);
projection_history_cursor = cursor_after;
```

This answers whether the listener processes final `agent_message`, final assistant `RawResponseItem`, and completion events strongly enough to advance cursor to the rollout tail.

- [ ] **Step 3: Record the implementation step**

Append to `execution-log.md`:

```markdown
### 临时 instrumentation：event cursor 推进

- 动作：在 listener event loop 记录 `projection_event_cursor_advance`。
- 目标：确认 final `agent_message`、assistant final `RawResponseItem`、completion event 是否推进 projection cursor。
- 下一步：记录 attach cut。
```

## Task 5: Instrument Attach Cut

**Files:**
- Modify: `codex-rs/app-server/src/thread_projection_runtime.rs:90-109`
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md`
- Test: compile via `just test -p codex-app-server`

- [ ] **Step 1: Log the cut immediately after successful capture**

After `capture_snapshot_cut_if_generation_matches` returns `Some(cut)` and before `read_thread_projection_snapshot_at_cut_for_attach`:

```rust
tracing::info!(
    thread_id = %conversation_id,
    connection_id = ?connection_id,
    request_id = ?request_id,
    projection_generation = ?projection_generation,
    cut_history_cursor_item_count = cut.history_cursor.item_count(),
    cut_head_commit_id = ?cut.head_commit_id,
    "projection_attach_cut"
);
```

This answers whether attach snapshot input is already truncated before the final message lines.

- [ ] **Step 2: Record the implementation step**

Append to `execution-log.md`:

```markdown
### 临时 instrumentation：attach cut

- 动作：在 `handle_projection_attach_response` 记录 `projection_attach_cut`。
- 目标：确认 attach snapshot 使用的 `history_cursor.item_count()` 是否 `<= 240`。
- 下一步：运行格式化和 focused Rust tests。
```

## Task 6: Format and Focused Verification

**Files:**
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md`
- Test: `just fmt`, `just test -p codex-app-server`

- [ ] **Step 1: Run formatter**

Run from repo root:

```sh
just fmt
```

Expected: formatter completes. Any changed files should be listed in `git status --short`.

- [ ] **Step 2: Run focused Rust tests**

Run from repo root:

```sh
just test -p codex-app-server
```

Expected: tests pass. If tests fail, record exact failing test names and the first relevant failure lines in `execution-log.md` before changing anything else.

- [ ] **Step 3: Run scoped clippy fix only if tests compile**

Run from repo root:

```sh
just fix -p codex-app-server
```

Expected: clippy fix completes or reports actionable diagnostics. Do not re-run tests after `fix` or `fmt`; follow the repository rule.

- [ ] **Step 4: Check whitespace**

Run from repo root:

```sh
git diff --check -- codex-rs/app-server/src/thread_state.rs codex-rs/app-server/src/request_processors/thread_lifecycle.rs codex-rs/app-server/src/thread_projection.rs codex-rs/app-server/src/thread_projection_runtime.rs docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md
```

Expected: no output.

- [ ] **Step 5: Record verification results**

Append to `execution-log.md`:

```markdown
### 临时 instrumentation：格式化与 focused 验证

- 动作：运行 `just fmt`、`just test -p codex-app-server`、`just fix -p codex-app-server`、`git diff --check`。
- 结果：记录每条命令是否通过；如果失败，记录失败摘要和下一步。
- 下一步：启动 GUI/app-server 复现并查询 instrumentation 日志。
```

## Task 7: Reproduce and Query Runtime Logs

**Files:**
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md`
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/current-findings.md`

- [ ] **Step 1: Start the instrumented GUI/app-server**

Use the same GUI launch/debug flow as the current investigation. Preserve the old target URL:

```text
http://192.168.3.203:56228/?threadId=019f1824-3181-79a2-8553-e4ae29576184#token=yXyFPEx8nAB5PmNhJhKVpITOOhXMYHGbIB7IZBJYWl4
```

Expected: page opens and app-server writes logs to `/Users/jiangsheng/.codex/logs_2.sqlite`.

- [ ] **Step 2: Reproduce refresh**

Open the old URL, then refresh or open the old URL in a new browser context until the target turn again appears as `interrupted` with no final assistant entry.

Expected: Redux/attach snapshot reproduces missing final/status.

- [ ] **Step 3: Query instrumentation rows**

Run:

```sh
sqlite3 /Users/jiangsheng/.codex/logs_2.sqlite "select id, ts, target, feedback_log_body from logs where thread_id = '019f1824-3181-79a2-8553-e4ae29576184' and (feedback_log_body like '%projection_attach_cut%' or feedback_log_body like '%projection_listener_match%' or feedback_log_body like '%projection_listener_baseline%' or feedback_log_body like '%projection_cursor_set%' or feedback_log_body like '%projection_event_cursor_advance%') order by id;"
```

Expected: rows include the five event names from this plan.

- [ ] **Step 4: Interpret the evidence**

Use this decision table:

```text
projection_attach_cut cut_history_cursor_item_count <= 240:
  snapshot input is truncated before final; inspect baseline and cursor_set rows.

projection_listener_baseline baseline_cursor_item_count <= 240 plus projection_cursor_set old > new:
  listener baseline overwrite hypothesis has runtime evidence.

projection_event_cursor_advance reaches cursor_after_item_count >= 244 then projection_cursor_set regresses:
  event path advanced correctly, then manager cursor was overwritten.

projection_attach_cut cut_history_cursor_item_count >= 244 but snapshot still lacks final/status:
  cursor hypothesis is weakened; return to reconstruction input/output.

projection_listener_match always matches and no cursor regression appears:
  listener rebuild overwrite hypothesis is weakened; inspect event path and generation/capture timing.
```

- [ ] **Step 5: Update research files**

Append raw evidence summary to `execution-log.md`, then update `current-findings.md` with only stable conclusions. Keep hypotheses labeled as hypotheses unless logs directly prove them.

## Task 8: Cleanup Decision

**Files:**
- Modify after user direction: instrumentation files from Tasks 1-5
- Modify: `docs/superpowers/research/2026-06-30-codex-gui-final-message-missing/execution-log.md`

- [ ] **Step 1: Stop and ask for direction after evidence collection**

Do not leave instrumentation silently as final production code. Present the evidence and ask whether to:

```text
A. Remove temporary instrumentation and keep only research notes.
B. Keep instrumentation temporarily for another repro round.
C. Start a separate fix design based on the evidence.
```

- [ ] **Step 2: If removing instrumentation is chosen, revert only instrumentation edits**

Use `git restore` or a targeted reverse patch only for files changed by Tasks 1-5. Do not remove research notes unless explicitly requested.

- [ ] **Step 3: Verify cleanup**

Run:

```sh
git diff --check
```

Expected: no output.

## Command Verification Notes

These commands were checked against the root `justfile` before writing this plan:

- `just fmt`
- `just fix -p codex-app-server`
- `just test -p codex-app-server`

The root `justfile` sets `working-directory := "codex-rs"`. There is no separate `codex-rs/justfile`.

## Plan Self-Review

- Spec coverage: all design log points are represented by Tasks 2-5; verification and cleanup are represented by Tasks 6-8.
- 占位词扫描：本计划不保留待补内容。
- Scope check: the plan is limited to temporary app-server instrumentation and research note updates.
- Type consistency: field names use `*_item_count`; event names match the design: `projection_attach_cut`, `projection_listener_match`, `projection_listener_baseline`, `projection_cursor_set`, `projection_event_cursor_advance`.
