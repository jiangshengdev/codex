import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  attachReplacement,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningSummaryTextDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptContextPage,
  selectTranscriptContextPageIds,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  contextCompaction,
  itemCompleted,
  itemStarted,
  reasoningItem,
  reasoningSummaryTextDelta,
} from "@/features/projection/__tests__/projectionTestBuilders";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedEvent) =>
  readModelAction({ type: "eventAccepted", payload });
const threadRuntimeDeltasAccepted = ({
  notifications,
}: Pick<
  Extract<ActiveThreadProjectionReadModelFact, { type: "deltasAccepted" }>,
  "notifications"
>) => readModelAction({ type: "deltasAccepted", notifications });
const threadRuntimeManualReconnectRequired = (
  fact: Omit<
    Extract<ActiveThreadProjectionReadModelFact, { type: "projectionUnavailable" }>,
    "type"
  >,
) => readModelAction({ type: "projectionUnavailable", ...fact });

describe("transcript state reconnect reducer", () => {
  it("rebuilds context pages from reattach without duplicating compaction boundaries", () => {
    const store = makeStore();
    const turnId = "turn-reattach-compaction";
    const compactionId = "compaction-reattach";
    const snapshotTurns = [
      baseTurn(turnId, [
        agentMessage("agent-before-compaction", "Before", "commentary"),
        contextCompaction(compactionId),
        agentMessage("agent-after-compaction", "After", "commentary"),
      ]),
    ];

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, snapshotTurns)));
    const beforeReattachPage = selectTranscriptContextPage(store.getState(), "context-page:2");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachReplacement, snapshotTurns)));

    expect(selectTranscriptContextPageIds(store.getState())).toStrictEqual([
      "context-page:1",
      "context-page:2",
    ]);
    expect(selectTranscriptContextPage(store.getState(), "context-page:2")).not.toBe(
      beforeReattachPage,
    );
    expect(selectTranscriptContextPage(store.getState(), "context-page:2")).toStrictEqual({
      id: "context-page:2",
      leadingBoundaryId: transcriptEntryIdFor(turnId, compactionId),
      turnFragmentIds: [JSON.stringify(["context-page:2", turnId, 0])],
    });
  });

  it("preserves completed reasoning and clears streaming reasoning on manual reconnect", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns(attachBaseline, [
      baseTurn("turn-existing", [reasoningItem("reasoning-existing", ["Existing summary"])]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-streaming",
          "turn-streaming",
          reasoningItem("reasoning-streaming", []),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          reasoningSummaryTextDelta(
            eventReasoningSummaryTextDelta,
            "turn-streaming",
            "reasoning-streaming",
            "**Working**",
            0,
          ),
        ],
      }),
    );
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-streaming")).toStrictEqual({
      id: "turn-streaming",
      status: "inProgress",
      originalFirstItemId: "reasoning-streaming",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-existing", "reasoning-existing"),
      ),
    ).toStrictEqual({
      type: "reasoning",
      id: "reasoning-existing",
      turnId: "turn-existing",
      lifecycle: "completed",
      source: "Existing summary",
      revision: 0,
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-streaming", "reasoning-streaming"),
      ),
    ).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      `reconnect:${attachWithChat.snapshot.thread.id}:${attachWithChat.subscriptionId}:backpressure`,
    );
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachWithChat.snapshot.thread.id}:${attachWithChat.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachWithChat.subscriptionId,
      },
    ]);
  });

  it("clears interrupted status and applied event ids on the next attach", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns(attachBaseline, [
      baseTurn("turn-before-reconnect", [agentMessage("agent-before", "Before reconnect")]),
    ]);
    const replacementAttach = attachWithTurns(attachBaseline, [
      baseTurn("turn-after-reconnect", [reasoningItem("reasoning-after", ["Restored summary"])]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-before",
          "turn-before-reconnect",
          agentMessage("agent-live-before", "Live before"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-reattach-streaming",
          "turn-reattach-streaming",
          reasoningItem("reasoning-reattach-streaming", []),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          reasoningSummaryTextDelta(
            eventReasoningSummaryTextDelta,
            "turn-reattach-streaming",
            "reasoning-reattach-streaming",
            "**Before reattach**",
            0,
          ),
        ],
      }),
    );
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-reattach-streaming", "reasoning-reattach-streaming"),
      ),
    ).toStrictEqual({
      type: "reasoning",
      id: "reasoning-reattach-streaming",
      turnId: "turn-reattach-streaming",
      lifecycle: "streaming",
      title: "Before reattach",
      revision: 1,
    });
    store.dispatch(threadRuntimeAttached(replacementAttach));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-before",
          "turn-after-reconnect",
          agentMessage("agent-live-after", "Live after reconnect"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-after-reconnect"]);
    expect(selectTranscriptTurn(store.getState(), "turn-after-reconnect")).toStrictEqual({
      id: "turn-after-reconnect",
      status: "completed",
      originalFirstItemId: "reasoning-after",
      leadingPromptEntryId: null,
      middleChunkIds: ["turn-after-reconnect:chunk:0"],
      middleEntryCount: 1,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-after-reconnect", "agent-live-after")],
    });
    expect(selectTranscriptTurn(store.getState(), "turn-reattach-streaming")).toBeNull();
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-reattach-streaming", "reasoning-reattach-streaming"),
      ),
    ).toBeNull();
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-after-reconnect", "reasoning-after"),
      ),
    ).toStrictEqual({
      type: "reasoning",
      id: "reasoning-after",
      turnId: "turn-after-reconnect",
      lifecycle: "completed",
      source: "Restored summary",
      revision: 0,
    });
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("keeps committed transcript during manual reconnect after live item settlement", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-reconnect-live", "");
    const completedItem = agentMessage("agent-reconnect-live", "Completed before reconnect");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-reconnect-started",
          "turn-reconnect-live",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-reconnect-completed",
          "turn-reconnect-live",
          completedItem,
        ),
        replay: "live",
      }),
    );

    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-reconnect-live")).toStrictEqual({
      id: "turn-reconnect-live",
      status: "inProgress",
      originalFirstItemId: "agent-reconnect-live",
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-reconnect-live", "agent-reconnect-live")],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-reconnect-live", "agent-reconnect-live"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-reconnect-live",
      turnId: "turn-reconnect-live",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Completed before reconnect" },
      revision: 1,
    });
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachBaseline.snapshot.thread.id}:${attachBaseline.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachBaseline.subscriptionId,
      },
    ]);

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-after-reconnect", [
            agentMessage("agent-after-reconnect", "After reconnect"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-after-reconnect", "agent-after-reconnect"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-after-reconnect",
      turnId: "turn-after-reconnect",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "After reconnect" },
      revision: 0,
    });
  });
});
