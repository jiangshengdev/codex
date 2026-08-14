import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningSummaryTextDelta,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  collabAgentToolCall,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  planItem,
  reasoningItem,
  reasoningSummaryTextDelta,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveScrollPulse,
  transcriptEntryIdFor,
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

  it("signals reasoning title changes and only committed visible replacements", () => {
    const store = makeStore();
    const turnId = "turn-reasoning-scroll";
    const itemId = "reasoning-scroll";
    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const initialPulse = selectTranscriptLiveScrollPulse(store.getState());
    const signals = () => [
      selectTranscriptLiveScrollPulse(store.getState()),
      selectCommittedTranscriptScrollCommitKey(store.getState()),
    ];
    const observed = [signals()];
    const event = (notification: ReturnType<typeof itemStarted>) =>
      store.dispatch(threadRuntimeEventBuffered({ notification, replay: "live" }));
    const delta = (targetId: string, text: string, summaryIndex = 0) =>
      store.dispatch(
        threadRuntimeDeltasAccepted({
          notifications: [
            reasoningSummaryTextDelta(
              eventReasoningSummaryTextDelta,
              turnId,
              targetId,
              text,
              summaryIndex,
            ),
          ],
        }),
      );
    event(itemStarted(eventItemStarted, "reasoning-started", turnId, reasoningItem(itemId, [])));
    observed.push(signals());
    delta(itemId, "**First title**");
    observed.push(signals());
    delta(itemId, "**Updated title**", 1);
    observed.push(signals());
    event(
      itemCompleted(
        eventItemCompleted,
        "reasoning-completed",
        turnId,
        reasoningItem(itemId, ["Authoritative summary"]),
      ),
    );
    observed.push(signals());
    event(itemStarted(eventItemStarted, "visible-started", turnId, reasoningItem("visible", [])));
    delta("visible", "**Visible title**");
    observed.push(signals());
    event(
      itemCompleted(eventItemCompleted, "visible-removed", turnId, reasoningItem("visible", [])),
    );
    observed.push(signals());
    event(itemStarted(eventItemStarted, "empty-started", turnId, reasoningItem("empty", [])));
    event(itemCompleted(eventItemCompleted, "empty-removed", turnId, reasoningItem("empty", [])));
    observed.push(signals());
    expect(observed).toEqual([
      [initialPulse, attachKey],
      [initialPulse, attachKey],
      [initialPulse + 1, attachKey],
      [initialPulse + 2, attachKey],
      [initialPulse + 2, "event:reasoning-completed"],
      [initialPulse + 3, "event:reasoning-completed"],
      [initialPulse + 3, "event:visible-removed"],
      [initialPulse + 3, "event:visible-removed"],
    ]);
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor(turnId, "empty")),
    ).toBeNull();
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
    expect(startedPulse).toBe(initialPulse);
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
    expect(deltaPulse).toBe(initialPulse + 1);
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

    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse + 1);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-live-scroll-pulse-completed",
    );
  });

  it("does not create a live entry or advance the scroll pulse for non-assistant items", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
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
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-plan-live-scroll-pulse", "plan-live-scroll-pulse"),
      ),
    ).toBeNull();
    expect(
      selectTranscriptChunk(store.getState(), "turn-plan-live-scroll-pulse:chunk:0"),
    ).toBeNull();

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
      selectTranscriptEntry(
        store.getState(),
        transcriptEntryIdFor("turn-plan-live-scroll-pulse", "plan-live-scroll-pulse"),
      ),
    ).toBeNull();
    expect(
      selectTranscriptChunk(store.getState(), "turn-plan-live-scroll-pulse:chunk:0"),
    ).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });

  it("signals only visible started activity DOM changes through the committed key", () => {
    const store = makeStore();
    const turnId = "turn-collab-scroll-signals";
    const wait = collabAgentToolCall("collab-scroll-wait", "wait", "inProgress");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const initialPulse = selectTranscriptLiveScrollPulse(store.getState());
    const dispatchStarted = (commitId: string, item: ReturnType<typeof collabAgentToolCall>) => {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemStarted(eventItemStarted, commitId, turnId, item),
          replay: "live",
        }),
      );
    };
    const dispatchCompleted = (commitId: string, item: ReturnType<typeof collabAgentToolCall>) => {
      store.dispatch(
        threadRuntimeEventBuffered({
          notification: itemCompleted(eventItemCompleted, commitId, turnId, item),
          replay: "live",
        }),
      );
    };

    dispatchStarted("commit-collab-scroll-wait-started", wait);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-collab-scroll-wait-started",
    );
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse);

    dispatchStarted("commit-collab-scroll-wait-duplicate", wait);
    dispatchStarted(
      "commit-collab-scroll-hidden-started",
      collabAgentToolCall("collab-scroll-hidden", "spawnAgent", "inProgress"),
    );
    dispatchCompleted(
      "commit-collab-scroll-filtered-completed",
      collabAgentToolCall("collab-scroll-filtered", "spawnAgent", "inProgress"),
    );
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-collab-scroll-wait-started",
    );

    dispatchCompleted(
      "commit-collab-scroll-wait-completed",
      collabAgentToolCall(wait.id, "wait", "completed"),
    );
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-collab-scroll-wait-completed",
    );

    dispatchStarted(
      "commit-collab-scroll-resume-started",
      collabAgentToolCall("collab-scroll-resume", "resumeAgent", "inProgress", {
        receiverThreadIds: ["agent-a"],
      }),
    );
    dispatchCompleted(
      "commit-collab-scroll-resume-removed",
      collabAgentToolCall("collab-scroll-resume", "resumeAgent", "completed"),
    );
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
      "event:commit-collab-scroll-resume-removed",
    );
    expect(
      selectTranscriptEntry(store.getState(), transcriptEntryIdFor(turnId, "collab-scroll-resume")),
    ).toBeNull();
    expect(selectTranscriptLiveScrollPulse(store.getState())).toBe(initialPulse);
    expect(attachKey).not.toBe(selectCommittedTranscriptScrollCommitKey(store.getState()));
  });
});
