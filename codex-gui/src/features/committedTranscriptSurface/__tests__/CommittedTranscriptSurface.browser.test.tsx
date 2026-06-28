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

test("renders temporary content forced open until a final answer exists", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-open", [
          agentMessage("agent-commentary-open", "Working before final", "commentary"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Working before final")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Temporary updates · 1 item" }))
    .toBeDisabled();
});

test("renders temporary content collapsed beside the final answer once final answer exists", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-collapsed", [
          agentMessage("agent-commentary-collapsed", "Hidden working note", "commentary"),
          agentMessage("agent-final-collapsed", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect.element(screen.getByText("Hidden working note")).not.toBeVisible();

  const trigger = screen.getByRole("button", { name: "Temporary updates · 1 item" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Hidden working note")).toBeVisible();
});

test("renders one collapsed temporary module for a turn split across chunks", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const commentaryMessages = Array.from({ length: 101 }, (_, index) =>
    agentMessage(
      `agent-cross-chunk-commentary-${String(index)}`,
      `Cross chunk working note ${String(index)}`,
      "commentary",
    ),
  );

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-cross-chunk", [
          ...commentaryMessages,
          agentMessage(
            "agent-cross-chunk-final",
            "Visible final answer after chunk boundary",
            "final_answer",
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer after chunk boundary")).toBeVisible();
  await expect.element(screen.getByText("Cross chunk working note 0")).not.toBeVisible();

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".committed-transcript-temporary-trigger"),
  );
  expect(triggers.map((trigger) => trigger.textContent)).toStrictEqual([
    "Temporary updates · 101 items",
  ]);

  const trigger = screen.getByRole("button", { name: "Temporary updates · 101 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Cross chunk working note 0")).toBeVisible();
});

test("keeps legacy assistant messages outside the temporary disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-legacy-phase", [
          agentMessage("agent-legacy", "Legacy assistant text", null),
          agentMessage("agent-final-legacy", "Final after legacy", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Legacy assistant text")).toBeVisible();
  await expect.element(screen.getByText("Final after legacy")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Temporary updates · 1 item" }))
    .not.toBeInTheDocument();
});
