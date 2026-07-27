import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { beforeEach, expect, test, vi } from "vitest";
import {
  attachProjection,
  attachResponse,
  emitProjectionDelta,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getHostOptions,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "@/__tests__/appBrowserTestSupport";
import { selectTranscriptLiveItem } from "@/features/transcriptState/transcriptStateSlice";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  eventAgentMessageDelta,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  eventWithEnvelope,
  inProgressTurn,
  itemStarted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
});

const renderRoute = async (initialEntry: string) => {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createAppRouter({ history });
  const screen = await renderWithProviders(<RouterProvider router={router} />);

  return { router, screen };
};

test("an unknown path renders outside the app runtime and does not start the GUI host bridge", async () => {
  const { screen } = await renderRoute("/unknown");

  await expect.element(screen.getByText("404")).toBeVisible();
  expect(guiHostClientMock.startGuiHostConnection).not.toHaveBeenCalled();

  await screen.unmount();
  expect(getCleanupConnectionCallCount()).toBe(0);
});

test("chat and settings share one app runtime while projection updates continue", async () => {
  const { router, screen } = await renderRoute("/?threadId=runtime-thread");

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options, attachWithTurns(attachResponse, []));

  await router.navigate({ to: "/settings" });

  expect(router.state.location.pathname).toBe("/settings");
  await expect
    .element(screen.getByRole("region", { name: "Committed transcript" }))
    .not.toBeInTheDocument();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  const turnId = "turn-during-settings";
  const itemId = "agent-during-settings";
  const turnStartedEvent = turnStarted(
    eventTurnStarted,
    "commit-during-settings-turn",
    inProgressTurn(turnId),
  );
  const itemStartedEvent = eventWithEnvelope(
    itemStarted(eventItemStarted, "commit-during-settings-item", turnId, agentMessage(itemId, "")),
    { parentCommitId: turnStartedEvent.commitId },
  );

  emitProjectionEvent(options, turnStartedEvent);
  emitProjectionEvent(options, itemStartedEvent);
  emitProjectionDelta(
    options,
    agentMessageDelta(
      eventAgentMessageDelta,
      turnId,
      itemId,
      "Message received while settings were open",
    ),
  );

  await expect
    .poll(() => selectTranscriptLiveItem(screen.store.getState(), turnId, itemId))
    .toMatchObject({
      turnId,
      itemId,
      status: "streaming",
      transientText: "Message received while settings were open",
    });
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await router.navigate({ to: "/" });

  await expect.element(screen.getByText("Message received while settings were open")).toBeVisible();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.unmount();
  expect(getCleanupConnectionCallCount()).toBe(1);
});

test("opening settings directly with a thread query starts one app runtime", async () => {
  const { router, screen } = await renderRoute("/settings?threadId=direct-thread");

  expect(router.state.location.pathname).toBe("/settings");
  expect(router.state.location.searchStr).toBe("?threadId=direct-thread");
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.unmount();
  expect(getCleanupConnectionCallCount()).toBe(1);
});

test("a launch error stays hidden on settings and is shown after returning to chat", async () => {
  startGuiHostConnectionMock.mockImplementation(() => {
    throw new Error("missing launch params");
  });

  const { router, screen } = await renderRoute("/settings");

  expect(router.state.location.pathname).toBe("/settings");
  await expect.element(screen.getByText("Unable to start Codex GUI")).not.toBeInTheDocument();
  await expect.element(screen.getByText("missing launch params")).not.toBeInTheDocument();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await router.navigate({ to: "/" });

  await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
  await expect.element(screen.getByText("missing launch params")).toBeVisible();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.unmount();
  expect(getCleanupConnectionCallCount()).toBe(0);
});
