# Codex GUI Host Bridge Boundary Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只读确认认证后的 GUI `/ws` 如何按既有设计最小接入当前 `dev` / `rust-v0.136.0` app-server runtime，并为 `04-minimal-app-server-adapter.md` 输出不可漂移的实现边界。

**Architecture:** 本计划是 bridge boundary gate，不是 Rust 实现计划。它执行现有 design，尤其是 `2026-05-30-codex-gui-host-dev-adaptation-design.md` 的 `计划防漂移锁`，确认后续 app-server adapter 只能使用方案 A：薄 hook + 旁路模块。计划执行过程中不得重新选择 bridge 架构，不得创建 Rust 文件，不得恢复被 revert 的旧 extra-connection 路线。

**Tech Stack:** Rust 2024 source audit, codex-app-server in-process runtime, codex-app-server-client facade boundary, codex-gui-host backend contract, git history inspection, ripgrep.

---

## Scope

本计划只做 read-only source/design audit，并把结论记录到本文的 `Decision Output`。

允许修改：

- `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`

不允许修改：

- `codex-rs/app-server/**`
- `codex-rs/app-server-client/**`
- `codex-rs/tui/**`
- `codex-rs/gui-host/**`
- `codex-gui/**`
- `codex-rs/core/**`
- `docs/superpowers/specs/**`
- `docs/superpowers/plans/2026-05-30-gui-host/04-*`

停止条件：

- 如果需要重新选择 bridge 架构，停止并回到 design。
- 如果最小 hook 仍要求大面积改写 `rust-v0.136.0` 上游结构，停止。
- 如果 plan 想恢复 `open_extra_jsonrpc_connection` 或 `ExtraJsonRpcConnectionFactory`，停止。
- 如果 plan 想复制被 revert 的 extra-connection commits，停止。
- 如果 plan 想把 GUI、WebSocket、browser、token、Host、Origin 或 allowlist 概念放进 `in_process.rs`，停止。
- 如果 plan 想把 `InProcessAppServerClient` 改成 GUI-aware 状态机或多个 `Option<_>` 字段，停止。

## Source Of Truth

必须按以下顺序解释冲突：

1. `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
2. `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
3. `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`
4. `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
5. `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
6. current source under `codex-rs/**`
7. reverted commits, only as negative evidence

Current source can confirm hook placement and risk. It cannot reopen design decisions already locked by the source-of-truth design.

## File Responsibilities For The Next Plan

`03` must output the exact boundary for `04`, but it must not implement it.

Expected `04` ownership if the gate passes:

- `codex-rs/app-server/src/gui_host.rs`: GUI host lifecycle manager, lazy start / reuse / shutdown. Must not touch `MessageProcessor` internals.
- `codex-rs/app-server/src/gui_transport.rs`: `GuiBackend` implementation and authenticated browser WebSocket bridge. Must not own extra connection runtime state.
- `codex-rs/app-server/src/in_process_extra.rs`: extra connection lifecycle, command sender, outbound control, writer bridge, ID allocation, close cleanup. Must not depend on `codex-gui-host`.
- `codex-rs/app-server/src/in_process.rs`: only neutral runtime hooks for registration, command forwarding, outbound control branch, and thread listener connection-id extension.

Deferred to `05`:

- `codex-rs/app-server-client/src/gui.rs`
- minimal `codex-rs/app-server-client/src/lib.rs` wiring / construction / drop ordering

Deferred to `06`:

- `codex-rs/tui/src/app/gui.rs`
- TUI `/gui` command wiring

## Task 1: Confirm Design Gate Inputs

**Files:**
- Verify: `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- Verify: `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- Verify: `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`
- Verify: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`

- [ ] **Step 1: Confirm `2026-05-30` locks方案 A**

Run from repo root:

```bash
rg -n '方案 A|选方案 A|计划防漂移锁|已锁定决策|禁止方向|停止条件' \
  docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md
```

Expected: output includes `方案 A：薄 hook + 旁路模块`, `选方案 A`, `计划防漂移锁`, `已锁定决策`, `禁止方向`, and `停止条件`.

- [ ] **Step 2: Confirm low-intrusion design still requires neutral hooks**

Run from repo root:

```bash
rg -n 'hook 必须保持中性命名|不出现 GUI|不应继续留在 `in_process.rs`|app-server-client/src/lib.rs|不应保留的改动|验收标准' \
  docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md
