import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  planItem,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptLiveScrollPulse,
} from "../transcriptStateSlice";

describe("transcript state scroll signals", () => {
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

  it("advances a live scroll pulse for live assistant display changes without changing the committed scroll key", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const initialPulse = selectTranscriptLiveScrollPulse(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnStarted(
          eventTurnStarted,
          "commit-live-scroll-pulse-turn",
          inProgressTurn("turn-live-scroll-pulse"),
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-scroll-pulse-started",
          "turn-live-scroll-pulse",
          agentMessage("agent-live-scroll-pulse", ""),
        ),
        replay: "live",
      }),
    );

    const startedPulse = selectTranscriptLiveScrollPulse(store.getState());
    expect(startedPulse).toBe(initialPulse + 1);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(
            eventAgentMessageDelta,
            "turn-live-scroll-pulse",
            "agent-live-scroll-pulse",
            "Live pulse delta",
          ),
        ],
      }),
    );

    const deltaPulse = selectTranscriptLiveScrollPulse(store.getState());
    expect(deltaPulse).toBe(initialPulse + 2);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-scroll-pulse-completed",
          "turn-live-scroll-pulse",
          agentMessage("agent-live-scroll-pulse", "Completed pulse answer"),
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse + 3);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-live-scroll-pulse-completed",
    );
  });

  it("does not advance the live scroll pulse for non-visible live items", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialPulse = selectTranscriptLiveScrollPulse(store.getState());
    const plan = planItem("plan-live-scroll-pulse");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-plan-live-scroll-pulse-started",
          "turn-plan-live-scroll-pulse",
          plan,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse);
    expect(
      selectTranscriptLiveItem(
        store.getState(),
        "turn-plan-live-scroll-pulse",
        "plan-live-scroll-pulse",
      ),
    ).toStrictEqual({
      key: "turn-plan-live-scroll-pulse:plan-live-scroll-pulse",
      turnId: "turn-plan-live-scroll-pulse",
      itemId: "plan-live-scroll-pulse",
      status: "started",
      initialItem: plan,
      transientText: "",
      revision: 0,
    });

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-plan-live-scroll-pulse-completed",
          "turn-plan-live-scroll-pulse",
          plan,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse);
    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-plan-live-scroll-pulse"),
    ).toStrictEqual([]);
  });
});
