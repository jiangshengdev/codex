import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventItemCompletedJson from "@/features/projection/__fixtures__/event-item-completed.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnCompletedJson from "@/features/projection/__fixtures__/event-turn-completed.json";
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
import {
  incrementalChatStateSlice,
  selectIncrementalChatGlobalStatus,
  selectIncrementalChatIsInterrupted,
  selectIncrementalChatTurns,
  type IncrementalChatState,
  type IncrementalChatTurnView,
} from "../incrementalChatStateSlice";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;

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

const baseTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  id,
  items,
  itemsView: "full",
  status: "completed",
  error: null,
  startedAt: 1700000001,
  completedAt: 1700000005,
  durationMs: 4000,
});

const attachWithTurns = (turns: Turn[]): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

const itemCompleted = (
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemCompleted.event.type !== "itemCompleted") {
    throw new Error("fixture must contain an itemCompleted projection event");
  }

  return {
    ...eventItemCompleted,
    commitId,
    event: {
      ...eventItemCompleted.event,
      notification: {
        ...eventItemCompleted.event.notification,
        turnId,
        item,
      },
    },
  };
};

const itemStarted = (
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemStarted.event.type !== "itemStarted") {
    throw new Error("fixture must contain an itemStarted projection event");
  }

  return {
    ...eventItemStarted,
    commitId,
    event: {
      ...eventItemStarted.event,
      notification: {
        ...eventItemStarted.event.notification,
        turnId,
        item,
      },
    },
  };
};

const turnStarted = (commitId: string, turn: Turn): ThreadProjectionEventNotification => {
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  return {
    ...eventTurnStarted,
    commitId,
    event: {
      ...eventTurnStarted.event,
      notification: {
        ...eventTurnStarted.event.notification,
        turn,
      },
    },
  };
};

const turnCompleted = (commitId: string, turn: Turn): ThreadProjectionEventNotification => {
  if (eventTurnCompleted.event.type !== "turnCompleted") {
    throw new Error("fixture must contain a turnCompleted projection event");
  }

  return {
    ...eventTurnCompleted,
    commitId,
    event: {
      ...eventTurnCompleted.event,
      notification: {
        ...eventTurnCompleted.event.notification,
        turn,
      },
    },
  };
};

const incrementalChatRoot = (state: IncrementalChatState) => ({
  incrementalChatState: state,
});