```

Expected: output confirms `in_process.rs` must not contain GUI/WebSocket/allowlist/Origin concepts, and `app-server-client/src/lib.rs` must avoid broad facade reshape.

- [ ] **Step 3: Confirm extra open hook thinning design still pushes field knowledge out of `in_process.rs`**

Run from repo root:

```bash
rg -n '只收窄|只负责 runtime 编排|不再解构这些字段|不再知道 opened state 的字段列表|不直接构造 extra writer bridge|不直接创建 extra connection' \
  docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md
```

Expected: output confirms opened connection field knowledge belongs in `in_process_extra.rs`, not `in_process.rs`.

- [ ] **Step 4: Confirm roadmap defines `03` as a gate before implementation**

Run from repo root:

```bash
rg -n '03 bridge boundary decision|04 minimal app-server adapter|01.*03.*关键 gate|没有通过 gate|必须禁止|重写 `rust-v0.136.0` runtime loop' \
  docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md
```

Expected: output confirms `03` is before `04`, and `01` / `03` are gate plans protecting `rust-v0.136.0`.

- [ ] **Step 5: Record gate input result**

Append this exact result shape to `Decision Output`:

```markdown
### Task 1 Result: Design Gate Inputs

- PASS: `2026-05-30` locks方案 A and forbids plan-level bridge redesign.
- PASS: `2026-05-13` low-intrusion designs keep `in_process.rs` neutral and push extra connection details into `in_process_extra.rs`.
- PASS: `00-roadmap.md` defines `03` as the gate before `04`.
```

If any expected line is missing, stop and replace the relevant `PASS` with `BLOCKED`, including the exact missing pattern and file path.

## Task 2: Confirm Current Source State Before Bridge Work

**Files:**
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/02-gui-host-crate.md`
- Verify: `codex-rs/gui-host/src/backend.rs`
- Verify: `codex-rs/gui-host/src/ws.rs`
- Verify: `codex-rs/gui-host/src/filter.rs`
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `codex-rs/app-server-client/src/lib.rs`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`

- [ ] **Step 1: Confirm `02` stopped before bridge work**

Run from repo root:

```bash
rg -n 'Stop before bridge work|Allowed next plan after this one|03-bridge-boundary-decision.md|Not allowed as part of this plan' \
  docs/superpowers/plans/2026-05-30-gui-host/02-gui-host-crate.md
```

Expected: output confirms `02` allowed next plan is `03-bridge-boundary-decision.md`, and bridge files were not allowed in `02`.

- [ ] **Step 2: Confirm host shell backend contract is ready**

Run from repo root:

```bash
rg -n 'pub struct AuthenticatedGuiConnection|pub trait GuiBackend|fn connect|gui/authenticate|BrowserTextDisposition|is_allowed_client_request_method|is_allowed_backend_text' \
  codex-rs/gui-host/src/backend.rs \
  codex-rs/gui-host/src/ws.rs \
  codex-rs/gui-host/src/filter.rs
```

Expected: output shows `AuthenticatedGuiConnection`, `GuiBackend::connect`, first-frame `gui/authenticate`, browser filtering, and backend filtering.

- [ ] **Step 3: Confirm bridge-side files are not already present**

Run from repo root:

```bash
for p in \
  codex-rs/app-server/src/gui_host.rs \
  codex-rs/app-server/src/gui_transport.rs \
  codex-rs/app-server/src/in_process_extra.rs \
  codex-rs/app-server-client/src/gui.rs \
  codex-rs/tui/src/app/gui.rs; do
  [ -e "$p" ] && printf 'EXISTS %s\n' "$p" || printf 'ABSENT %s\n' "$p"
done
```

Expected:

```text
ABSENT codex-rs/app-server/src/gui_host.rs
ABSENT codex-rs/app-server/src/gui_transport.rs
ABSENT codex-rs/app-server/src/in_process_extra.rs
ABSENT codex-rs/app-server-client/src/gui.rs
ABSENT codex-rs/tui/src/app/gui.rs
```

- [ ] **Step 4: Confirm current `in_process.rs` remains single-main-connection shaped**

Run from repo root:

```bash
rg -n 'IN_PROCESS_CONNECTION_ID|enum InProcessClientMessage|enum ProcessorCommand|outbound_connections|thread_created_rx|vec!\[IN_PROCESS_CONNECTION_ID\]|route_outgoing_envelope|register_extra_connection|ExtraConnection|Gui|WebSocket|allowlist|Origin|browser|token' \
  codex-rs/app-server/src/in_process.rs
