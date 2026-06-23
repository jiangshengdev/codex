import { expect, test } from "vitest";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

test("renders an empty committed transcript region", async () => {
  const screen = await renderWithProviders(<CommittedTranscriptSurface />);

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});

test("renders committed user and assistant messages from an attached baseline", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-surface", [
          userMessage("user-surface", [textInput("Hello "), textInput("surface")]),
          agentMessage("agent-surface", "Committed response"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByRole("article", { name: "Turn turn-surface" })).toBeVisible();
  await expect.element(screen.getByText("Hello surface")).toBeVisible();
  await expect.element(screen.getByText("Committed response")).toBeVisible();
});

test("renders live completed items without rendering started items", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered(
      turnStarted(eventTurnStarted, "commit-turn-live", {
        ...baseTurn("turn-live"),
        status: "inProgress",
        completedAt: null,
        durationMs: null,
      }),
    ),
  );
  store.dispatch(
    threadRuntimeEventBuffered(
      itemStarted(
        eventItemStarted,
        "commit-started",
        "turn-live",
        agentMessage("agent-started", "Draft answer"),
      ),
    ),
  );

  await expect.element(screen.getByText("Draft answer")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect
    .element(screen.getByRole("article", { name: "Turn turn-live" }))
    .not.toBeInTheDocument();

  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-completed",
        "turn-live",
        agentMessage("agent-live", "Final answer"),
      ),
    ),
  );

  await expect.element(screen.getByRole("article", { name: "Turn turn-live" })).toBeVisible();
  await expect.element(screen.getByText("Final answer")).toBeVisible();
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