describe("incremental chat state reducer", () => {
  it("registers incremental chat state in the app store", () => {
    const store = makeStore();

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([]);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([]);
    expect(selectIncrementalChatIsInterrupted(store.getState())).toBe(false);
  });

  it("rebuilds a baseline from an accepted attach snapshot", () => {
    const attachWithChat = attachWithTurns([
      baseTurn("turn-snapshot", [
        userMessage("user-snapshot", [
          textInput("Hello "),
          imageInput("https://example.invalid/a.png"),
          textInput("there"),
        ]),
        agentMessage("agent-snapshot", "**Plain** text"),
        planItem("plan-snapshot"),
      ]),
    ]);
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithChat));

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-snapshot",
        status: "completed",
        messages: [
          {
            id: "user-snapshot",
            turnId: "turn-snapshot",
            role: "user",
            text: "Hello there",
          },
          {
            id: "agent-snapshot",
            turnId: "turn-snapshot",
            role: "assistant",
            text: "**Plain** text",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("rebuilds snapshot turn order without array membership scans", () => {
    const attachWithMultipleTurns = attachWithTurns([
      baseTurn("turn-order-1"),
      baseTurn("turn-order-2"),
      baseTurn("turn-order-3"),
    ]);
    const includesSpy = vi.spyOn(Array.prototype, "includes");
    const store = makeStore();
    const includesCalls = (() => {
      try {
        store.dispatch(threadRuntimeAttached(attachWithMultipleTurns));
        return Array.from(includesSpy.mock.calls as readonly (readonly unknown[])[], (call) =>
          Array.from(call),
        );
      } finally {
        includesSpy.mockRestore();
      }
    })();

    const turnIds = new Set(["turn-order-1", "turn-order-2", "turn-order-3"]);
    expect(
      includesCalls.filter(([searchElement]) => turnIds.has(String(searchElement))),
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

  it("applies live notifications incrementally and ignores itemStarted for chat messages", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        turnStarted("commit-live-turn", {
          ...baseTurn("turn-live", []),
          status: "inProgress" as const,
        }),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemStarted(
          "commit-live-started",
          "turn-live",
          agentMessage("agent-started", "Started should be ignored"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-live-agent", "turn-live", agentMessage("agent-live", "Live answer")),
      ),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-live",
        status: "inProgress",
        messages: [
          {
            id: "agent-live",
            turnId: "turn-live",
            role: "assistant",
            text: "Live answer",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("filters empty text and non-chat live item completions", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-empty-user",
          "turn-live-filtered",
          userMessage("empty-user", [textInput("")]),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-empty-agent", "turn-live-filtered", agentMessage("empty-agent", "")),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-plan", "turn-live-filtered", planItem("hidden-plan")),
      ),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-live-filtered",
        status: "inProgress",
        messages: [],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("uses commitId to avoid applying the same live notification twice", () => {
    const store = makeStore();
    const firstCompleted = itemCompleted(
      "commit-duplicate",
      "turn-duplicate",
      agentMessage("agent-duplicate", "Only once"),
    );
    const duplicateCommitCompleted = itemCompleted(
      "commit-duplicate",
      "turn-duplicate",
      agentMessage("agent-duplicate-second", "Should be ignored"),
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(threadRuntimeEventBuffered(firstCompleted));
    store.dispatch(threadRuntimeEventBuffered(duplicateCommitCompleted));

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-duplicate",
        status: "inProgress",
        messages: [
          {
            id: "agent-duplicate",
            turnId: "turn-duplicate",
            role: "assistant",
            text: "Only once",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("keeps applied event id dedupe state bounded", () => {
    let state = incrementalChatStateSlice.reducer(
      undefined,
      threadRuntimeAttached(attachWithTurns([])),
    );

    for (let index = 0; index < 501; index += 1) {
      const indexText = String(index);

      state = incrementalChatStateSlice.reducer(
        state,
        threadRuntimeEventBuffered(
          itemCompleted(
            `commit-window-${indexText}`,
            `turn-window-${indexText}`,
            agentMessage(`agent-window-${indexText}`, `Window ${indexText}`),
          ),
        ),
      );
    }

    expect(state.appliedEventOrder).toHaveLength(500);
    expect(state.appliedEventOrder[0]).toBe("commit-window-1");
    expect(state.appliedEventOrder.at(-1)).toBe("commit-window-500");
    expect(state.appliedEventIdsById["commit-window-0"]).toBeUndefined();
    expect(state.appliedEventIdsById["commit-window-1"]).toBe(true);
    expect(state.appliedEventIdsById["commit-window-500"]).toBe(true);
  });

  it("updates an existing message id without duplicating turn order", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-first", "turn-update", agentMessage("agent-update", "First")),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-second", "turn-update", agentMessage("agent-update", "Second")),
      ),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-update",
        status: "inProgress",
        messages: [
          {
            id: "agent-update",
            turnId: "turn-update",
            role: "assistant",
            text: "Second",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("updates turn terminal status from live turnCompleted", () => {
    const store = makeStore();
    const completedTurn = {
      ...baseTurn("turn-done", []),
      status: "completed" as const,
    };

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        turnStarted("commit-start-done", {
          ...baseTurn("turn-done", []),
          status: "inProgress" as const,
        }),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(turnCompleted("commit-complete-done", completedTurn)),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-done",
        status: "completed",
        messages: [],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("filters empty text and non-chat items", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-filtered", [
            userMessage("image-only", [imageInput("https://example.invalid/image.png")]),
            userMessage("empty-user", [textInput("")]),
            agentMessage("empty-agent", ""),
            planItem("hidden-plan"),
          ]),
        ]),
      ),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-filtered",
        status: "completed",
        messages: [],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("preserves materialized content and sets global status on manual reconnect", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns([
      baseTurn("turn-existing", [agentMessage("agent-existing", "Existing answer")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-existing",
        status: "completed",
        messages: [
          {
            id: "agent-existing",
            turnId: "turn-existing",
            role: "assistant",
            text: "Existing answer",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachWithChat.snapshot.thread.id}:${attachWithChat.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachWithChat.subscriptionId,
      },
    ]);
    expect(selectIncrementalChatIsInterrupted(store.getState())).toBe(true);
  });

  it("clears interrupted status and applied event ids on the next attach", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns([
      baseTurn("turn-before-reconnect", [agentMessage("agent-before", "Before reconnect")]),
    ]);
    const replacementAttach = attachWithTurns([
      baseTurn("turn-after-reconnect", [agentMessage("agent-after", "After reconnect")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-before",
          "turn-before-reconnect",
          agentMessage("agent-live-before", "Live before"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );
    store.dispatch(threadRuntimeAttached(replacementAttach));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-before",
          "turn-after-reconnect",
          agentMessage("agent-live-after", "Live after reconnect"),
        ),
      ),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-after-reconnect",
        status: "completed",
        messages: [
          {
            id: "agent-after",
            turnId: "turn-after-reconnect",
            role: "assistant",
            text: "After reconnect",
          },
          {
            id: "agent-live-after",
            turnId: "turn-after-reconnect",
            role: "assistant",
            text: "Live after reconnect",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([]);
    expect(selectIncrementalChatIsInterrupted(store.getState())).toBe(false);
  });

  it("exposes selectors over normalized state without exposing internal maps", () => {
    const state = incrementalChatStateSlice.reducer(
      undefined,
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-selector", [
            userMessage("user-selector", [textInput("Selector user")]),
            agentMessage("agent-selector", "Selector assistant"),
          ]),
        ]),
      ),
    );

    expect(selectIncrementalChatTurns(incrementalChatRoot(state))).toStrictEqual([
      {
        id: "turn-selector",
        status: "completed",
        messages: [
          {
            id: "user-selector",
            turnId: "turn-selector",
            role: "user",
            text: "Selector user",
          },
          {
            id: "agent-selector",
            turnId: "turn-selector",
            role: "assistant",
            text: "Selector assistant",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("returns the prepared turn read model without rebuilding on repeated selector calls", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-read-model", [
            userMessage("user-read-model", [textInput("Read model user")]),
            agentMessage("agent-read-model", "Read model assistant"),
          ]),
        ]),
      ),
    );

    const firstSelectedTurns = selectIncrementalChatTurns(store.getState());
    const secondSelectedTurns = selectIncrementalChatTurns(store.getState());

    expect(secondSelectedTurns).toBe(firstSelectedTurns);
    expect(secondSelectedTurns).toStrictEqual([
      {
        id: "turn-read-model",
        status: "completed",
        messages: [
          {
            id: "user-read-model",
            turnId: "turn-read-model",
            role: "user",
            text: "Read model user",
          },
          {
            id: "agent-read-model",
            turnId: "turn-read-model",
            role: "assistant",
            text: "Read model assistant",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("does not rebuild the turn read model for manual reconnect status updates", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns([
      baseTurn("turn-before-status", [agentMessage("agent-before-status", "Before status")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));

    const beforeStatusTurns = selectIncrementalChatTurns(store.getState());

    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );

    const afterStatusTurns = selectIncrementalChatTurns(store.getState());

    expect(afterStatusTurns).toBe(beforeStatusTurns);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachWithChat.snapshot.thread.id}:${attachWithChat.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachWithChat.subscriptionId,
      },
    ]);
  });

  it("preserves unaffected turn view objects when appending a message to another turn", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-stable", [agentMessage("agent-stable", "Stable")]),
          baseTurn("turn-target", [agentMessage("agent-target-before", "Before")]),
        ]),
      ),
    );

    const beforeAppendTurns = selectIncrementalChatTurns(store.getState());
    const stableTurnBeforeAppend = beforeAppendTurns[0];

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-target-append",
          "turn-target",
          agentMessage("agent-target-after", "After"),
        ),
      ),
    );

    const afterAppendTurns = selectIncrementalChatTurns(store.getState());

    expect(afterAppendTurns).not.toBe(beforeAppendTurns);
    expect(afterAppendTurns[0]).toBe(stableTurnBeforeAppend);
    expect(afterAppendTurns).toStrictEqual([
      {
        id: "turn-stable",
        status: "completed",
        messages: [
          {
            id: "agent-stable",
            turnId: "turn-stable",
            role: "assistant",
            text: "Stable",
          },
        ],
      },
      {
        id: "turn-target",
        status: "completed",
        messages: [
          {
            id: "agent-target-before",
            turnId: "turn-target",
            role: "assistant",
            text: "Before",
          },
          {
            id: "agent-target-after",
            turnId: "turn-target",
            role: "assistant",
            text: "After",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });
});
