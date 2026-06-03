# Codex GUI Host Design Source Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只读复核 GUI host design 与当前 `dev` / `rust-v0.136.0` 源码边界，产出后续迁移的 `KEEP / RECHECK / DROP` 决策表。

**Architecture:** 本计划是迁移 gate，不写 Rust 实现。执行者只读取 design、旧计划和当前源码，确认哪些决策可以复用、哪些旧实现路线必须丢弃、哪些 current-source hook 可用于后续最小 adapter；如果需要重构 `rust-v0.136.0` app-server/runtime/projection 代码，必须停止。

**Tech Stack:** Markdown planning, git history inspection, ripgrep, Rust source audit.

---

## Scope

本文替代旧的 `01-gui-host-crate.md`。旧版“直接从旧分支恢复 `codex-rs/gui-host/**`”不再作为第一步执行。

本计划只做审计和计划边界确认：

- 复核 source-of-truth design。
- 复核当前 `dev` / `rust-v0.136.0` 源码形状。
- 识别旧 plan 中不可执行的部分。
- 给后续 `02+` 计划提供边界。

本计划不做：

- 不创建 `codex-rs/gui-host/**`。
- 不修改 Rust 源码。
- 不修改 Cargo / Bazel / lockfile。
- 不写 bridge 实现。
- 不写 TUI `/gui`。
- 不写 frontend 代码。

## Source Inputs

必须读取：

- `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`
- `docs/superpowers/specs/2026-05-02-codex-gui-projection-design.md`
- `docs/superpowers/specs/2026-05-08-codex-gui-server-projection-redesign.md`
- `docs/superpowers/specs/2026-05-10-codex-gui-host-design.md`

必须核对当前源码：

- `codex-rs/app-server/src/in_process.rs`
- `codex-rs/app-server/src/message_processor.rs`
- `codex-rs/app-server/src/outgoing_message.rs`
- `codex-rs/app-server/src/thread_state.rs`
- `codex-rs/app-server/src/projection_fanout.rs`
- `codex-rs/app-server/src/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection_runtime.rs`
- `codex-rs/app-server/src/request_processors/thread_lifecycle.rs`
- `codex-rs/app-server-client/src/lib.rs`
- `codex-rs/tui/src/app.rs`
- `codex-rs/tui/src/app_server_session.rs`
- `codex-gui/src/App.tsx`
- `codex-gui/src/features/guiHost/guiHostClient.ts`

## Output

执行本计划后，只允许产出一个文档改动：

- Modify: `docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md`

执行者在本文底部追加一个完整的 `Audit Results` 区块，记录最终审计结果。不要新增 `02` plan，不要恢复旧 `02-in-process-extra-connection.md`。

## Hard Constraints

- 绝对不要重构 `rust-v0.136.0` 引入的 app-server/runtime/projection 代码。
- 不恢复 `open_extra_jsonrpc_connection`。
- 不恢复 `ExtraJsonRpcConnectionFactory`。
- 不把旧 extra-connection commit 序列当作迁移路线。
- 不复制 `remote-control` 的 connection map / outbound router / close cleanup 到 `in_process.rs`。
- 不修改 Rust 源码。
- 不修改 lockfile。
- 不运行测试；这是只读源码审计。
- 不运行 Bazel。

## Task 1: Confirm Document Baseline

**Files:**
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Verify: `docs/superpowers/specs/*.md`
- Verify: `docs/superpowers/plans/2026-05-30-gui-host/02-in-process-extra-connection.md`

- [ ] **Step 1: Confirm source-of-truth documents exist**

Run from repo root:

```bash
for f in \
  docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md \
  docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md \
  docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md \
  docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md \
  docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md \
  docs/superpowers/specs/2026-05-02-codex-gui-projection-design.md \
  docs/superpowers/specs/2026-05-08-codex-gui-server-projection-redesign.md \
  docs/superpowers/specs/2026-05-10-codex-gui-host-design.md; do
  test -s "$f" && echo "ok $f" || echo "missing $f"
done
```

Expected: every line starts with `ok`.

- [ ] **Step 2: Confirm old `02` plan is absent**

Run from repo root:

```bash
test ! -e docs/superpowers/plans/2026-05-30-gui-host/02-in-process-extra-connection.md && echo "old 02 removed"
```

Expected:

```text
old 02 removed
```

- [ ] **Step 3: Confirm current roadmap forbids `rust-v0.136.0` restructuring**

Run from repo root:

```bash
rg -n "绝对不要重构|rust-v0\\.136\\.0|不可执行|bridge 形态" \
  docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md
```

Expected: output includes all four concepts.

## Task 2: Extract Reusable Decisions

