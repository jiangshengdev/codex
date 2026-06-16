# Chat Text Model Implementation Plan

> **状态：已作废（2026-06-16）。禁止按此计划实施。**
>
> 作废原因：本计划把 `06a` 设计为从 `selectThreadTimelineMaterials(state)` / `TimelineMaterial` 派生 chat text model；新的架构决策要求 active chat surface 只能消费 chat projection prepared state，不能依赖 `TimelineMaterial`、`eventBuffer` 或 `snapshotTurns`。此文件仅保留历史记录，新 `06a` plan 需要重写。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `chatTextModel` GUI feature module that derives a turn-grouped pure text chat model from `selectThreadTimelineMaterials(state)`.

**Architecture:** Implement `06a` as a pure TypeScript selector module with no Redux state, React rendering, or App wiring. The module consumes `TimelineMaterial`, groups entries by turn id, emits only user/assistant text messages plus turn-external subscription status, and hides replay/live lifecycle details from UI consumers.

**Tech Stack:** TypeScript, Redux Toolkit selectors, Vitest, pnpm.

---

## Scope

This plan implements only `06a Chat Text Model`.

It creates:

- `codex-gui/src/features/chatTextModel/chatTextModel.ts`
- `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`

It does not modify `App.tsx`, React components, CSS/Tailwind, Redux store registration, GUI host connection code, composer behavior, Markdown rendering, streaming delta handling, or tool activity UI.

## File Structure

- Create: `codex-gui/src/features/chatTextModel/chatTextModel.ts`
  - Owns `ChatTextModel` types, pure `buildChatTextModel(materials)` derivation, text extraction helpers, and `selectChatTextModel(state)`.
- Create: `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`
  - Covers turn grouping, replay and live message mapping, itemStarted filtering, text extraction, ignored item behavior, global reconnect status, and selector integration.

---

### Task 1: Add Failing Chat Text Model Tests

**Files:**
- Create: `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`

- [x] **Step 1: Write the failing chat text model tests**

