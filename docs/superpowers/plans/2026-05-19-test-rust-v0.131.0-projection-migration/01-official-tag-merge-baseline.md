# Official rust-v0.131.0 Tag Merge Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge official `rust-v0.131.0` into `dev` and create a clean baseline before projection semantic restoration.

**Architecture:** Accept official 0.131 structure first, resolve only mechanical conflicts required to finish the merge, and avoid projection runtime redesign in this phase. Generated schema conflicts may be made syntactically mergeable, but final generated output belongs to Plan 03.

**Tech Stack:** Git, Rust source tree, app-server, app-server-protocol generated schema, TUI.

---

## Files

- Modify: `.github/workflows/rust-release.yml` if the merge conflicts there.
- Modify: `codex-rs/app-server-protocol/schema/typescript/ClientRequest.ts` only as temporary merge output; final generated output is Plan 03.
- Modify: `codex-rs/app-server/src/lib.rs` to preserve 0.131 modules and leave room for projection modules.
- Modify: `codex-rs/app-server/src/request_processors.rs` to preserve 0.131 processor structure.
- Modify: `codex-rs/model-provider-info/src/lib.rs` if the merge conflicts there.
- Modify: `codex-rs/tui/src/chatwidget.rs` if the merge conflicts there; do not add projection TUI semantics in this plan.

## Task 1: Preflight Branch And Inputs

- [ ] **Step 1: Confirm branch and pending work**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected:

- Current branch is `dev`.
- Any pending docs-only changes are intentional. If the formal design doc is modified and not committed, stop and ask whether to commit it before merging.

- [ ] **Step 2: Confirm tag exists locally**

Run:

```bash
git rev-parse --verify rust-v0.131.0^{commit}
```

Expected: command prints a commit SHA. If it fails, stop and ask for authorization before any network fetch.

- [ ] **Step 3: Record merge base context**

Run:

```bash
git merge-base --all HEAD rust-v0.131.0
```

Expected: command prints at least one commit SHA. Save the output in terminal notes; do not create a file.

## Task 2: Merge Official Tag

- [ ] **Step 1: Start the merge**

Run:

```bash
git merge --no-ff rust-v0.131.0
```

Expected:

- Either the merge completes, or Git reports conflicts.
- Do not commit automatically if conflicts occur.

- [ ] **Step 2: List conflicts**

Run:

```bash
git status --short
git diff --name-only --diff-filter=U
```

Expected:

- Conflicted files are visible.
- Known likely conflicts include the files listed in this plan's Files section.

## Task 3: Resolve Baseline Conflicts

- [ ] **Step 1: Resolve official source conflicts with upstream priority**

For each conflicted handwritten source file:

- Preserve official 0.131 modules, imports, enum variants, processor registrations, and ownership structure.
- Re-add only minimal projection compile placeholders if necessary to keep the merge structurally coherent.
- Do not implement projection runtime behavior in this plan.

Files to inspect with `git diff -- <path>` before editing:

```bash
git diff -- codex-rs/app-server/src/lib.rs
git diff -- codex-rs/app-server/src/request_processors.rs
git diff -- codex-rs/tui/src/chatwidget.rs
git diff -- codex-rs/model-provider-info/src/lib.rs
```

Expected:

- No official 0.131 module or behavior is removed merely to preserve old projection code.

- [ ] **Step 2: Resolve generated schema conflict as temporary merge output**

If `codex-rs/app-server-protocol/schema/typescript/ClientRequest.ts` conflicts:

- Make it syntactically conflict-free.
- Prefer official 0.131 content for official APIs.
- Preserve projection names only when needed to keep the tree coherent.
- Add no manual polish; Plan 03 regenerates final schema / TypeScript.

Run:

```bash
git diff -- codex-rs/app-server-protocol/schema/typescript/ClientRequest.ts
```

Expected:

- No conflict markers remain.
- It is clear from the diff that this is not the final generated output.

- [ ] **Step 3: Resolve release/version conflicts separately**

If release workflow or version files conflict:

- Preserve official 0.131 release surface unless a `test`-specific setting is clearly required.
- Do not mix release policy decisions with projection runtime changes.

Run:

```bash
git diff -- .github/workflows/rust-release.yml
```

Expected:

- Workflow conflict markers are gone.
- No unrelated projection code is present in workflow changes.

## Task 4: Baseline Sanity Checks

- [ ] **Step 1: Ensure no conflict markers remain**

Run:

```bash
rg -n '<<<<<<<|=======|>>>>>>>' .
```

Expected: no output.

- [ ] **Step 2: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 3: Inspect staged merge diff before commit**

Run:

```bash
git status --short
git diff --stat
```

Expected:

- Only merge-resolution files are changed.
- Projection runtime implementation work is deferred to Plan 02.

## Task 5: Commit Baseline Merge

- [ ] **Step 1: Stage merge-resolution files**

Run:

```bash
git add -u
```

Expected: all resolved tracked merge files are staged. If the merge created new files, stage only those explicit new files after checking `git status --short`; do not stage unrelated untracked files.

- [ ] **Step 2: Commit the merge**

Run:

```bash
git commit
```

Expected:

- Git opens or uses the merge commit message for `rust-v0.131.0`.
- Commit succeeds.

- [ ] **Step 3: Confirm clean baseline**

Run:

```bash
git status --short --branch
git log --oneline -3
```

Expected:

- Working tree is clean.
- Latest commit is the official tag merge baseline.