**Files:**
- Read: `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- Read: `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`
- Read: `docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md`
- Read: `docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md`

- [ ] **Step 1: List direct design decision lines**

Run from repo root:

```bash
rg -n "不自动打开浏览器|gui/authenticate|Host|Origin|allowlist|TransportEvent|open_extra_jsonrpc_connection|ExtraJsonRpcConnectionFactory|thin hook|in_process\\.rs|rust-v0\\.136\\.0|source of truth" \
  docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md \
  docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md \
  docs/superpowers/specs/2026-05-13-gui-host-low-intrusion-refactor-design.md \
  docs/superpowers/specs/2026-05-13-gui-host-extra-open-hook-thinning-design.md
```

Expected: output identifies lines for `/gui` behavior, local authentication, allowlist, old bridge rejection, and low-intrusion constraints.

- [ ] **Step 2: Fill the `KEEP` table in `Audit Results`**

In `Audit Results`, add rows for decisions that remain valid without changing current `rust-v0.136.0` code:

```markdown
| Decision | Status | Evidence | Notes |
| --- | --- | --- | --- |
| `/gui` only displays local URL; it does not open the browser. | KEEP | `2026-05-11-codex-gui-host-redesign.md` and `2026-05-30-codex-gui-host-dev-adaptation-design.md` both require this. | Applies to later TUI plan. |
| `gui/authenticate` is GUI host local first-frame auth, not app-server v2 API. | KEEP | `2026-05-11-codex-gui-host-redesign.md` defines local handshake. | Applies to gui-host crate and bridge plans. |
| Browser traffic must pass Host / Origin / token / allowlist checks before app-server handling. | KEEP | `2026-05-11-codex-gui-host-redesign.md` security and allowlist sections. | Applies to gui-host crate. |
| `codex-gui-host` must not depend on `codex-app-server`. | KEEP | `2026-05-11-codex-gui-host-redesign.md` crate boundary. | Applies to gui-host crate. |
| TUI does not forward browser JSON-RPC traffic. | KEEP | `2026-05-11-codex-gui-host-redesign.md` architecture section. | Applies to TUI plan. |
```

## Task 3: Identify Decisions Requiring Current Source Recheck

**Files:**
- Read: `codex-rs/app-server/src/in_process.rs`
- Read: `codex-rs/app-server/src/message_processor.rs`
- Read: `codex-rs/app-server/src/projection_fanout.rs`
- Read: `codex-rs/app-server-client/src/lib.rs`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md`

- [ ] **Step 1: Inspect current app-server connection and projection boundaries**

Run from repo root:

```bash
rg -n "InProcessClient|ProcessorCommand|MessageProcessor|route_outgoing|outbound_connections|ConnectionSessionState|thread_projection|projection_fanout|TransportEvent|remote_control" \
  codex-rs/app-server/src/in_process.rs \
  codex-rs/app-server/src/message_processor.rs \
  codex-rs/app-server/src/outgoing_message.rs \
  codex-rs/app-server/src/thread_state.rs \
  codex-rs/app-server/src/projection_fanout.rs \
  codex-rs/app-server/src/thread_projection.rs \
  codex-rs/app-server/src/thread_projection_runtime.rs \
  codex-rs/app-server/src/request_processors/thread_lifecycle.rs
```

Expected: output shows current source anchors for app-server connection handling and projection fanout.

- [ ] **Step 2: Inspect current app-server-client lifecycle boundary**

Run from repo root:

```bash
rg -n "InProcessAppServerClient|InProcessClientHandle|InProcessClientSender|Drop|shutdown|start\\(" \
  codex-rs/app-server-client/src/lib.rs
```

Expected: output shows construction and shutdown/drop points that a later facade plan must respect.

- [ ] **Step 3: Fill the `RECHECK` table in `Audit Results`**

In `Audit Results`, add rows for decisions that require source-specific plan work:

```markdown
| Decision | Status | Evidence | Required Recheck |
| --- | --- | --- | --- |
| Authenticated GUI `/ws` enters app-server through an in-process bridge. | RECHECK | Design requires app-server-side bridge, but current `rust-v0.136.0` runtime shape must lead. | Future bridge decision plan must choose the smallest adapter point. |
| `in_process.rs` keeps only neutral hook code. | RECHECK | Low-intrusion design requires thin hook. | Future plan must inspect exact hook points and prove no runtime rewrite. |
| app-server-client exposes a GUI launch facade. | RECHECK | Design requires facade, but current lifecycle/drop shape decides storage. | Future facade plan must avoid broad `lib.rs` reshape. |
| Projection attach/event payloads match GUI expectations. | RECHECK | Projection designs are older than current `dev`. | Future frontend/source audit must compare current protocol and store code. |
```

