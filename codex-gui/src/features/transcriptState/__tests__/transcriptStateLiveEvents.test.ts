import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
} from "../transcriptStateSlice";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  planItem,
  sleepItem,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

describe("transcript state live events reducer", () => {
  it("creates a started live slot from itemStarted without committing transcript entries", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    const initialItem = agentMessage("agent-live-started", "Initial text should stay live only");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-started-slot",
          "turn-live-started-slot",
          initialItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-started-slot"),
    ).toStrictEqual([
      {
        key: "turn-live-started-slot:agent-live-started",
        turnId: "turn-live-started-slot",
        itemId: "agent-live-started",
        status: "started",
        initialItem,
        transientText: "",
        revision: 0,
      },
    ]);
    expect(selectTranscriptEntry(store.getState(), "agent-live-started")).toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-live-started-slot:chunk:0")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("appends accepted agent message deltas into an existing live slot", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    const initialItem = agentMessage("agent-streaming", "");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-streaming-started",
          "turn-streaming",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming",
          "agent-streaming",
          "Hello",
        ),
      }),
    );
    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-streaming",
          "agent-streaming",
          " world",
        ),
      }),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-streaming", "agent-streaming"),
    ).toStrictEqual({
      key: "turn-streaming:agent-streaming",
      turnId: "turn-streaming",
      itemId: "agent-streaming",
      status: "streaming",
      initialItem,
      transientText: "Hello world",
      revision: 2,
    });
    expect(selectTranscriptEntry(store.getState(), "agent-streaming")).toBeNull();
    expect(selectTranscriptChunk(store.getState(), "turn-streaming:chunk:0")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("ignores accepted agent message deltas when the live slot is missing", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const beforeState = store.getState().transcriptState;

    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-missing",
          "agent-missing",
          "Ignored",
        ),
      }),
    );

    expect(store.getState().transcriptState).toBe(beforeState);
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-missing")).toStrictEqual([]);
  });

  it("keeps itemStarted slot order stable and ignores duplicate live slot insertion", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-slot-first", "First");
    const secondItem = agentMessage("agent-slot-second", "Second");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-first",
          "turn-slot-order",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-first-duplicate-id",
          "turn-slot-order",
          agentMessage("agent-slot-first", "Updated initial"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-slot-second",
          "turn-slot-order",
          secondItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-slot-order").map(
        (item) => item.itemId,
      ),
    ).toStrictEqual(["agent-slot-first", "agent-slot-second"]);
    expect(
      selectTranscriptLiveItem(store.getState(), "turn-slot-order", "agent-slot-first"),
    ).toStrictEqual({
      key: "turn-slot-order:agent-slot-first",
      turnId: "turn-slot-order",
      itemId: "agent-slot-first",
      status: "started",
      initialItem: firstItem,
      transientText: "",
      revision: 0,
    });
  });

  it("returns null when a stale live item index points at a different key", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-stale-index-first", "First");
    const secondItem = agentMessage("agent-stale-index-second", "Second");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-stale-index-first",
          "turn-stale-index",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-stale-index-second",
          "turn-stale-index",
          secondItem,
        ),
        replay: "live",
      }),
    );

    const state = store.getState();
    const nextState: ReturnType<typeof store.getState> = {
      ...state,
      transcriptState: {
        ...state.transcriptState,
        liveItemIndexByKey: {
          ...state.transcriptState.liveItemIndexByKey,
          "turn-stale-index:agent-stale-index-first": {
            turnId: "turn-stale-index",
            index: 1,
          },
        },
      },
    };

    expect(
      selectTranscriptLiveItem(nextState, "turn-stale-index", "agent-stale-index-first"),
    ).toBeNull();
  });

  it("returns the store-owned live item array when live item state changes", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-cache-slot", "Initial");
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-cache-slot",
          "turn-cache-slot",
          initialItem,
        ),
        replay: "live",
      }),
    );

    const cachedView = selectTranscriptLiveItemsForTurn(store.getState(), "turn-cache-slot");
    const state = store.getState();
    const liveItems = state.transcriptState.liveItemsByTurnId["turn-cache-slot"];
    expect(liveItems).toBeDefined();
    if (liveItems == null) {
      throw new Error("expected live item array to exist");
    }
    const liveItem = liveItems[0];
    expect(liveItem).toBeDefined();
    if (liveItem == null) {
      throw new Error("expected live item to exist");
    }

    const nextState: ReturnType<typeof store.getState> = {
      ...state,
      transcriptState: {
        ...state.transcriptState,
        liveItemsByTurnId: {
          ...state.transcriptState.liveItemsByTurnId,
          "turn-cache-slot": [
            {
              ...liveItem,
              status: "streaming",
              transientText: "Streamed text",
              revision: liveItem.revision + 1,
            },
          ],
        },
      },
    };

    const nextView = selectTranscriptLiveItemsForTurn(nextState, "turn-cache-slot");
    expect(nextView).not.toBe(cachedView);
    expect(nextView).toStrictEqual([
      {
        key: "turn-cache-slot:agent-cache-slot",
        turnId: "turn-cache-slot",
        itemId: "agent-cache-slot",
        status: "streaming",
        initialItem,
        transientText: "Streamed text",
        revision: 1,
      },
    ]);
  });

  it("preserves assistant message phase in live completed transcript entries", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-commentary",
          "turn-live-phase",
          agentMessage("agent-live-commentary", "Still working", "commentary"),
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptChunk(store.getState(), "turn-live-phase:chunk:0")?.entries,
    ).toStrictEqual([
      {
        type: "message",
        id: "agent-live-commentary",
        turnId: "turn-live-phase",
        role: "assistant",
        source: "Still working",
        sourceKind: "markdown",
        phase: "commentary",
        revision: 0,
      },
    ]);
  });

  it("sets the committed scroll commit key from accepted attach snapshots", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      `attach:${attachBaseline.snapshot.thread.id}:${attachBaseline.subscriptionId}:none`,
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachReplacement, [])));

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      `attach:${attachReplacement.snapshot.thread.id}:${attachReplacement.subscriptionId}:${attachReplacement.snapshot.headCommitId ?? "none"}`,
    );
  });

  it("applies live itemCompleted messages into committed transcript chunks", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnStarted(
          eventTurnStarted,
          "commit-live-turn",
          inProgressTurn("turn-live"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-started",
          "turn-live",
          agentMessage("agent-started", "Started should be ignored"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-agent",
          "turn-live",
          agentMessage("agent-live", "Live answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-live")).toStrictEqual({
      id: "turn-live",
      status: "inProgress",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-live"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-live")).toStrictEqual({
      type: "message",
      id: "agent-live",
      turnId: "turn-live",
      role: "assistant",
      source: "Live answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("removes the live item after committing the completed agent message", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-settled", "");
    const completedItem = agentMessage("agent-settled", "Completed answer", "final_answer");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-settled-started",
          "turn-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-settled",
          "agent-settled",
          "Partial",
        ),
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-settled-completed",
          "turn-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptLiveItem(store.getState(), "turn-settled", "agent-settled")).toBeNull();
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-settled")).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), "agent-settled")).toStrictEqual({
      type: "message",
      id: "agent-settled",
      turnId: "turn-settled",
      role: "assistant",
      source: "Completed answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("keeps the later live item addressable after removing an earlier live item", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const firstItem = agentMessage("agent-remove-first", "");
    const secondItem = agentMessage("agent-remove-second", "Still live");
    const completedFirstItem = agentMessage("agent-remove-first", "Completed first");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-remove-first-started",
          "turn-remove-first",
          firstItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-remove-second-started",
          "turn-remove-first",
          secondItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-remove-first-completed",
          "turn-remove-first",
          completedFirstItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-remove-first", "agent-remove-first"),
    ).toBeNull();
    expect(
      selectTranscriptLiveItem(store.getState(), "turn-remove-first", "agent-remove-second"),
    ).toStrictEqual({
      key: "turn-remove-first:agent-remove-second",
      turnId: "turn-remove-first",
      itemId: "agent-remove-second",
      status: "started",
      initialItem: secondItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-remove-first")).toStrictEqual([
      {
        key: "turn-remove-first:agent-remove-second",
        turnId: "turn-remove-first",
        itemId: "agent-remove-second",
        status: "started",
        initialItem: secondItem,
        transientText: "",
        revision: 0,
      },
    ]);
  });

  it("does not create a live slot when itemCompleted arrives without itemStarted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-missing-slot-completed",
          "turn-missing-slot-completed",
          agentMessage("agent-missing-slot-completed", "Committed without live slot"),
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-missing-slot-completed"),
    ).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), "agent-missing-slot-completed")).toStrictEqual({
      type: "message",
      id: "agent-missing-slot-completed",
      turnId: "turn-missing-slot-completed",
      role: "assistant",
      source: "Committed without live slot",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("removes the live item after an empty completed agent message without committing an entry", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-empty-settled", "");
    const completedItem = agentMessage("agent-empty-settled", "");
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-empty-settled-started",
          "turn-empty-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-settled-completed",
          "turn-empty-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-empty-settled", "agent-empty-settled"),
    ).toBeNull();
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-empty-settled")).toStrictEqual(
      [],
    );
    expect(selectTranscriptEntry(store.getState(), "agent-empty-settled")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("applies normalized live itemCompleted projection payloads into committed transcript chunks", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-normalized",
          "turn-live-normalized",
          agentMessage("agent-live-normalized", "Live normalized answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-live-normalized")).toStrictEqual({
      id: "turn-live-normalized",
      status: "inProgress",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-live-normalized"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-live-normalized")).toStrictEqual({
      type: "message",
      id: "agent-live-normalized",
      turnId: "turn-live-normalized",
      role: "assistant",
      source: "Live normalized answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("advances the committed scroll commit key only when live events change committed transcript DOM", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-started-no-dom",
          "turn-scroll-key",
          agentMessage("agent-started-no-dom", "Started should be ignored"),
        ),
        replay: "live",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-filtered-no-dom",
          "turn-scroll-key",
          planItem("hidden-plan"),
        ),
        replay: "live",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-visible-dom",
          "turn-scroll-key",
          agentMessage("agent-visible-dom", "Visible committed message"),
        ),
        replay: "live",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-visible-dom",
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-visible-dom",
          "turn-scroll-key",
          agentMessage("agent-duplicate-dom", "Duplicate should be ignored"),
        ),
        replay: "live",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-visible-dom",
    );
  });

  it("ignores snapshot duplicate live items without changing transcript or scroll key", () => {
    const store = makeStore();
    const snapshotTurn = baseTurn("turn-snapshot-duplicate", [
      agentMessage("agent-snapshot-duplicate", "Already attached"),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const beforeTurn = selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate");
    const beforeEntry = selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-snapshot-duplicate",
          "turn-snapshot-duplicate",
          agentMessage("agent-snapshot-duplicate", "Live replay should be ignored"),
        ),
        replay: "snapshotDuplicate",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate")).toStrictEqual(
      beforeTurn,
    );
    expect(selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate")).toStrictEqual(
      beforeEntry,
    );
  });

  it("ignores snapshot duplicate itemStarted and itemCompleted without touching live slots", () => {
    const store = makeStore();
    const snapshotItem = agentMessage("agent-snapshot-duplicate-live", "Already attached");
    const snapshotTurn = baseTurn("turn-snapshot-duplicate-live", [snapshotItem]);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const beforeTurn = selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate-live");
    const beforeEntry = selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate-live");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-duplicate-started",
          "turn-snapshot-duplicate-live",
          snapshotItem,
        ),
        replay: "snapshotDuplicate",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-duplicate-completed",
          "turn-snapshot-duplicate-live",
          agentMessage("agent-snapshot-duplicate-live", "Replay ignored"),
        ),
        replay: "snapshotDuplicate",
      }),
    );

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-snapshot-duplicate-live"),
    ).toStrictEqual([]);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate-live")).toStrictEqual(
      beforeTurn,
    );
    expect(selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate-live")).toStrictEqual(
      beforeEntry,
    );
  });

  it("updates turn terminal status from live turnCompleted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnStarted(
          eventTurnStarted,
          "commit-start-done",
          inProgressTurn("turn-done"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnCompleted(eventTurnCompleted, "commit-complete-done", {
          ...baseTurn("turn-done", []),
          status: "completed",
        }),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-done")).toStrictEqual({
      id: "turn-done",
      status: "completed",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
  });

  it("filters empty text and non-chat live item completions", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-user",
          "turn-live-filtered",
          userMessage("empty-user", [textInput("")]),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-agent",
          "turn-live-filtered",
          agentMessage("empty-agent", ""),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-plan",
          "turn-live-filtered",
          planItem("hidden-plan"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-sleep",
          "turn-live-filtered",
          sleepItem("hidden-sleep"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-live-filtered"]);
    expect(selectTranscriptTurn(store.getState(), "turn-live-filtered")).toStrictEqual({
      id: "turn-live-filtered",
      status: "inProgress",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
  });

  it("uses commitId to avoid applying the same live notification twice", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-duplicate",
          "turn-duplicate",
          agentMessage("agent-first", "First"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-duplicate",
          "turn-duplicate",
          agentMessage("agent-second", "Second should be ignored"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-duplicate")).toMatchObject({
      finalAssistantEntryIds: ["agent-first"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-first")).toStrictEqual({
      type: "message",
      id: "agent-first",
      turnId: "turn-duplicate",
      role: "assistant",
      source: "First",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("updates an existing committed entry and bumps only its chunk revision", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-first",
          "turn-update",
          agentMessage("agent-update", "First", "commentary"),
        ),
        replay: "live",
      }),
    );
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-second",
          "turn-update",
          agentMessage("agent-update", "Second", "commentary"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-update")).toStrictEqual({
      id: "turn-update",
      status: "inProgress",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-update:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-update")).toStrictEqual({
      type: "message",
      id: "agent-update",
      turnId: "turn-update",
      role: "assistant",
      source: "Second",
      sourceKind: "markdown",
      phase: "commentary",
      revision: 1,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-update:chunk:0")).toStrictEqual({
      id: "turn-update:chunk:0",
      turnId: "turn-update",
      revision: (beforeUpdateChunk?.revision ?? 0) + 1,
      entries: [
        {
          type: "message",
          id: "agent-update",
          turnId: "turn-update",
          role: "assistant",
          source: "Second",
          sourceKind: "markdown",
          phase: "commentary",
          revision: 1,
        },
      ],
    });
  });

  it("bumps entry and chunk revisions when an existing middle entry phase changes", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-phase-first",
          "turn-phase-update",
          agentMessage("agent-phase-update", "Working", "commentary"),
        ),
        replay: "live",
      }),
    );
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-phase-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-phase-second",
          "turn-phase-update",
          agentMessage("agent-phase-update", "Done", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptEntry(store.getState(), "agent-phase-update")).toStrictEqual({
      type: "message",
      id: "agent-phase-update",
      turnId: "turn-phase-update",
      role: "assistant",
      source: "Done",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 1,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-phase-update:chunk:0")).toStrictEqual({
      id: "turn-phase-update:chunk:0",
      turnId: "turn-phase-update",
      revision: (beforeUpdateChunk?.revision ?? 0) + 1,
      entries: [
        {
          type: "message",
          id: "agent-phase-update",
          turnId: "turn-phase-update",
          role: "assistant",
          source: "Done",
          sourceKind: "markdown",
          phase: "final_answer",
          revision: 1,
        },
      ],
    });
  });

  it("updates an existing final assistant entry without creating a middle chunk", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final-first",
          "turn-final-update",
          agentMessage("agent-final-update", "First", "final_answer"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final-second",
          "turn-final-update",
          agentMessage("agent-final-update", "Second", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-final-update")).toStrictEqual({
      id: "turn-final-update",
      status: "inProgress",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: ["agent-final-update"],
    });
    expect(selectTranscriptEntry(store.getState(), "agent-final-update")).toStrictEqual({
      type: "message",
      id: "agent-final-update",
      turnId: "turn-final-update",
      role: "assistant",
      source: "Second",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 1,
    });
  });

  it("chunks only middle entries after the committed chunk entry limit", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-leading",
          "turn-middle-chunked",
          userMessage("user-leading-live", [textInput("Prompt")]),
        ),
        replay: "live",
      }),
    );
    let firstChunkAfterLimit: ReturnType<typeof selectTranscriptChunk> | null = null;

    for (let index = 0; index <= TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT; index += 1) {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemCompleted(
            eventItemCompleted,
            `commit-middle-${String(index)}`,
            "turn-middle-chunked",
            agentMessage(`agent-middle-${String(index)}`, `Middle ${String(index)}`, "commentary"),
          ),
          replay: "live",
        }),
      );

      if (index === TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1) {
        firstChunkAfterLimit = selectTranscriptChunk(
          store.getState(),
          "turn-middle-chunked:chunk:0",
        );
      }
    }
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-final",
          "turn-middle-chunked",
          agentMessage("agent-final-live", "Final", "final_answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-middle-chunked")).toStrictEqual({
      id: "turn-middle-chunked",
      status: "inProgress",
      leadingPromptEntryId: "user-leading-live",
      middleChunkIds: ["turn-middle-chunked:chunk:0", "turn-middle-chunked:chunk:1"],
      middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
      finalAssistantEntryIds: ["agent-final-live"],
    });
    expect(
      selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:0")?.entries,
    ).toHaveLength(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT);
    expect(
      selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:1")?.entries,
    ).toHaveLength(1);
    expect(selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:0")).toBe(
      firstChunkAfterLimit,
    );
  });
});