Create `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  buildChatTextModel,
  selectChatTextModel,
  type ChatTextModel,
} from "@/features/chatTextModel/chatTextModel";
import type { TimelineMaterial } from "@/features/liveEventHandling/liveEventHandling";
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

const imageInput = (url: string): UserInput => ({
  type: "image",
  url,
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

const planItem = (id: string): ThreadItem => ({
  type: "plan",
  id,
  text: "Hidden plan text",
});

describe("chat text model", () => {
  it("returns an empty model for an empty timeline", () => {
    expect(buildChatTextModel([])).toStrictEqual({
      turns: [],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("groups replayed user and assistant text messages by turn", () => {
    const turn = baseTurn("turn-replay");
    const materials = [
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: "thread-1",
        turn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: userMessage("user-1", [textInput("Hello "), textInput("there")]),
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: agentMessage("agent-1", "**Plain** text only"),
      },
      {
        type: "turnCompleted",
        source: "snapshotReplay",
        threadId: "thread-1",
        turn: {
          id: turn.id,
          itemsView: turn.itemsView,
          status: turn.status,
          error: turn.error,
          startedAt: turn.startedAt,
          completedAt: turn.completedAt,
          durationMs: turn.durationMs,
        },
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [
        {
          id: "turn-replay",
          entries: [
            {
              type: "message",
              id: "user-1",
              role: "user",
              text: "Hello there",
            },
            {
              type: "message",
              id: "agent-1",
              role: "assistant",
              text: "**Plain** text only",
            },
          ],
        },
      ],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("uses live itemCompleted messages and ignores live itemStarted messages", () => {
    const turn = baseTurn("turn-live");
    const materials = [
      {
        type: "turnStarted",
        source: "liveEvent",
        threadId: "thread-1",
        turn,
      },
      {
        type: "itemStarted",
        source: "liveEvent",
        threadId: "thread-1",
        turnId: turn.id,
        item: agentMessage("agent-started", "Do not show"),
      },
      {
        type: "itemCompleted",
        source: "liveEvent",
        threadId: "thread-1",
        turnId: turn.id,
        item: agentMessage("agent-completed", "Show completed text"),
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [
        {
          id: "turn-live",
          entries: [
            {
              type: "message",
              id: "agent-completed",
              role: "assistant",
              text: "Show completed text",
            },
          ],
        },
      ],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("creates a turn group from item material when turnStarted is absent", () => {
    const materials = [
      {
        type: "itemCompleted",
        source: "liveEvent",
        threadId: "thread-1",
        turnId: "turn-from-item",
        item: userMessage("user-from-item", [textInput("Recovered from item")]),
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [
        {
          id: "turn-from-item",
          entries: [
            {
              type: "message",
              id: "user-from-item",
              role: "user",
              text: "Recovered from item",
            },
          ],
        },
      ],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("ignores non-text user inputs, empty text messages, and non-chat items", () => {
    const turn = baseTurn("turn-filtered");
    const materials = [
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: "thread-1",
        turn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: userMessage("image-only", [imageInput("https://example.invalid/image.png")]),
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: agentMessage("empty-agent", ""),
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: "thread-1",
        turnId: turn.id,
        item: planItem("hidden-plan"),
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
      turns: [{ id: "turn-filtered", entries: [] }],
      globalStatus: [],
    } satisfies ChatTextModel);
  });

  it("derives subscription interruption as turn-external global status", () => {
    const materials = [
      {
        type: "subscriptionInterrupted",
        source: "liveEvent",
        threadId: "thread-1",
        reason: "backpressure",
        subscriptionId: "subscription-1",
      },
    ] satisfies TimelineMaterial[];

    expect(buildChatTextModel(materials)).toStrictEqual({
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

  it("selects chat text model from runtime timeline selectors", () => {
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
            {
              type: "message",
              id: "selector-user",
              role: "user",
              text: "Selector user",
            },
            {
              type: "message",
              id: "selector-agent",
              role: "assistant",
              text: "Selector assistant",
            },
          ],
        },
        {
          id: eventTurnStarted.event.notification.turn.id,
          entries: [],
        },
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

- [x] **Step 2: Run the focused chat text model test and confirm it fails**

Run from the repo root:

```bash
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

Expected result: FAIL because `@/features/chatTextModel/chatTextModel` does not exist yet.

---

### Task 2: Implement Chat Text Model Selector

**Files:**
- Create: `codex-gui/src/features/chatTextModel/chatTextModel.ts`
- Modify: `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts` only if TypeScript reveals a fixture/type mismatch during the focused run.

- [x] **Step 1: Add the pure chat text model implementation**

Create `codex-gui/src/features/chatTextModel/chatTextModel.ts`:

```ts
import type { RootState } from "@/app/store";
import {
  selectThreadTimelineMaterials,
  type LiveSubscriptionMaterial,
  type TimelineMaterial,
} from "@/features/liveEventHandling/liveEventHandling";
import type { ThreadItem, UserInput } from "@codex-protocol/v2";

export type ChatTextModel = {
  turns: ChatTextTurn[];
  globalStatus: ChatTextGlobalStatus[];
};

export type ChatTextTurn = {
  id: string;
  entries: ChatTextMessageEntry[];
};

export type ChatTextMessageEntry = {
  type: "message";
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type ChatTextGlobalStatus = {
  type: "status";
  id: string;
  status: "subscriptionInterrupted";
  text: string;
};

const emptyChatTextModel = (): ChatTextModel => ({
  turns: [],
  globalStatus: [],
});

const textFromUserInputs = (content: UserInput[]): string => {
  let text = "";

  for (const input of content) {
    if (input.type === "text") {
      text += input.text;
    }
  }

  return text;
};

const messageEntryFromItem = (item: ThreadItem): ChatTextMessageEntry | null => {
  switch (item.type) {
    case "userMessage": {
      const text = textFromUserInputs(item.content);

      if (text.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        role: "user",
        text,
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        role: "assistant",
        text: item.text,
      };
    case "hookPrompt":
    case "plan":
    case "reasoning":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "webSearch":
    case "imageView":
    case "imageGeneration":
    case "enteredReviewMode":
    case "exitedReviewMode":
    case "contextCompaction":
    case "collabAgentToolCall":
    case "dynamicToolCall":
      return null;
  }
};

const statusFromSubscriptionInterrupted = (
  material: LiveSubscriptionMaterial,
): ChatTextGlobalStatus => ({
  type: "status",
  id: `subscriptionInterrupted:${material.threadId}:${material.subscriptionId ?? "none"}:${material.reason}`,
  status: "subscriptionInterrupted",
  text: "Connection interrupted. Reconnect required.",
});

export const buildChatTextModel = (materials: TimelineMaterial[]): ChatTextModel => {
  const model = emptyChatTextModel();
  const turnsById = new Map<string, ChatTextTurn>();

  const ensureTurn = (turnId: string): ChatTextTurn => {
    const existingTurn = turnsById.get(turnId);

    if (existingTurn != null) {
      return existingTurn;
    }

    const turn = {
      id: turnId,
      entries: [],
    };
    turnsById.set(turnId, turn);
    model.turns.push(turn);
    return turn;
  };

  for (const material of materials) {
    switch (material.type) {
      case "turnStarted":
        ensureTurn(material.turn.id);
        break;
      case "itemReplayed": {
        const entry = messageEntryFromItem(material.item);

        if (entry != null) {
          ensureTurn(material.turnId).entries.push(entry);
        } else {
          ensureTurn(material.turnId);
        }
        break;
      }
      case "itemCompleted": {
        const entry = messageEntryFromItem(material.item);

        if (entry != null) {
          ensureTurn(material.turnId).entries.push(entry);
        }
        break;
      }
      case "subscriptionInterrupted":
        model.globalStatus.push(statusFromSubscriptionInterrupted(material));
        break;
      case "itemStarted":
      case "turnCompleted":
        break;
    }
  }

  return model;
};

export const selectChatTextModel = (state: RootState): ChatTextModel =>
  buildChatTextModel(selectThreadTimelineMaterials(state));
```

- [x] **Step 2: Run the focused chat text model test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

Expected result: PASS for all tests in `chatTextModel.test.ts`.

---

### Task 3: Verify Lower-Layer Selectors Still Pass

**Files:**
- No source changes expected.

- [x] **Step 1: Run 06a focused verification**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
pnpm --dir codex-gui exec vitest --run src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
```

Expected result: all three focused Vitest commands pass.

- [x] **Step 2: Run package-level GUI CI if this implementation is part of a source-change PR**

Run:

```bash
pnpm --dir codex-gui run ci
```

Expected result: package-level GUI CI passes.

This is intentionally package-level, not a full repository test suite.

- [x] **Step 3: Commit the 06a implementation**

Stage only the 06a source, tests, and plan/design docs that belong to this change:

```bash
git add codex-gui/src/features/chatTextModel/chatTextModel.ts \
  codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts \
  docs/superpowers/specs/2026-06-07-yolo-single-session-chat/06a-chat-text-model/design.md \
  docs/superpowers/plans/2026-06-07-yolo-single-session-chat/06a-chat-text-model/plan-06a-chat-text-model.md
git commit -m "feat(gui): add chat text model"
```

Expected result: one focused Conventional Commit for `06a Chat Text Model`.

---

## Self-Review Checklist

- [x] The plan implements only `06a Chat Text Model`.
- [x] The implementation consumes `selectThreadTimelineMaterials(state)` and does not read `projectionSlice`.
- [x] The output is turn-grouped and does not expose replay/live lifecycle metadata to UI consumers.
- [x] Messages are produced only from replay `itemReplayed` and live `itemCompleted`.
- [x] `itemStarted` never produces user/assistant message entries.
- [x] User text concatenates all text inputs and ignores non-text inputs.
- [x] Assistant text is complete `agentMessage.text` and remains plain text.
- [x] Non-chat items are silently ignored.
- [x] Manual reconnect is represented as turn-external `globalStatus`.
- [x] Verification is focused and does not run the full test suite.
