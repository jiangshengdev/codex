# ItemStarted Live Slot Design Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `02-a` itemStarted live slot design and planning stage as a docs-only checkpoint.

**Architecture:** This plan does not implement GUI runtime state. `02-a` only records the accepted `itemStarted` slot semantics: `turnId + itemId` keying, full initial item preservation, and immediate renderable slot creation. Code implementation waits for the later `02-b` through `02-e` detailed designs because those decide delta ingress, state ownership, settlement, and reconnect behavior.

**Tech Stack:** Markdown design docs, repository-root git checks.

---

## Scope

This plan implements only the documentation closure for:

- `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md`
- `docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md`

Do not modify:

- `codex-gui/src/**`
- `codex-rs/**`
- `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/00-overall-design.md`
- `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/01-rust-projection-semantics-design.md`
- `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-gui-live-item-data-design.md`

Do not create an implementation plan for runtime code in this task. The code implementation plan belongs after the relevant `02-b` through `02-e` designs are accepted.

## Files

- Commit:
  - `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md`
  - `docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md`

## Task 1: Commit 02-a Design and Plan Documents

**Files:**

- Commit: `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md`
- Commit: `docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md`

- [ ] **Step 1: Confirm the working tree scope**

Run from the repository root:

```bash
git status --short
```

Expected: `02-a-item-started-slot-design.md` and `2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md` are untracked. If other unrelated files are dirty, do not stage them.

- [ ] **Step 2: Check the design doc for unresolved placeholders**

Run from the repository root:

```bash
rg -n -e 'TO''DO|TB''D|待''定' docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md
rg -n -e 'TO''DO|TB''D|待''定|imp''lement later|fill in det''ails|Write tests for the ab''ove|Similar to Tas''k' docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md
```

Expected: no output and exit code 1.

- [ ] **Step 3: Check Markdown whitespace**

Run from the repository root:

```bash
git diff --check -- docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md
git diff --check -- docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md
```

Expected: exits 0 with no output.

- [ ] **Step 4: Stage only the 02-a design and plan docs**

Run from the repository root:

```bash
git add docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md
git add docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md
git diff --cached --name-only
```

Expected output:

```text
docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md
docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md
```

- [ ] **Step 5: Inspect staged diff**

Run from the repository root:

```bash
git diff --cached -- docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md
git diff --cached -- docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md
```

Expected: staged diff creates only the 02-a design and plan docs and contains no code changes.

- [ ] **Step 6: Commit the design doc**

Run from the repository root:

```bash
git commit -m "docs(gui): plan itemStarted live slots"
```

Expected: one local commit containing only the 02-a design and plan docs.

## Final Verification

- [ ] **Step 1: Confirm latest commit contents**

Run from the repository root:

```bash
git show --name-only --format='%H%n%s' HEAD
```

Expected: commit subject is `docs(gui): plan itemStarted live slots`, and the only changed files are:

```text
docs/superpowers/plans/2026-07-03-codex-gui-streaming-support-02-a-item-started-slot.md
docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-a-item-started-slot-design.md
```

- [ ] **Step 2: Confirm working tree**

Run from the repository root:

```bash
git status --short
```

Expected: no output, unless a separate plan document is intentionally left uncommitted.

- [ ] **Step 3: Report exact verification**

Report:

- Placeholder scan results for the 02-a design and plan docs.
- `git diff --check` results for the 02-a design and plan docs.
- Commit hash created for Task 1.
