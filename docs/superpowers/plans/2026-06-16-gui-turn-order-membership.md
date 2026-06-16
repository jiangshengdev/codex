# GUI Turn Order Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant `turnOrder.includes(...)` scans from `incrementalChatStateSlice` so snapshot rebuild is linear in the number of turns.

**Architecture:** `turnsById` is the canonical membership fact for turns. `turnOrder` remains only the render/order list, and insertion into `turnOrder` happens only after `turnsById[id]` has proven the turn is new.

**Tech Stack:** TypeScript, Redux Toolkit slice reducers, Vitest, codex-gui test harness.

---

### File Structure

- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
  - Remove the redundant `turnOrder.includes(...)` checks in `ensureTurnExists` and `upsertTurnFromPayload`.
  - Keep `turnsById` as the single source of truth for turn membership.
- Modify: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`
  - Add one focused regression test proving attach snapshot rebuild no longer performs array membership scans for turn ids.
  - Keep behavior assertions on the resulting prepared turn read model.

### Task 1: Prove snapshot rebuild does not scan `turnOrder`

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

- [ ] **Step 1: Import `vi` for the focused regression spy**

Change the first import from:

```ts
import { describe, expect, it } from "vitest";
```

to:

```ts
import { describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: Add the failing regression test**

Add this test after `it("rebuilds a baseline from an accepted attach snapshot", ...)` and before `it("applies live notifications incrementally and ignores itemStarted for chat messages", ...)`:

```ts
  it("rebuilds snapshot turn order without array membership scans", () => {
    const attachWithMultipleTurns = attachWithTurns([
      baseTurn("turn-order-1"),
      baseTurn("turn-order-2"),
      baseTurn("turn-order-3"),
    ]);
    const includesSpy = vi.spyOn(Array.prototype, "includes");
    const store = makeStore();

    try {
      store.dispatch(threadRuntimeAttached(attachWithMultipleTurns));
    } finally {
      includesSpy.mockRestore();
    }

    expect(
      includesSpy.mock.calls.filter(([searchElement]) =>
        ["turn-order-1", "turn-order-2", "turn-order-3"].includes(String(searchElement)),
      ),
    ).toStrictEqual([]);
    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-order-1",
        status: "completed",
        messages: [],
      },
      {
        id: "turn-order-2",
        status: "completed",
        messages: [],
      },
      {
        id: "turn-order-3",
        status: "completed",
        messages: [],
      },
    ] satisfies IncrementalChatTurnView[]);
  });
```

This test should fail against the current implementation because `upsertTurnFromPayload` calls `state.turnOrder.includes(turn.id)` once per new snapshot turn.

- [ ] **Step 3: Run the focused test and confirm the expected failure**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts --testNamePattern "rebuilds snapshot turn order without array membership scans"
```

Expected: FAIL. The filtered spy calls should contain the snapshot turn ids before the implementation change.

### Task 2: Remove the redundant membership scans

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- Test: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

- [ ] **Step 1: Simplify `ensureTurnExists`**

Change:

```ts
  state.turnsById[turnId] = turn;
  if (!state.turnOrder.includes(turnId)) {
    state.turnOrder.push(turnId);
  }
  syncTurnView(state, turn);
```

to:

```ts
  state.turnsById[turnId] = turn;
  state.turnOrder.push(turnId);
  syncTurnView(state, turn);
```

Reason: this branch only runs after `state.turnsById[turnId]` returned `null` / `undefined`, so the turn is already known to be new.

- [ ] **Step 2: Simplify `upsertTurnFromPayload`**

Change:

```ts
    state.turnsById[turn.id] = nextTurn;
    if (!state.turnOrder.includes(turn.id)) {
      state.turnOrder.push(turn.id);
    }
    syncTurnView(state, nextTurn);
```

to:

```ts
    state.turnsById[turn.id] = nextTurn;
    state.turnOrder.push(turn.id);
    syncTurnView(state, nextTurn);
```

Reason: this branch only runs after `state.turnsById[turn.id]` returned `null` / `undefined`, so `turnOrder` does not need to defend against duplicates independently.

- [ ] **Step 3: Run the focused regression test**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts --testNamePattern "rebuilds snapshot turn order without array membership scans"
```

Expected: PASS.

- [ ] **Step 4: Run the full focused slice test file**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run codex-gui formatting/checks for this TypeScript change**

Run:

```bash
pnpm --dir codex-gui run ci
```

Expected: PASS. This is the established focused verification command for `codex-gui` changes in this workstream.

- [ ] **Step 6: Commit if requested**

Only commit if the user explicitly asks for a commit.

```bash
git add codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts docs/superpowers/plans/2026-06-16-gui-turn-order-membership.md
git commit -m "fix(codex-gui): remove turn order membership scans"
```
