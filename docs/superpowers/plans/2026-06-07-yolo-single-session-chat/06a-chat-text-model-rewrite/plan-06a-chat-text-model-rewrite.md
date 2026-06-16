# Chat Text Model Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `06a Chat Text Model` so the active chat text model consumes `05b` prepared chat facts instead of `TimelineMaterial` / `selectThreadTimelineMaterials`.

**Architecture:** Keep `05 Live Event Handling` as replay/debug material only. `06a` reads `selectIncrementalChatTurns(state)` and `selectIncrementalChatGlobalStatus(state)`, then projects those prepared chat facts into a turn-grouped pure text model. It must not import `TimelineMaterial`, call `selectThreadTimelineMaterials`, or read `snapshotTurns` / `eventBuffer`.

**Tech Stack:** TypeScript, Redux Toolkit selectors, Vitest, pnpm.

---

## Scope

This plan rewrites only `06a Chat Text Model`.

It modifies:

- `codex-gui/src/features/chatTextModel/chatTextModel.ts`
- `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`

It does not modify:

- `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- `codex-gui/src/features/snapshotReplay`
- `codex-gui/src/features/threadRuntime`
- `codex-gui/src/app/store.ts`
- `codex-gui/src/App.tsx`
- React rendering, composer behavior, Markdown rendering, streaming delta handling, reconnect UI, or tool activity UI.

The old plan at `docs/superpowers/plans/2026-06-07-yolo-single-session-chat/06a-chat-text-model/plan-06a-chat-text-model.md` is obsolete and must not be used for implementation.

## File Structure

- Modify: `codex-gui/src/features/chatTextModel/chatTextModel.ts`
  - Owns `ChatTextModel` output types.
  - Adds a `ChatTextModelInput` type based on `IncrementalChatTurnView[]` and `IncrementalChatGlobalStatus[]`.
  - Rewrites `buildChatTextModel(input)` to copy prepared messages from `05b` selector output.
  - Rewrites `selectChatTextModel(state)` to call `selectIncrementalChatTurns` and `selectIncrementalChatGlobalStatus`.
  - Removes `TimelineMaterial`, `LiveSubscriptionMaterial`, `ThreadItem`, `UserInput`, and `selectThreadTimelineMaterials` imports.
- Modify: `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`
  - Replaces timeline-material unit tests with prepared-chat-facts unit tests.
  - Keeps selector integration coverage through the real Redux store and `threadRuntime*` event actions.
  - Adds coverage that `06a` preserves `05b` turn/message order and emits global reconnect status.

## Implementation Decisions

- `buildChatTextModel` input is:

```ts
export type ChatTextModelInput = {
  turns: IncrementalChatTurnView[];
  globalStatus: IncrementalChatGlobalStatus[];
};
```

- `ChatTextTurn.entries` remains the public output for `06b`.
- Empty turn groups remain in the model if `05b` exposes a turn with no messages. Hiding empty turns is a `06b` rendering decision.
- Empty message text should be filtered defensively in `06a`, even though `05b` normally does not generate empty messages.
- `ChatTextGlobalStatus.id` should reuse `IncrementalChatGlobalStatus.id`.
- `ChatTextGlobalStatus.text` remains `"Connection interrupted. Reconnect required."`.
- `06a` does not parse `ThreadItem` or `UserInput`; those mappings belong to `05b`.

---

### Task 1: Replace Chat Text Model Tests With Prepared Facts Tests

**Files:**
- Modify: `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`

- [ ] **Step 1: Replace the test imports**

Replace the imports at the top of `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  buildChatTextModel,
  selectChatTextModel,
  type ChatTextModel,
} from "@/features/chatTextModel/chatTextModel";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";
```

This removes the `TimelineMaterial` import from the test.

- [ ] **Step 2: Keep only protocol fixture helpers needed for selector integration**

Replace the helper declarations above `describe("chat text model", ...)` with:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;

const baseTurn = (id: string): Turn => ({
  id,
  items: [],
  itemsView: "full",
  status: "completed",
  error: null,
  startedAt: 1700000001,
  completedAt: 1700000005,
  durationMs: 4000,
});

const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

const userMessage = (id: string, content: UserInput[]): ThreadItem => ({
  type: "userMessage",
  id,
  clientId: null,
  content,
});

const agentMessage = (id: string, text: string): ThreadItem => ({
  type: "agentMessage",
  id,
  text,
  phase: "final_answer",
  memoryCitation: null,
});
```

