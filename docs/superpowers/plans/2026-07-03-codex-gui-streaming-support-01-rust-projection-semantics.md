# Rust Projection Streaming Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 01 Rust projection semantics stage without duplicating existing test coverage.

**Architecture:** Treat the current Rust implementation and existing end-to-end projection test as the behavior lock. Only clarify README wording that projection delta is not final content and does not carry phase; authoritative assistant text and phase come from `item/completed`.

**Tech Stack:** Rust app-server docs, app-server v2 projection protocol, repository-root git checks.

---

## Scope

This plan implements only `01-rust-projection-semantics-design.md`.

Do not modify:

- `codex-rs/app-server/src/thread_projection.rs`
- `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
- `AgentMessageDeltaNotification`
- `ThreadProjectionDeltaNotification`
- app-server protocol schema types
- GUI state or rendering code
- TUI code

Do not add a new Rust test. Existing coverage already includes the projection sequence:

- `codex-rs/app-server/tests/suite/v2/thread_projection.rs:164`
  - `thread_projection_emits_transient_agent_message_delta_without_advancing_head`
  - reads projection `itemStarted`
  - reads projection `thread/projection/delta`
  - reads projection `itemCompleted`
  - asserts `itemCompleted.parentCommitId == itemStarted.commitId`

## Files

- Modify: `codex-rs/app-server/README.md`
  - Clarify that projection delta is transient.
  - Clarify that completed assistant message content plus phase are authoritative.

## Task 1: Clarify Projection README Semantics

**Files:**

- Modify: `codex-rs/app-server/README.md`

- [ ] **Step 1: Update the method summary bullet**

In `codex-rs/app-server/README.md`, update the `thread/projection/delta` bullet to:

```markdown
- `thread/projection/delta` — notification emitted to projection subscribers for transient stream progress that does not advance `headCommitId`. The first supported delta is `{ type: "agentMessage", notification }`, where `notification` has the same shape as `item/agentMessage/delta`. It is not final content and does not carry phase; clients get authoritative assistant text and phase from the later `item/completed` event.
```

- [ ] **Step 2: Update the attach example paragraph**

In the “Example: Attach to a thread projection” section, replace the first paragraph with:

```markdown
Use `thread/projection/attach` to receive a GUI projection stream for a loaded thread. The response includes a `subscriptionId` and a snapshot with the current `thread` and `headCommitId`. Projection subscribers receive two live notification classes. `thread/projection/event` carries structural events with `commitId` and `parentCommitId`; clients use those events to advance `headCommitId`. `thread/projection/delta` carries transient progress for the same `subscriptionId` and does not include commit fields. Clients should ignore stale `subscriptionId` deltas and use the final `item/completed` event as the authoritative assistant message content. For assistant messages, `item/completed` also carries `phase`; clients should not infer final-answer or commentary state from delta.
```

- [ ] **Step 3: Check whitespace**

Run from the repository root:

```bash
git diff --check -- codex-rs/app-server/README.md
```

Expected: exits 0.

- [ ] **Step 4: Commit Task 1**

```bash
git add codex-rs/app-server/README.md
git diff --cached -- codex-rs/app-server/README.md
git commit -m "docs(app-server): clarify projection delta authority"
```

Expected: one local commit containing only `codex-rs/app-server/README.md`.

## Final Verification

- [ ] **Step 1: Confirm no Rust code or test changed**

```bash
git diff --stat -- codex-rs/app-server/src/thread_projection.rs codex-rs/app-server/tests/suite/v2/thread_projection.rs codex-rs/app-server-protocol
```

Expected: no output.

- [ ] **Step 2: Confirm working tree**

```bash
git status --short
```

Expected: no output, unless the accepted design and plan documents are intentionally left uncommitted for a separate docs commit.

- [ ] **Step 3: Report exact verification**

Report:

- Existing test coverage used instead of adding a duplicate test:
  `codex-rs/app-server/tests/suite/v2/thread_projection.rs:164`
- `git diff --check -- codex-rs/app-server/README.md` result from Task 1.
- Commit hash created for Task 1.
