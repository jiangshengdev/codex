import { beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  attachResponse,
  createGuiHostCommands,
  emitProjectionDelta,
  emitProjectionEvent,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
} from "./appBrowserTestSupport";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  attachReplacement,
  eventAgentMessageDelta,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithThreadId,
  attachWithThreadName,
  attachWithTurns,
  baseTurn,
  deltaForThreadOwner,
  eventForThreadOwner,
  eventWithEnvelope,
  inProgressTurn,
  itemStarted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  selectTranscriptEntry,
  transcriptEntryIdFor,
} from "@/features/transcriptState/transcriptStateSlice";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";

const hostMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: hostMock.startGuiHostConnection,
}));

beforeEach(() => {
  resetAppBrowserTestSupport(hostMock.startGuiHostConnection);
  seedBrowserAuthorizationSession({ token: "multi-session-isolation" });
});

const frame = (): Promise<void> =>
  new Promise((resolve) =>
    requestAnimationFrame(() => {
      resolve();
    }),
  );

test("a failed membership write shows the requested task error and retries without exposing the previous task", async () => {
  const secondThreadId = "00000000-0000-0000-0000-000000000002";
  const first = attachWithTurns(attachResponse, [
    baseTurn("first-retained", [
      agentMessage("first-retained-message", "Private first task response"),
    ]),
  ]);
  const second = attachWithThreadName(
    attachWithThreadId(attachWithTurns(attachReplacement, []), secondThreadId),
    "Recovered second task",
  );
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(commands, first);
  initializeHost(getHostOptions(hostMock.startGuiHostConnection), commands);
  const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect.element(composer).toBeVisible();
  await expect
    .element(screen.getByText("Private first task response", { exact: true }))
    .toBeVisible();
  const firstSlot = screen.store.getState().transcriptState.byThreadId[launchThreadId];
  if (firstSlot == null) throw new Error("Expected the first live transcript owner");
  const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce((key) => {
    expect(key).toBe("codex-gui.sessionCollection");
    throw new Error("Membership storage unavailable");
  });
  try {
    queueAttachProjectionResponse(commands, second);
    await router.navigate({ to: "/task/$threadId", params: { threadId: secondThreadId } });
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Session collection persistence failed: write");
    await expect.element(screen.getByRole("main").getByRole("alert")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry", exact: true });
    await expect.element(retry).toBeVisible();
    await expect.element(composer).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Private first task response", { exact: true }))
      .not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/task/${secondThreadId}`);
    expect(screen.store.getState().transcriptState.byThreadId[launchThreadId]).toBe(firstSlot);
    expect(
      screen.store.getState().threadRuntime.byThreadId[launchThreadId]?.current?.threadId,
    ).toBe(launchThreadId);
    expect(screen.store.getState().transcriptState.byThreadId[secondThreadId]).toBeUndefined();
    expect(commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: launchThreadId,
    });
    expect(commands.resumeThread).toHaveBeenCalledExactlyOnceWith({ threadId: launchThreadId });
    expect(commands.startTurn).not.toHaveBeenCalled();
    expect(commands.detachThreadProjection).not.toHaveBeenCalled();

    storageWrite.mockRestore();
    await retry.click();
    await expect.poll(() => document.title).toBe("Recovered second task · Codex");
    await expect.element(composer).toBeVisible();
    await expect.element(screen.getByRole("main").getByRole("alert")).not.toBeInTheDocument();
    expect(screen.store.getState().transcriptState.byThreadId[launchThreadId]?.identity).toBe(
      firstSlot.identity,
    );
    expect(commands.attachThreadProjection).toHaveBeenCalledTimes(2);
    expect(commands.attachThreadProjection).toHaveBeenLastCalledWith({ threadId: secondThreadId });
    expect(commands.detachThreadProjection).not.toHaveBeenCalled();
  } finally {
    storageWrite.mockRestore();
    await screen.unmount();
  }
});

test("interleaved background projection updates preserve the viewed title, transcript and scroll owner", async () => {
  const secondThreadId = "00000000-0000-0000-0000-000000000002";
  const longMessage = Array.from(
    { length: 96 },
    (_, index) => `Visible first task paragraph ${String(index)}.`,
  ).join("\n\n");
  const first = attachWithThreadName(
    attachWithTurns(attachResponse, [
      baseTurn("first-committed", [agentMessage("first-message", longMessage)]),
    ]),
    "First active task",
  );
  const second = attachWithThreadName(
    attachWithThreadId(attachWithTurns(attachReplacement, []), secondThreadId),
    "Second active task",
  );
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(commands, first);
  const options = getHostOptions(hostMock.startGuiHostConnection);
  initializeHost(options, commands);
  await expect.poll(() => document.title).toBe("First active task · Codex");
  await expect
    .element(screen.getByText("Visible first task paragraph 0.", { exact: true }))
    .toBeInTheDocument();
  const firstIdentity =
    screen.store.getState().transcriptState.byThreadId[launchThreadId]?.identity;
  if (firstIdentity == null) throw new Error("Expected the first live transcript owner");

  queueAttachProjectionResponse(commands, second);
  await router.navigate({ to: "/task/$threadId", params: { threadId: secondThreadId } });
  await expect.poll(() => document.title).toBe("Second active task · Codex");
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toBeVisible();
  await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
  await expect.poll(() => document.title).toBe("First active task · Codex");
  await expect
    .element(screen.getByText("Visible first task paragraph 0.", { exact: true }))
    .toBeInTheDocument();
  await frame();
  await frame();
  const scroller = document.scrollingElement;
  if (!(scroller instanceof HTMLElement)) throw new Error("Expected document scroller");
  window.scrollTo({ top: scroller.scrollHeight });
  await frame();
  await frame();
  const firstSlot = screen.store.getState().transcriptState.byThreadId[launchThreadId];
  const scrollTo = vi.spyOn(scroller, "scrollTo");
  try {
    const secondOwner = { threadId: secondThreadId, subscriptionId: second.subscriptionId };
    const started = eventForThreadOwner(
      eventWithEnvelope(
        turnStarted(eventTurnStarted, "second-turn-started", inProgressTurn("second-turn")),
        { parentCommitId: second.snapshot.headCommitId },
      ),
      secondOwner,
    );
    const item = eventForThreadOwner(
      eventWithEnvelope(
        itemStarted(
          eventItemStarted,
          "second-item-started",
          "second-turn",
          agentMessage("second-item", ""),
        ),
        { parentCommitId: started.commitId },
      ),
      secondOwner,
    );
    emitProjectionEvent(options, started);
    emitProjectionEvent(options, item);
    emitProjectionDelta(
      options,
      deltaForThreadOwner(
        agentMessageDelta(
          eventAgentMessageDelta,
          "second-turn",
          "second-item",
          "Background second task response",
        ),
        secondOwner,
      ),
    );
    await expect
      .poll(() =>
        selectTranscriptEntry(
          screen.store.getState(),
          secondThreadId,
          transcriptEntryIdFor("second-turn", "second-item"),
        ),
      )
      .toMatchObject({ rendering: { source: "Background second task response" } });
    await frame();
    await frame();
    expect(document.title).toBe("First active task · Codex");
    expect(screen.store.getState().transcriptState.byThreadId[launchThreadId]).toBe(firstSlot);
    expect(scrollTo).not.toHaveBeenCalled();
    await expect
      .element(screen.getByText("Background second task response", { exact: true }))
      .not.toBeInTheDocument();
    await router.navigate({ to: "/task/$threadId", params: { threadId: secondThreadId } });
    await expect.poll(() => document.title).toBe("Second active task · Codex");
    await expect
      .element(screen.getByText("Background second task response", { exact: true }))
      .toBeVisible();
    await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
    await expect.poll(() => document.title).toBe("First active task · Codex");
    expect(screen.store.getState().transcriptState.byThreadId[launchThreadId]?.identity).toBe(
      firstIdentity,
    );
    expect(commands.attachThreadProjection).toHaveBeenCalledTimes(2);
    expect(commands.resumeThread).toHaveBeenCalledTimes(2);
    expect(commands.detachThreadProjection).not.toHaveBeenCalled();
  } finally {
    scrollTo.mockRestore();
    await screen.unmount();
    window.scrollTo({ top: 0 });
  }
});