Do not keep helpers for `TimelineMaterial`, `imageInput`, or `planItem`; `06a` no longer parses raw items.

- [ ] **Step 3: Replace the unit tests**

Replace all tests before the selector integration test with these prepared-facts tests:

```ts
describe("chat text model", () => {
  it("returns an empty model for empty prepared chat facts", () => {
    expect(buildChatTextModel({ turns: [], globalStatus: [] })).toStrictEqual({
      turns: [],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("copies prepared user and assistant messages by turn", () => {
    expect(
      buildChatTextModel({
        turns: [
          {
            id: "turn-1",
            status: "completed",
            messages: [
              { id: "user-1", turnId: "turn-1", role: "user", text: "Hello" },
              { id: "agent-1", turnId: "turn-1", role: "assistant", text: "**Plain** text" },
            ],
          },
        ],
        globalStatus: [],
      }),
    ).toStrictEqual({
      turns: [
        {
          id: "turn-1",
          entries: [
            { type: "message", id: "user-1", role: "user", text: "Hello" },
            { type: "message", id: "agent-1", role: "assistant", text: "**Plain** text" },
          ],
        },
      ],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("preserves prepared turn and message order", () => {
    expect(
      buildChatTextModel({
        turns: [
          {
            id: "turn-2",
            status: "completed",
            messages: [
              { id: "user-2", turnId: "turn-2", role: "user", text: "Second turn" },
            ],
          },
          {
            id: "turn-1",
            status: "completed",
            messages: [
              { id: "user-1", turnId: "turn-1", role: "user", text: "First message" },
              { id: "agent-1", turnId: "turn-1", role: "assistant", text: "Second message" },
            ],
          },
        ],
        globalStatus: [],
      }),
    ).toStrictEqual({
      turns: [
        {
          id: "turn-2",
          entries: [{ type: "message", id: "user-2", role: "user", text: "Second turn" }],
        },
        {
          id: "turn-1",
          entries: [
            { type: "message", id: "user-1", role: "user", text: "First message" },
            { type: "message", id: "agent-1", role: "assistant", text: "Second message" },
          ],
        },
      ],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("keeps empty prepared turn groups", () => {
    expect(
      buildChatTextModel({
        turns: [{ id: "turn-empty", status: "inProgress", messages: [] }],
        globalStatus: [],
      }),
    ).toStrictEqual({
      turns: [{ id: "turn-empty", entries: [] }],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("filters empty prepared message text defensively", () => {
    expect(
      buildChatTextModel({
        turns: [
          {
            id: "turn-filtered",
            status: "completed",
            messages: [
              { id: "empty-user", turnId: "turn-filtered", role: "user", text: "" },
              { id: "empty-agent", turnId: "turn-filtered", role: "assistant", text: "" },
            ],
          },
        ],
        globalStatus: [],
      }),
    ).toStrictEqual({
      turns: [{ id: "turn-filtered", entries: [] }],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("derives subscription interruption as turn-external global status", () => {
    expect(
      buildChatTextModel({
        turns: [],
        globalStatus: [
          {
            id: "subscriptionInterrupted:thread-1:subscription-1:backpressure",
            status: "subscriptionInterrupted",
            reason: "backpressure",
            subscriptionId: "subscription-1",
          },
        ],
      }),
    ).toStrictEqual({
      turns: [],
      globalStatus: [
        {
          type: "status",
          id: "subscriptionInterrupted:thread-1:subscription-1:backpressure",
          status: "subscriptionInterrupted",
          text: "Connection interrupted. Reconnect required.",
        },
      ],
    } satisfies ChatTextModel);
  });
```

- [ ] **Step 4: Replace the selector integration test**

Keep the `describe` block open and replace the old selector integration test with:

```ts
  it("selects chat text model from incremental chat state selectors", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }

    const attachWithChatTurn: ThreadProjectionAttachResponse = {
      ...attachBaseline,
      snapshot: {
        ...attachBaseline.snapshot,
        thread: {
          ...attachBaseline.snapshot.thread,
          turns: [
            {
              ...baseTurn("selector-turn"),
              items: [
                userMessage("selector-user", [textInput("Selector user")]),
                agentMessage("selector-agent", "Selector assistant"),
              ],
            },
          ],
        },
      },
    };

    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachWithChatTurn));
    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChatTurn.snapshot.thread.id,
        subscriptionId: attachWithChatTurn.subscriptionId,
      }),
    );

    expect(selectChatTextModel(store.getState())).toStrictEqual({
      turns: [
        {
          id: "selector-turn",
          entries: [
            { type: "message", id: "selector-user", role: "user", text: "Selector user" },
            {
              type: "message",
              id: "selector-agent",
              role: "assistant",
              text: "Selector assistant",
            },
          ],
        },
        { id: eventTurnStarted.event.notification.turn.id, entries: [] },
      ],
      globalStatus: [
        {
          type: "status",
          id: `subscriptionInterrupted:${attachWithChatTurn.snapshot.thread.id}:${attachWithChatTurn.subscriptionId}:backpressure`,
          status: "subscriptionInterrupted",
          text: "Connection interrupted. Reconnect required.",
        },
      ],
    } satisfies ChatTextModel);
  });
});
```

- [ ] **Step 5: Run the focused test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

Expected result: FAIL. The current `buildChatTextModel` still expects `TimelineMaterial[]`, and `selectChatTextModel` still calls `selectThreadTimelineMaterials(state)`.

---

### Task 2: Rewrite `chatTextModel` To Consume `05b` Selectors

**Files:**
- Modify: `codex-gui/src/features/chatTextModel/chatTextModel.ts`

- [ ] **Step 1: Replace imports**

Replace the imports in `codex-gui/src/features/chatTextModel/chatTextModel.ts` with:

```ts
import type { RootState } from "@/app/store";
import {
  selectIncrementalChatGlobalStatus,
  selectIncrementalChatTurns,
  type IncrementalChatGlobalStatus,
  type IncrementalChatTurnView,
} from "@/features/incrementalChatState/incrementalChatStateSlice";
```

This removes all `liveEventHandling`, `ThreadItem`, and `UserInput` imports.

- [ ] **Step 2: Add the input type**

Add this type after `ChatTextGlobalStatus`:

```ts
export type ChatTextModelInput = {
  turns: IncrementalChatTurnView[];
  globalStatus: IncrementalChatGlobalStatus[];
};
```

- [ ] **Step 3: Replace `buildChatTextModel`**

Replace the existing `buildChatTextModel` implementation with:

```ts
export const buildChatTextModel = (input: ChatTextModelInput): ChatTextModel => ({
  turns: input.turns.map((turn) => ({
    id: turn.id,
    entries: turn.messages.flatMap((message) => {
      if (message.text.length === 0) {
        return [];
      }

      return [
        {
          type: "message",
          id: message.id,
          role: message.role,
          text: message.text,
        } satisfies ChatTextMessageEntry,
      ];
    }),
  })),
  globalStatus: input.globalStatus.map(statusEntryFromIncrementalStatus),
});
```

- [ ] **Step 4: Replace `selectChatTextModel`**

Replace `selectChatTextModel` with:

```ts
export const selectChatTextModel = (state: RootState): ChatTextModel =>
  buildChatTextModel({
    turns: selectIncrementalChatTurns(state),
    globalStatus: selectIncrementalChatGlobalStatus(state),
  });
```

- [ ] **Step 5: Replace the status helper**

Replace `statusEntryFromSubscriptionInterrupted` with:

```ts
const statusEntryFromIncrementalStatus = (
  status: IncrementalChatGlobalStatus,
): ChatTextGlobalStatus => ({
  type: "status",
  id: status.id,
  status: "subscriptionInterrupted",
  text: SUBSCRIPTION_INTERRUPTED_TEXT,
});
```

- [ ] **Step 6: Delete raw item parsing helpers**

