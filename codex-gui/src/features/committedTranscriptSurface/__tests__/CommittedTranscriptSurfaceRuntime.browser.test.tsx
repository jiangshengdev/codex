import { expect, test } from "vitest";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { selectCommittedTranscriptScrollCommitKey } from "@/features/transcriptState/transcriptStateSlice";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

test("updates committed message text after snapshot reattach with stable ids", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-reattach", [agentMessage("agent-reattach", "Before reconnect")]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Before reconnect")).toBeVisible();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-reattach", [agentMessage("agent-reattach", "After reconnect")]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Before reconnect")).not.toBeInTheDocument();
  await expect.element(screen.getByText("After reconnect")).toBeVisible();
});

test("renders live assistant text between intermediate updates and final answers", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachScrollKey = selectCommittedTranscriptScrollCommitKey(store.getState());
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: turnStarted(eventTurnStarted, "commit-turn-live", inProgressTurn("turn-live")),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-started",
        "turn-live",
        agentMessage("agent-started", "Draft answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Draft answer")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("article", { name: "Turn turn-live" })).toBeVisible();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).not.toBeNull();

  store.dispatch(
    threadRuntimeDeltasAccepted({
      notifications: [
        agentMessageDelta(
          eventAgentMessageDelta,
          "turn-live",
          "agent-started",
          "**Streaming** answer",
        ),
      ],
    }),
  );

  await expect.element(screen.getByText("Streaming")).toBeVisible();
  await expect.element(screen.getByText("answer")).toBeVisible();
  expect(
    document.querySelector(
      '.committed-transcript-live-assistant-message [data-streamdown="strong"]',
    ),
  ).not.toBeNull();
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachScrollKey);

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-completed",
        "turn-live",
        agentMessage("agent-started", "Final answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Streaming")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Final answer")).toBeVisible();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).toBeNull();
});

test("renders manual reconnect interruption status", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const attach = attachWithTurns(attachBaseline, []);

  store.dispatch(threadRuntimeAttached(attach));
  store.dispatch(
    threadRuntimeManualReconnectRequired({
      reason: "backpressure",
      threadId: attach.snapshot.thread.id,
      subscriptionId: attach.subscriptionId,
    }),
  );

  await expect
    .element(screen.getByText("Connection interrupted. Reconnect required."))
    .toBeVisible();
});