## Task 4: Identify Dropped Old Routes

**Files:**
- Read: `docs/superpowers/plans/2026-05-30-gui-host/00-roadmap.md`
- Read: git history for old revert commits
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md`

- [ ] **Step 1: Confirm old failed route names are only design history**

Run from repo root:

```bash
rg -n "open_extra_jsonrpc_connection|ExtraJsonRpcConnectionFactory|extra in-process connection|in_process_extra" \
  docs/superpowers/specs \
  docs/superpowers/plans/2026-05-30-gui-host
```

Expected: output may exist in design/history docs, but there must be no Rust source changes in this task.

- [ ] **Step 2: Fill the `DROP` table in `Audit Results`**

In `Audit Results`, add rows for rejected routes:

```markdown
| Route | Status | Evidence | Replacement |
| --- | --- | --- | --- |
| Restore `open_extra_jsonrpc_connection`. | DROP | `2026-05-11-codex-gui-host-redesign.md` identifies it as duplicate direction; revert history removed it. | Use future bridge boundary decision. |
| Restore `ExtraJsonRpcConnectionFactory`. | DROP | Same duplicate direction as above. | Use future bridge boundary decision. |
| Execute old `02-in-process-extra-connection.md`. | DROP | `00-roadmap.md` marks old `02` as not executable. | Write a new bridge decision plan after this audit. |
| Refactor current `rust-v0.136.0` runtime to fit old GUI branch. | DROP | User constraint and roadmap forbid it. | Add minimal adapter only if source audit proves it is safe. |
```

## Task 5: Audit Current Frontend Boundary

**Files:**
- Read: `codex-gui/src/App.tsx`
- Read: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Read: `codex-gui/src/features/projection/projectionSlice.ts`
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md`

- [ ] **Step 1: Inspect current GUI host transport and store boundary**

Run from repo root:

```bash
rg -n "gui/authenticate|thread/projection/attach|thread/projection/event|projectionAttached|projectionEventReceived|dispatch|Redux|store" \
  codex-gui/src/App.tsx \
  codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/projection/projectionSlice.ts
```

Expected: output shows whether transport remains store-free and where projection dispatch happens.

- [ ] **Step 2: Fill the frontend note in `Audit Results`**

In `Audit Results`, add:

```markdown
### Frontend Boundary

- `guiHostClient.ts`: record whether it imports Redux/store or only transports JSON-RPC.
- `App.tsx`: record whether projection attach/event dispatch remains in React boundary.
- `projectionSlice.ts`: record whether current reducer payloads match the restored projection design closely enough for MVP.
```

## Task 6: Produce Next-Plan Recommendation

**Files:**
- Modify: `docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md`

- [ ] **Step 1: Fill `Next Plan Recommendation`**

At the bottom of `Audit Results`, choose exactly one next step:

```markdown
## Next Plan Recommendation

- Recommended next plan: `02-gui-host-crate.md`
- Reason: Use this only if the audit confirms host shell recovery is independent of app-server runtime and can be done without touching `rust-v0.136.0` app-server/projection code.
- Not allowed yet: app-server bridge implementation.
```

If the audit instead finds the host shell itself depends on unresolved app-server bridge shape, use:

```markdown
## Next Plan Recommendation

- Recommended next plan: `02-bridge-boundary-decision.md`
- Reason: Use this if host shell recovery cannot be safely scoped without first choosing the bridge adapter.
- Not allowed yet: Rust implementation.
```

- [ ] **Step 2: Confirm no source files changed**

Run from repo root:

```bash
git diff --name-only | rg -v '^docs/superpowers/plans/2026-05-30-gui-host/01-gui-host-crate.md$'
```

Expected: no output.

## Execution Output Contract

执行本计划时，在本文末尾追加 `Audit Results`。最终输出必须包含：

- `### KEEP` 表：至少包含 `/gui` URL-only、`gui/authenticate` local auth、Host / Origin / token / allowlist、`codex-gui-host` crate independence、TUI not forwarding JSON-RPC。
- `### RECHECK` 表：至少包含 app-server bridge shape、`in_process.rs` neutral hook、app-server-client facade/drop ordering、projection attach/event payload compatibility。
- `### DROP` 表：至少包含 `open_extra_jsonrpc_connection`、`ExtraJsonRpcConnectionFactory`、old `02-in-process-extra-connection.md`、runtime refactor to fit old branch。
- `### Frontend Boundary` 小节：记录 `guiHostClient.ts`、`App.tsx`、`projectionSlice.ts` 的当前边界。
- `## Next Plan Recommendation` 小节：只能推荐 `02-gui-host-crate.md` 或 `02-bridge-boundary-decision.md` 之一，并说明另一个为什么不能先做。