Delete these functions completely from `chatTextModel.ts`:

```ts
const messageEntryFromThreadItem = (item: ThreadItem): ChatTextMessageEntry | null => {
  // delete entire function
};

const textFromUserInput = (input: UserInput): string => {
  // delete entire function
};
```

`06a` must not parse `ThreadItem` or `UserInput`.

- [ ] **Step 7: Run the focused test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

Expected result: PASS.

---

### Task 3: Guard Against Timeline Material Regressions

**Files:**
- No source edits expected if Task 2 was done correctly.

- [ ] **Step 1: Search `chatTextModel` for forbidden imports and selectors**

Run:

```bash
rg -n "TimelineMaterial|selectThreadTimelineMaterials|liveEventHandling|ThreadItem|UserInput|snapshotTurns|eventBuffer" codex-gui/src/features/chatTextModel
```

Expected result: no matches.

- [ ] **Step 2: Search app-facing chat path for old `selectChatTextModel` dependencies**

Run:

```bash
rg -n "selectChatTextModel|buildChatTextModel" codex-gui/src
```

Expected result:

```text
codex-gui/src/features/chatTextModel/chatTextModel.ts
codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

If additional matches exist, inspect them and verify they still consume only the public `ChatTextModel` output. Do not widen this plan into React integration work.

- [ ] **Step 3: Run adjacent focused tests**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

Expected result: PASS for both focused test files.

- [ ] **Step 4: Run type-check**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected result: PASS.

---

### Task 4: Update Plan Status References

**Files:**
- Modify: `docs/superpowers/plans/2026-06-07-yolo-single-session-chat/06a-chat-text-model-rewrite/plan-06a-chat-text-model-rewrite.md`
- Optional if implementation changes require it: `docs/superpowers/specs/2026-06-07-yolo-single-session-chat/06a-chat-text-model/design.md`

- [ ] **Step 1: Confirm the obsolete plan remains visibly obsolete**

Run:

```bash
sed -n '1,12p' docs/superpowers/plans/2026-06-07-yolo-single-session-chat/06a-chat-text-model/plan-06a-chat-text-model.md
```

Expected output includes:

```text
状态：已作废（2026-06-16）。禁止按此计划实施。
```

- [ ] **Step 2: Confirm the new plan path is the active implementation plan**

Run:

```bash
test -f docs/superpowers/plans/2026-06-07-yolo-single-session-chat/06a-chat-text-model-rewrite/plan-06a-chat-text-model-rewrite.md
```

Expected result: command exits successfully with no output.

- [ ] **Step 3: Check docs for contradictory active `06a` instructions**

Run:

```bash
rg -n --glob '!**/06a-chat-text-model-rewrite/**' 'from `selectThreadTimelineMaterials\(state\)`|from selectThreadTimelineMaterials|consumes `TimelineMaterial`|The implementation consumes `selectThreadTimelineMaterials\(state\)`' docs/superpowers/specs/2026-06-07-yolo-single-session-chat docs/superpowers/plans/2026-06-07-yolo-single-session-chat
```

Expected result: matches are allowed only in the obsolete plan:

```text
docs/superpowers/plans/2026-06-07-yolo-single-session-chat/06a-chat-text-model/plan-06a-chat-text-model.md
```

That file is obsolete and has a visible warning at the top. If any active spec or plan still instructs implementation to consume `TimelineMaterial`, update that document before implementation is considered complete.

---

## Final Verification

Run only these focused checks:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
pnpm --dir codex-gui run type-check
rg -n "TimelineMaterial|selectThreadTimelineMaterials|liveEventHandling|ThreadItem|UserInput|snapshotTurns|eventBuffer" codex-gui/src/features/chatTextModel
git diff --check -- codex-gui/src/features/chatTextModel docs/superpowers/plans/2026-06-07-yolo-single-session-chat/06a-chat-text-model-rewrite/plan-06a-chat-text-model-rewrite.md
```

Expected:

- Both Vitest commands pass.
- Type-check passes.
- Forbidden `rg` command returns no matches.
- `git diff --check` prints no output.

Do not run the full test suite.
