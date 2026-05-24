# TUI Schema Docs And Final Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish projection migration by adapting TUI notification handling, regenerating schema / TypeScript, updating docs, and running final narrow verification.

**Architecture:** TUI treats projection events as permanent no-op / global-none, generated files are produced after handwritten Rust stabilizes, and docs record the wire contract including per-thread commit chain and detach in-flight semantics.

**Tech Stack:** Rust TUI, app-server protocol schema generator, TypeScript schema fixtures, Markdown docs, Git.

---

## Files

- Modify: actual TUI exhaustive-match owner files located in Task 1 Step 1.
- Modify: `codex-rs/app-server-protocol/schema/json/*` through generator only.
- Modify: `codex-rs/app-server-protocol/schema/typescript/*` through generator only.
- Modify: `codex-rs/app-server/README.md`
- Modify: `docs/superpowers/specs/2026-05-19-test-rust-v0.131.0-projection-migration-design.md` only if implementation reveals a design mismatch.

## Task 1: Adapt TUI Notification Handling

- [ ] **Step 1: Locate exhaustive matches**

Run:

```bash
rg -n "ServerNotification::|ServerNotification" codex-rs/tui/src
```

Expected:

- Identify all exhaustive or target-routing matches that require a `ThreadProjectionEvent` arm.

- [ ] **Step 2: Add no-op / global-none handling**

For every required TUI match:

- add `ServerNotification::ThreadProjectionEvent(_)`,
- route it to no-op or no target,
- do not mutate TUI thread state,
- do not render projection content,
- do not convert projection event into ordinary turn/item UI state.

Expected likely files:

```text
codex-rs/tui/src/app/app_server_event_targets.rs
codex-rs/tui/src/chatwidget/protocol.rs
codex-rs/tui/src/chatwidget.rs
```

Use the actual 0.131 owner files after locating matches.

- [ ] **Step 3: Run minimal TUI compile/check if needed**

If TUI exhaustiveness fails or TUI files changed, run the narrowest available TUI compile/check. Prefer a targeted check over full `cargo test -p codex-tui`.

If only a crate-wide TUI test can prove the change, stop and ask for authorization before running it.

- [ ] **Step 4: Commit TUI no-op**

Run:

```bash
git add codex-rs/tui/src
git commit -m "fix(tui): ignore thread projection notifications"
```

Expected: commit contains only TUI no-op handling.

## Task 2: Update App-Server README Contract

- [ ] **Step 1: Update projection API docs**

In `codex-rs/app-server/README.md`, document:

- `thread/projection/attach`,
- `thread/projection/detach`,
- `thread/projection/event`,
- `subscriptionId`,
- `snapshot.headCommitId`,
- `commitId` / `parentCommitId`,
- per-thread commit chain,
- first event parent equals attach snapshot head,
- detach is not a drain barrier,
- repeated attach implicitly releases the old `subscriptionId`,
- connection drop requires re-attach,
- ordinary and projection streams are independent.

- [ ] **Step 2: Keep docs scoped**

Check the README diff:

```bash
git diff -- codex-rs/app-server/README.md
```

Expected:

- Projection docs are added or updated in the 0.131 README structure.
- Official 0.131 README sections are not removed or rewritten.

- [ ] **Step 3: Commit README docs**

Run:

```bash
git add codex-rs/app-server/README.md
git commit -m "docs(app-server): document thread projection contract"
```

Expected: commit contains README changes only.

## Task 3: Regenerate Schema And TypeScript

- [ ] **Step 1: Run schema generator**

Run from `codex-rs`:

```bash
just write-app-server-schema
```

Expected:

- JSON schema and TypeScript files update from generator output.
- No manual edits are made to generated files after this command.

- [ ] **Step 2: Inspect generated diff**

Run:

```bash
git diff -- codex-rs/app-server-protocol/schema
```

Expected:

- Official 0.131 API types remain present.
- Projection attach/detach/event types are present.
- `ThreadProjectionEventNotification` includes `threadId`, `subscriptionId`, `commitId`, `parentCommitId`, and `event`.

- [ ] **Step 3: Commit generated files**

Run:

```bash
git add codex-rs/app-server-protocol/schema
git commit -m "chore(app-server-protocol): regenerate projection schema"
```

Expected: commit contains generated schema / TypeScript files only.

## Task 4: Final Narrow Verification

- [ ] **Step 1: Run protocol focused verification**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server-protocol thread_projection
```

Expected: protocol projection tests pass.

- [ ] **Step 2: Run app-server projection focused verification**

Run from `codex-rs`:

```bash
cargo test -p codex-app-server thread_projection --no-fail-fast
```

Expected: app-server projection tests pass.

- [ ] **Step 3: Check formatting**

Run from `codex-rs`:

```bash
just fmt
```

Expected: formatting completes.

- [ ] **Step 4: Check generated schema drift**

Run:

```bash
git diff --exit-code -- codex-rs/app-server-protocol/schema
```

Expected: no output. If output appears and only includes formatting changes inside `codex-rs/app-server-protocol/schema`, verify whether the formatter touched generated files and then re-run the generator so committed schema remains canonical.

- [ ] **Step 5: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

## Task 5: Final Branch Review

- [ ] **Step 1: Inspect commit boundaries**

Run:

```bash
git log --oneline --decorate -12
```

Expected:

- Official merge, protocol, app-server runtime, TUI, schema, and docs are separate commits.

- [ ] **Step 2: Inspect working tree**

Run:

```bash
git status --short --branch
```

Expected:

- Working tree is clean.
- `dev` is ahead of its upstream by the expected migration commits.

- [ ] **Step 3: Decide whether broader verification is needed**

If any focused test cannot cover a cross-cutting hook's official-path regression risk, stop and ask the user whether to authorize the specific broader verification command.

Do not run full workspace tests or broad crate-wide tests without explicit authorization.