```

Expected:

- output includes `IN_PROCESS_CONNECTION_ID`, `InProcessClientMessage`, `ProcessorCommand`, `outbound_connections`, `thread_created_rx`, `vec![IN_PROCESS_CONNECTION_ID]`, and `route_outgoing_envelope`.
- output does not include `register_extra_connection`, `ExtraConnection`, `Gui`, `WebSocket`, `allowlist`, `Origin`, `browser`, or `token`.

- [ ] **Step 5: Confirm current `app-server-client/src/lib.rs` is not GUI-aware**

Run from repo root:

```bash
rg -n 'struct InProcessAppServerClient|command_tx: mpsc::Sender|event_rx: mpsc::Receiver|worker_handle: tokio::task::JoinHandle|pub async fn start|pub async fn request|pub async fn notify|pub async fn next_event|pub async fn shutdown|GuiHostManager|gui_host_manager|Option<mpsc::Sender|Option<mpsc::Receiver|Option<tokio::task::JoinHandle|impl Drop for InProcessAppServerClient' \
  codex-rs/app-server-client/src/lib.rs
```

Expected:

- output includes direct `command_tx`, `event_rx`, and `worker_handle` fields.
- output includes `start`, `request`, `notify`, `next_event`, and `shutdown`.
- output does not include `GuiHostManager`, `gui_host_manager`, `Option<mpsc::Sender`, `Option<mpsc::Receiver`, `Option<tokio::task::JoinHandle`, or `impl Drop for InProcessAppServerClient`.

- [ ] **Step 6: Record current source result**

Append this exact result shape to `Decision Output`:

```markdown
### Task 2 Result: Current Source State

- PASS: `02` stopped before app-server bridge work.
- PASS: `codex-rs/gui-host` exposes the authenticated backend contract needed by a later app-server bridge.
- PASS: bridge/client/TUI implementation files are absent and must be created only by later implementation plans.
- PASS: current `in_process.rs` is still single-main-connection shaped and contains no GUI concepts.
- PASS: current `app-server-client/src/lib.rs` is not GUI-aware and has not been reshaped into `Option<_>` lifecycle state.
```

If any expected source condition is false, stop and record `BLOCKED` with the exact command output that changed the conclusion.

## Task 3: Lock Allowed Hook Shape For `04`

**Files:**
- Verify: `codex-rs/app-server/src/in_process.rs`
- Verify: `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- Verify: `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`

- [ ] **Step 1: Inspect current `InProcessClientMessage` and `ProcessorCommand` shape**

Run from repo root:

```bash
sed -n '160,210p' codex-rs/app-server/src/in_process.rs
```

Expected: `InProcessClientMessage` has only main client messages such as request, notification, server request responses, and shutdown; `ProcessorCommand` has only main request/notification variants.

- [ ] **Step 2: Inspect current sender and handle public API**

Run from repo root:

```bash
sed -n '197,340p' codex-rs/app-server/src/in_process.rs
```

Expected: `InProcessClientSender` exposes main request/notify/server-request response helpers; `InProcessClientHandle::sender()` returns a cloneable sender; no extra connection API exists yet.

- [ ] **Step 3: Inspect current runtime loops that may need neutral hooks**

Run from repo root:

```bash
sed -n '390,520p' codex-rs/app-server/src/in_process.rs
```

Expected: output shows:

- `outbound_connections` created with `IN_PROCESS_CONNECTION_ID`.
- outbound router calls `route_outgoing_envelope`.
- processor loop handles `ProcessorCommand::Request` and `ProcessorCommand::Notification`.
- `thread_created_rx` currently attaches only `vec![IN_PROCESS_CONNECTION_ID]` when initialized.

- [ ] **Step 4: Approve only these `in_process.rs` hook categories for `04`**

Record this exact approval in `Decision Output`:

```markdown
### Task 3 Result: Allowed `in_process.rs` Hook Shape For `04`

APPROVED neutral hooks only:

- Add a neutral extra connection registration entry point on `InProcessClientSender`.
- Add a neutral wrapper command for extra connection messages; payload types must live in `in_process_extra.rs`.
- Add a processor-loop branch that delegates extra request / notification / close handling to `in_process_extra.rs`.
- Add an outbound-router control branch whose control type and handling logic live in `in_process_extra.rs`.
- Extend `thread_created_rx` connection-id selection through an `in_process_extra.rs` helper.

NOT APPROVED:

- GUI, WebSocket, browser, token, Host, Origin, allowlist, or launch URL concepts in `in_process.rs`.
- Extra connection state structs, writer bridge loops, outbound-control internals, or ID allocation logic in `in_process.rs`.
- Rewriting the main request / notification path.
- Rewriting `route_outgoing_envelope`, `MessageProcessor`, projection fanout, or thread lifecycle semantics.
```

- [ ] **Step 5: Stop if any approved hook requires a broader runtime rewrite**

If Step 3 shows the current runtime no longer has these narrow insertion points, append this exact blocked result and stop:

```markdown
### Task 3 Result: BLOCKED

`04` cannot proceed because current `in_process.rs` no longer has narrow insertion points for neutral extra connection hooks. Return to design before writing implementation.
```

## Task 4: Lock App-Server Adapter File Boundary For `04`

**Files:**
- Verify: `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- Verify: `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`

- [ ] **Step 1: Confirm app-server adapter ownership from design**

Run from repo root:

```bash
rg -n 'codex-rs/app-server/src/gui_host.rs|codex-rs/app-server/src/gui_transport.rs|codex-rs/app-server/src/in_process_extra.rs|codex-rs/app-server/src/in_process.rs|GuiHostManager|AuthenticatedGuiConnection|MessageProcessor|OutboundConnectionState' \
  docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md \
  docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md
```

Expected: output confirms `gui_host.rs`, `gui_transport.rs`, `in_process_extra.rs`, and minimal `in_process.rs` hooks are the app-server bridge files.

- [ ] **Step 2: Approve `04` file scope**

Record this exact approval in `Decision Output`:

```markdown
### Task 4 Result: Allowed `04` File Scope

APPROVED for `04-minimal-app-server-adapter.md`:

- Create `codex-rs/app-server/src/gui_host.rs`.
- Create `codex-rs/app-server/src/gui_transport.rs`.
- Create `codex-rs/app-server/src/in_process_extra.rs`.
- Modify `codex-rs/app-server/src/in_process.rs` only for neutral hooks.
- Modify app-server module declarations or crate-local exports only as needed to expose the new app-server modules.

DEFERRED to `05-app-server-client-facade.md`:

- `codex-rs/app-server-client/src/gui.rs`.
- `codex-rs/app-server-client/src/lib.rs` GUI facade construction, re-export, and drop ordering.

DEFERRED to `06-tui-gui-command.md`:

- `codex-rs/tui/**`.

NOT APPROVED in `04`:

- Any `codex-gui/**` change.
- Any `codex-rs/core/**` change.
- Any app-server protocol v2 API shape change.
- Any dependency from `codex-gui-host` to `codex-app-server`.
```

- [ ] **Step 3: Stop if `04` needs app-server-client lifecycle changes to compile**

If the only viable app-server adapter requires modifying `codex-rs/app-server-client/src/lib.rs` in the same plan, append this blocked result and stop:

```markdown
### Task 4 Result: BLOCKED

`04` cannot stay an app-server-only adapter because it requires app-server-client lifecycle changes. Split boundary must be revisited before implementation.
```

## Task 5: Record Reverted Commits As Negative Evidence

**Files:**
- Verify: git history
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`

- [ ] **Step 1: Confirm old `in_process.rs` runtime reshape commit**

Run from repo root:

```bash
git show --stat --oneline --find-renames 6043755e0 -- \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server/src/in_process_extra.rs
```

Expected: output shows `6043755e0 feat(app-server): process extra in-process connections` and a large `in_process.rs` diff.

- [ ] **Step 2: Confirm old `in_process_extra.rs` was runtime-coupled**

Run from repo root:

```bash
git show --no-ext-diff --unified=8 100d7fa48 -- codex-rs/app-server/src/in_process_extra.rs | \
  rg -n 'InProcessClientMessage|MessageProcessor|process_request|connection_closed|OutboundControl|OutboundConnectionState|ConnectionSessionState|outbound_initialized|writer bridge|ExtraConnectionState' -C 2
```

Expected: output shows the old module coupled to `InProcessClientMessage`, `MessageProcessor`, connection session state, outbound state, and close cleanup.

- [ ] **Step 3: Confirm old app-server-client facade reshape**

