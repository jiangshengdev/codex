# Codex GUI Live Agent Delta Accumulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce live `agentMessage` delta hot-path work by coalescing same-item delta notifications inside each `threadRuntimeDeltasAccepted` batch while keeping Streamdown input as a string.

**Architecture:** Keep `GuiHostConnectionBridge`, projection ingress, and `threadRuntimeDeltasAccepted` action shape unchanged. Move the optimization into `transcriptStateSlice`: single-delta actions keep the old per-delta behavior, while batch actions group current-thread `agentMessage` deltas by `turnId/itemId` and apply one visible update per touched live item.

**Tech Stack:** Redux Toolkit reducer code, Codex GUI projection test builders, Vitest unit tests, Vitest Browser Mode, React 19, Streamdown string input, fnm-backed pnpm.

---

## Reference Documents Checked

- Design: `docs/superpowers/specs/2026-07-09-codex-gui-live-agent-delta-accumulation-design.md`
- Issue 08: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`
- Issue 09: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md`
- GUI local rules: `codex-gui/AGENTS.md`
- GUI scripts: `codex-gui/package.json`
- Reducer tests: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Browser integration tests: `codex-gui/src/__tests__/App.browser.test.tsx`
- Projection test builders: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`

Key constraints from references:

- Do not change projection protocol, Rust fanout, GUI host transport, or RAF batch dispatch.
- Do not change Streamdown configuration or `LiveMarkdownText` input type.
- Do not add chunks, rope, semantic parts, or a text buffer outside Redux.
- `threadRuntimeDeltaAccepted` single-delta behavior remains the compatibility baseline.
- `threadRuntimeDeltasAccepted` batch behavior should become one visible update per updated live item.
- GUI commands must use `/opt/homebrew/bin/fnm exec --using-file pnpm ...`; do not install or update dependencies.

## File Structure

- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Update the existing batch delta test so same-item batched deltas produce identical text but only one `revision` bump.
  - Add explicit `liveScrollPulse` assertions for same-item batch coalescing.
  - Add a multi-item batch test to keep item isolation and per-item bump semantics.
  - Add a batch ignore test for wrong-thread and non-`agentMessage` deltas.
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Split item mutation from item lookup so single-delta and batch paths share one append primitive.
  - Add a batch helper that groups current-thread `agentMessage` deltas by `turnId/itemId` in first-seen order.
  - Keep unsupported delta types ignored.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Update the RAF batch browser assertion to expect a single `revision` bump for same-item batched deltas.
  - Add or extend coverage so two projection deltas in the same RAF frame still render as full live text.

No new files are required.

## Verification Commands

Run from `codex-gui/` using the user's fnm-managed runtime:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Do not run `pnpm install`, `pnpm add`, browser installers, or dependency-changing commands.

---

### Task 1: Reducer Tests For Batch Coalescing

**Files:**
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Update the existing same-item batch test**

In `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`, replace the existing test named `applies accepted agent message delta batches in notification order` with this version:

```ts
it("coalesces accepted agent message delta batches per live item in notification order", () => {
  const store = makeStore();
  const initialItem = agentMessage("agent-streaming-batch", "");
  const started = itemStarted(
    eventItemStarted,
    "commit-streaming-batch-started",
    "turn-streaming-batch",
    initialItem,
  );
  const firstDelta = agentMessageDelta(
    eventAgentMessageDelta,
    "turn-streaming-batch",
    "agent-streaming-batch",
    "Hello",
  );
  const secondDelta = agentMessageDelta(
    eventAgentMessageDelta,
    "turn-streaming-batch",
    "agent-streaming-batch",
    " world",
  );

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: started,
      replay: "live",
    }),
  );
  const pulseAfterStarted = selectTranscriptLiveScrollPulse(store.getState());

  store.dispatch(threadRuntimeDeltasAccepted({ notifications: [firstDelta, secondDelta] }));

  expect(
    selectTranscriptLiveItem(store.getState(), "turn-streaming-batch", "agent-streaming-batch"),
  ).toStrictEqual({
    key: "turn-streaming-batch:agent-streaming-batch",
    turnId: "turn-streaming-batch",
    itemId: "agent-streaming-batch",
    status: "streaming",
    initialItem,
    transientText: "Hello world",
    revision: 1,
  });
  expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 1);
});
```

- [ ] **Step 2: Run the reducer test and verify the expected failure**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected before implementation: the updated batch test fails because the current reducer applies both notifications separately and leaves `revision: 2` with two pulse bumps.

- [ ] **Step 3: Add a multi-item batch test**

Add this test after the same-item batch test:

```ts
it("keeps batch delta coalescing isolated per live item", () => {
  const store = makeStore();
  const firstItem = agentMessage("agent-streaming-batch-first", "");
  const secondItem = agentMessage("agent-streaming-batch-second", "");

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-streaming-batch-first-started",
        "turn-streaming-batch-isolated",
        firstItem,
      ),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-streaming-batch-second-started",
        "turn-streaming-batch-isolated",
        secondItem,
      ),
      replay: "live",
    }),
  );
  const pulseAfterStarted = selectTranscriptLiveScrollPulse(store.getState());

  store.dispatch(
    threadRuntimeDeltasAccepted({
      notifications: [
        agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming-batch-isolated",
          "agent-streaming-batch-first",
          "First ",
        ),
        agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming-batch-isolated",
          "agent-streaming-batch-second",
          "Second ",
        ),
        agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming-batch-isolated",
          "agent-streaming-batch-first",
          "message",
        ),
        agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming-batch-isolated",
          "agent-streaming-batch-second",
          "message",
        ),
      ],
    }),
  );

  expect(
    selectTranscriptLiveItem(
      store.getState(),
      "turn-streaming-batch-isolated",
      "agent-streaming-batch-first",
    ),
  ).toStrictEqual({
    key: "turn-streaming-batch-isolated:agent-streaming-batch-first",
    turnId: "turn-streaming-batch-isolated",
    itemId: "agent-streaming-batch-first",
    status: "streaming",
    initialItem: firstItem,
    transientText: "First message",
    revision: 1,
  });
  expect(
    selectTranscriptLiveItem(
      store.getState(),
      "turn-streaming-batch-isolated",
      "agent-streaming-batch-second",
    ),
  ).toStrictEqual({
    key: "turn-streaming-batch-isolated:agent-streaming-batch-second",
    turnId: "turn-streaming-batch-isolated",
    itemId: "agent-streaming-batch-second",
    status: "streaming",
    initialItem: secondItem,
    transientText: "Second message",
    revision: 1,
  });
  expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 2);
});
```

- [ ] **Step 4: Add a wrong-thread and unsupported-delta batch test**

Add imports for reasoning delta fixtures at the top of the file:

```ts
import {
  attachBaseline,
  attachReplacement,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningTextDelta,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Then add this test near the missing live slot test:

```ts
it("ignores wrong-thread and unsupported delta notifications in accepted delta batches", () => {
  const store = makeStore();
  const initialItem = agentMessage("agent-streaming-filtered-batch", "");

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-streaming-filtered-batch-started",
        "turn-streaming-filtered-batch",
        initialItem,
      ),
      replay: "live",
    }),
  );
  const pulseAfterStarted = selectTranscriptLiveScrollPulse(store.getState());

  store.dispatch(
    threadRuntimeDeltasAccepted({
      notifications: [
        {
          ...agentMessageDelta(
            eventAgentMessageDelta,
            "turn-streaming-filtered-batch",
            "agent-streaming-filtered-batch",
            "Wrong thread",
          ),
          threadId: "wrong-thread-id",
        },
        eventReasoningTextDelta,
        agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming-filtered-batch",
          "agent-streaming-filtered-batch",
          "Visible text",
        ),
      ],
    }),
  );

  expect(
    selectTranscriptLiveItem(
      store.getState(),
      "turn-streaming-filtered-batch",
      "agent-streaming-filtered-batch",
    ),
  ).toStrictEqual({
    key: "turn-streaming-filtered-batch:agent-streaming-filtered-batch",
    turnId: "turn-streaming-filtered-batch",
    itemId: "agent-streaming-filtered-batch",
    status: "streaming",
    initialItem,
    transientText: "Visible text",
    revision: 1,
  });
  expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(pulseAfterStarted + 1);
});
```

- [ ] **Step 5: Run the reducer tests and keep the failures focused**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected before implementation: only the new or updated batch coalescing expectations should fail. Existing single-delta tests should still pass.

### Task 2: Batch Coalescing Implementation

**Files:**
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Add shared live item append helper types**

In `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, add these helper types near `liveItemForKey`:

```ts
type AgentMessageDeltaBucket = {
  turnId: string;
  itemId: string;
  delta: string;
};
```

- [ ] **Step 2: Split item mutation from item lookup**

Replace the body around `appendAgentMessageDeltaToLiveItem` with this helper plus the existing lookup wrapper:

```ts
const appendDeltaToLiveItem = (state: TranscriptState, item: TranscriptRenderableLiveItem, delta: string) => {
  item.transientText += delta;
  item.status = "streaming";
  item.revision += 1;
  bumpLiveScrollPulse(state);
};

const appendAgentMessageDeltaToLiveItem = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
  delta: string,
) => {
  const item = liveItemForKey(state, turnId, itemId);
  if (item == null) {
    return;
  }

  appendDeltaToLiveItem(state, item, delta);
};
```

Keep `threadRuntimeDeltaAccepted` wired to `applyAcceptedProjectionDelta`; this preserves the current single-delta behavior.

- [ ] **Step 3: Add the batch reducer helper**

Add this helper after `applyAcceptedProjectionDelta`:

```ts
const applyAcceptedProjectionDeltaBatch = (
  state: TranscriptState,
  notifications: Parameters<typeof threadRuntimeDeltasAccepted>[0]["notifications"],
) => {
  const buckets: AgentMessageDeltaBucket[] = [];
  const bucketByKey: Record<string, AgentMessageDeltaBucket> = {};

  for (const notification of notifications) {
    if (state.threadId !== notification.threadId) {
      continue;
    }

    switch (notification.delta.type) {
      case "agentMessage": {
        const { turnId, itemId, delta } = notification.delta.notification;
        const key = liveItemKey(turnId, itemId);
        let bucket = bucketByKey[key];
        if (bucket == null) {
          bucket = { turnId, itemId, delta: "" };
          bucketByKey[key] = bucket;
          buckets.push(bucket);
        }
        bucket.delta += delta;
        break;
      }
    }
  }

  for (const { turnId, itemId, delta } of buckets) {
    const item = liveItemForKey(state, turnId, itemId);
    if (item != null) {
      appendDeltaToLiveItem(state, item, delta);
    }
  }
};
```

Do not add a `default` branch. The existing code uses exhaustive switch style for known handled delta variants and ignores unsupported variants by having no matching case.

- [ ] **Step 4: Wire the batch action to the new helper**

Replace the existing `threadRuntimeDeltasAccepted` reducer:

```ts
.addCase(threadRuntimeDeltasAccepted, (state, action) => {
  for (const notification of action.payload.notifications) {
    applyAcceptedProjectionDelta(state, notification);
  }
})
```

with:

```ts
.addCase(threadRuntimeDeltasAccepted, (state, action) => {
  applyAcceptedProjectionDeltaBatch(state, action.payload.notifications);
})
```

- [ ] **Step 5: Run reducer tests**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS. The single-delta test should still assert `revision: 2` after two separate `threadRuntimeDeltaAccepted` dispatches; the batch test should assert `revision: 1` after two notifications in one `threadRuntimeDeltasAccepted` dispatch.

### Task 3: App Browser Regression

**Files:**
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Update the RAF batch browser assertion**

In `codex-gui/src/__tests__/App.browser.test.tsx`, find `App batches accepted projection deltas until the next animation frame`. In the final `selectTranscriptLiveItem` assertion, change:

```ts
revision: 2,
```

to:

```ts
revision: 1,
```

Keep the existing `transientText: "Hello world"` assertion.

- [ ] **Step 2: Strengthen the rendered text assertion**

Change the render setup in this test from:

```ts
const { store } = await renderWithProviders(<App />);
```

to:

```ts
const screen = await renderWithProviders(<App />);
const { store } = screen;
```

Then add a visible text assertion after `vi.advanceTimersToNextFrame()` and before the final `selectTranscriptLiveItem` assertion:

```ts
await expect.element(screen.getByText("Hello world")).toBeVisible();
```

Use the existing imports and helpers; do not add a new browser test file.

- [ ] **Step 3: Run the browser test**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/__tests__/App.browser.test.tsx
```

Expected: PASS. Existing sticky-bottom tests at `App.browser.test.tsx` should continue to pass and should not require assertion changes.

### Task 4: Final Verification And Review

**Files:**
- Review: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Review: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Review: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Run targeted reducer test**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted browser test**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run type-check**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS.

- [ ] **Step 4: Run formatter check**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected: PASS. If this fails only because touched files need formatting, run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

Then re-run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

- [ ] **Step 5: Inspect the diff**

Run from the repo root:

```bash
git diff -- codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/__tests__/App.browser.test.tsx
```

Expected:

- No changes to projection protocol, app-server, Rust crates, Streamdown config, or `GuiHostConnectionBridge`.
- `threadRuntimeDeltaAccepted` single-delta path remains present.
- `threadRuntimeDeltasAccepted` batch path uses `applyAcceptedProjectionDeltaBatch`.
- Tests assert `revision: 1` for same-item batched deltas and keep single-delta dispatch behavior unchanged.

- [ ] **Step 6: Commit this implementation task if execution was requested**

Only after the plan is accepted and implementation is explicitly authorized, stage the implementation files and commit:

```bash
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "Optimize live agent delta batch accumulation"
```

Do not stage or commit this plan file as part of the implementation task unless the user explicitly asks for documentation commits.
