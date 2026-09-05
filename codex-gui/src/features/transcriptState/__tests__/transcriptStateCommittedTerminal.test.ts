import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningSummaryTextDelta,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithTurns,
  baseTurn,
  failedTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  reasoningItem,
  reasoningSummaryTextDelta,
  subAgentActivity,
  turnCompleted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  transcriptEntryIdFor,
} from "../transcriptStateSlice";

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

describe("transcript state committed terminal reducer", () => {
  it.each(["interrupted", "failed"] as const)(
    "clears streaming reasoning when a turn is %s",
    (status) => {
      const store = makeStore();
      const turnId = "turn-reasoning-" + status;
      const itemId = "reasoning-" + status;
      const activity = subAgentActivity("activity-" + status, "interrupted", "agents/worker");
      const entryId = transcriptEntryIdFor(turnId, itemId);
      const chunkId = turnId + ":chunk:0";
      const live = (
        notification: Parameters<typeof threadRuntimeEventBuffered>[0]["notification"],
      ) => store.dispatch(threadRuntimeEventBuffered({ notification, replay: "live" }));

      store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
      live(
        itemStarted(eventItemStarted, "commit-start-" + status, turnId, reasoningItem(itemId, [])),
      );
      live(itemCompleted(eventItemCompleted, "commit-activity-" + status, turnId, activity));
      store.dispatch(
        threadRuntimeDeltasAccepted({
          notifications: [
            reasoningSummaryTextDelta(
              eventReasoningSummaryTextDelta,
              turnId,
              itemId,
              "**Visible**",
              0,
            ),
          ],
        }),
      );
      expect(
        selectTranscriptChunk(store.getState(), chunkId)?.entries.map(({ id }) => id),
      ).toStrictEqual([itemId, activity.id]);

      live(
        turnCompleted(eventTurnCompleted, "commit-terminal-" + status, {
          ...baseTurn(turnId),
          status,
        }),
      );
      expect({
        entry: store.getState().transcriptState.entriesById[entryId],
        mapping: store.getState().transcriptState.entryChunkById[entryId],
        rawOrder: store.getState().transcriptState.chunksById[chunkId]?.entryIds,
        visibleOrder: selectTranscriptChunk(store.getState(), chunkId)?.entries.map(({ id }) => id),
        turn: selectTranscriptTurn(store.getState(), turnId),
        signal: selectCommittedTranscriptScrollCommitKey(store.getState()),
      }).toStrictEqual({
        entry: undefined,
        mapping: undefined,
        rawOrder: [transcriptEntryIdFor(turnId, activity.id)],
        visibleOrder: [activity.id],
        turn: {
          id: turnId,
          status,
          originalFirstItemId: itemId,
          leadingPromptEntryId: null,
          middleChunkIds: [chunkId],
          middleEntryCount: 1,
          finalAssistantEntryIds: [],
        },
        signal: "event:commit-terminal-" + status,
      });
    },
  );

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
      originalFirstItemId: null,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
  });

  it("stores, deduplicates, and clears a live failed turn error without adding entries", () => {
    const store = makeStore();
    const turnId = "turn-live-failed-error";
    const error = {
      message:
        "unexpected status 403 Forbidden: token quota is not enough\n(request id: request-live), url: https://shapi.vip/v1/responses",
      codexErrorInfo: "usageLimitExceeded",
      additionalDetails: null,
      misalignment: null,
    } satisfies NonNullable<ReturnType<typeof failedTurn>["error"]>;
    const failedNotification = turnCompleted(
      eventTurnCompleted,
      "commit-live-failed-error",
      failedTurn(turnId, error),
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({ notification: failedNotification, replay: "live" }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({ notification: failedNotification, replay: "live" }),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual([turnId]);
    expect(selectTranscriptTurn(store.getState(), turnId)).toStrictEqual({
      id: turnId,
      status: "failed",
      error,
      originalFirstItemId: null,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(store.getState().transcriptState.entriesById).toStrictEqual({});
    expect(store.getState().transcriptState.chunksById).toStrictEqual({});

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: turnCompleted(
          eventTurnCompleted,
          "commit-live-error-cleared",
          baseTurn(turnId),
        ),
        replay: "live",
      }),
    );

    const completedTurn = selectTranscriptTurn(store.getState(), turnId);
    expect(completedTurn).toStrictEqual({
      id: turnId,
      status: "completed",
      originalFirstItemId: null,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    });
    expect(completedTurn).not.toHaveProperty("error");
  });
});