Run from repo root:

```bash
git show --no-ext-diff --unified=8 b23dd04c4 -- codex-rs/app-server-client/src/lib.rs | \
  rg -n 'Option<|gui_host_manager|shutdown_inner|impl Drop for InProcessAppServerClient|client is shut down|event_rx.as_mut|command_tx.as_ref' -C 2
```

Expected: output shows the old commit changed core client fields into `Option<_>`, added GUI manager state, added shutdown inner logic, and changed request/event paths.

- [ ] **Step 4: Confirm revert commits exist**

Run from repo root:

```bash
git log --oneline --grep='Revert.*process extra\\|Revert.*in-process extra\\|Revert.*app-server client facade\\|Revert.*checkpoint app-server bridge work'
```

Expected: output includes reverts for the old app-server extra connection module, old processing changes, old app-server bridge checkpoint, and old app-server-client facade.

- [ ] **Step 5: Record negative evidence**

Append this exact result to `Decision Output`:

```markdown
### Task 5 Result: Negative Evidence From Reverted Commits

The reverted commits are negative evidence only:

- `6043755e0` is rejected because it reshaped `in_process.rs` runtime loops and command routing instead of leaving thin hooks.
- `100d7fa48` is rejected because its `in_process_extra.rs` was strongly coupled to runtime internals and reimplemented session/outbound details in a way that still drove broad `in_process.rs` changes.
- `b23dd04c4` is rejected because it reshaped `InProcessAppServerClient` lifecycle into GUI-aware `Option<_>` state.
- Revert commits confirm these routes must not be restored or cherry-picked.
```

If any commit is missing from current history, keep the rejection by shape and record the missing commit lookup under the same section.

## Task 6: Produce Final Gate Decision

**Files:**
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md`

- [ ] **Step 1: Write final decision**

Append this exact final decision if Tasks 1-5 passed:

```markdown
### Final Decision

`03` gate passes.

`04-minimal-app-server-adapter.md` may be written only for the approved app-server adapter scope:

- create `gui_host.rs`;
- create `gui_transport.rs`;
- create `in_process_extra.rs`;
- add neutral hooks to `in_process.rs`;
- do not modify app-server-client facade or TUI yet.

The bridge shape is locked to方案 A：薄 hook + 旁路模块. Plans after this gate must execute the existing design and this decision output; they must not reopen bridge architecture.
```

- [ ] **Step 2: Write blocked decision if any task failed**

If any task recorded `BLOCKED`, append this exact final decision instead:

```markdown
### Final Decision

`03` gate does not pass.

Do not write `04-minimal-app-server-adapter.md`. Return to design discussion with the blocked evidence recorded above.
```

- [ ] **Step 3: Confirm no implementation files changed**

Run from repo root:

```bash
git diff --name-only | rg -v '^docs/superpowers/plans/2026-05-30-gui-host/03-bridge-boundary-decision.md$'
```

Expected: no output for this plan execution.

If this command prints any Rust, frontend, spec, lockfile, or unrelated plan path, stop and do not mark this task complete until the out-of-scope change is explained and removed or explicitly accepted by the user.

- [ ] **Step 4: Stop before `04`**

After this plan is complete, stop. Do not write `04-minimal-app-server-adapter.md` in the same task unless the user explicitly asks for it after reviewing the `03` output.

Allowed next plan after this one:

- `04-minimal-app-server-adapter.md`

Not allowed as part of this plan:

- `codex-rs/app-server/src/gui_host.rs`
- `codex-rs/app-server/src/gui_transport.rs`
- `codex-rs/app-server/src/in_process_extra.rs`
- changes to `codex-rs/app-server/src/in_process.rs`
- changes to `codex-rs/app-server-client/**`
- changes to `codex-rs/tui/**`
- changes to `codex-gui/**`

## Decision Output

This section is intentionally empty before execution. The worker executing this gate must append Task Results here and then stop before `04`.

## Self-Review Checklist

- [ ] This plan executes existing design decisions instead of reopening bridge architecture.
- [ ] This plan contains no Rust implementation steps.
- [ ] This plan does not create `04`.
- [ ] This plan treats reverted commits as negative evidence only.
- [ ] This plan forbids GUI concepts in `in_process.rs`.
- [ ] This plan forbids app-server-client lifecycle reshape in `03` and `04`.
- [ ] This plan has exact commands and expected results for every audit task.
