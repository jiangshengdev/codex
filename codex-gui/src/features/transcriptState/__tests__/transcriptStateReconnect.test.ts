import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
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
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";

describe("transcript state reconnect reducer", () => {
  it("preserves committed transcript and sets global status on manual reconnect", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns(attachBaseline, [
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

    expect(selectTranscriptTurn(store.getState(), "turn-existing")).toMatchObject({
      finalAssistantEntryIds: [transcriptEntryIdFor("turn-existing", "agent-existing")],
    });
    expect(
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-existing", "agent-existing"),
      ),
    ).toStrictEqual({
      type: "message",
      id: "agent-existing",
      turnId: "turn-existing",
      role: "assistant",
      source: "Existing answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
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
      baseTurn("turn-after-reconnect", [agentMessage("agent-after", "After reconnect")]),
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
    expect(selectTranscriptTurn(store.getState(), "turn-after-reconnect")).toMatchObject({
      finalAssistantEntryIds: [
        transcriptEntryIdFor("turn-after-reconnect", "agent-after"),
        transcriptEntryIdFor("turn-after-reconnect", "agent-live-after"),
      ],
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
      source: "Completed before reconnect",
      sourceKind: "markdown",
      phase: "final_answer",
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
      source: "After reconnect",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });
});
