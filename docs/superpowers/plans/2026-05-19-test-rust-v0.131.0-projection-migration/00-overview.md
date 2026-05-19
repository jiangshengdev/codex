# test rust-v0.131.0 Projection Migration Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coordinate the `test` branch migration to official `rust-v0.131.0` while preserving the local thread projection overlay.

**Architecture:** The work is split into three execution plans: official tag merge baseline, projection protocol/app-server runtime, and TUI/schema/final verification. Official upstream code stays authoritative; projection remains an isolated overlay with thin hooks at stable choke points.

**Tech Stack:** Rust, Cargo, app-server v2 protocol, JSON schema / TypeScript generation, TUI server notification handling, Git.

---

## Source Of Truth

- Design: `docs/superpowers/specs/2026-05-19-test-rust-v0.131.0-projection-migration-design.md`
- Analysis: `docs/superpowers/specs/2026-05-19-projection-on-rust-v0.131.0-analysis-temp.md`
- Draft decisions: `docs/superpowers/specs/2026-05-19-test-tag-merge-projection-migration-draft.md`

## Plan Set

- `01-official-tag-merge-baseline.md`: merge official `rust-v0.131.0` into `dev` and resolve baseline conflicts without projection semantic work.
- `02-projection-protocol-app-server-runtime.md`: restore projection protocol, app-server runtime, snapshot, attach, fanout, lifecycle, and focused tests.
- `03-tui-schema-docs-final-verification.md`: handle TUI no-op, schema / TypeScript generation, README docs, and final narrow verification.

## Global Constraints

- Work on `dev`.
- Keep official `rust-v0.131.0` functionality intact.
- Do not merge `test` into `main`.
- Do not use whole-file overwrite to undo upstream 0.131 structure.
- Do not collapse projection into ordinary `thread/read`, `thread/turns/list`, or ordinary notification subscriptions.
- Keep projection lifecycle independent from ordinary thread subscriptions.
- Do not run full Rust workspace tests or crate-wide large tests without explicit user authorization.
- Do not edit generated schema / TypeScript as the final source of truth; regenerate after handwritten Rust stabilizes.

## Commit Boundaries

The execution plan should produce separate commits for:

- official tag merge baseline,
- projection protocol source,
- projection app-server runtime,
- TUI handling,
- generated schema / TypeScript,
- README / docs if changed separately,
- focused verification fixes.

Do not combine official merge, projection runtime changes, generated files, and verification fixes in one commit.

## Global Success Criteria

- `dev` contains official `rust-v0.131.0` plus projection overlay.
- Projection API still exposes `thread/projection/attach`, `thread/projection/detach`, and `thread/projection/event`.
- Projection commit chain remains per-thread and preserves attach-to-first-event parent linkage.
- Projection detach is not a drain barrier; client in-flight event contract is documented.
- Projection subscribers participate in unload decisions.
- TUI accepts `ThreadProjectionEvent` but does not consume projection data.
- Generated schema / TypeScript contains both official 0.131 APIs and projection APIs.

## Execution Order

- [ ] **Step 1: Complete Plan 01**

Run through `01-official-tag-merge-baseline.md` and stop after the baseline merge commit.

- [ ] **Step 2: Complete Plan 02**

Run through `02-projection-protocol-app-server-runtime.md` and stop after projection core source and focused tests are stable.

- [ ] **Step 3: Complete Plan 03**

Run through `03-tui-schema-docs-final-verification.md` and stop after generated files, docs, and final verification are complete.

- [ ] **Step 4: Confirm branch state**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected:

- `dev` is ahead by the planned commits.
- Working tree is clean unless the user explicitly requested no commit for a final change.
