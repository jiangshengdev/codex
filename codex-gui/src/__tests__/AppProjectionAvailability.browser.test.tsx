import { beforeEach, expect, test, vi } from "vitest";
import { useEffect } from "react";
import {
  attachResponse,
  attachWithCommittedMessages,
  createGuiHostCommands,
  emitProjectionClosed,
  emitProjectionEvent,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  queueAttachProjectionError,
  queueDeferredAttachProjection,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import {
  useActiveThreadSession,
  useActiveThreadSessionSnapshot,
} from "@/features/appShell/AppCapabilities";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  closedBackpressure,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  attachWithSnapshotThread,
  eventWithEnvelope,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

const candidateThreadId = "00000000-0000-0000-0000-000000000002";
let threadSwitchProbeSession: ActiveThreadSession | null = null;

function ThreadSwitchCapabilityProbe() {
  const session = useActiveThreadSession();
  const snapshot = useActiveThreadSessionSnapshot();
  const available = snapshot.phase === "active" || snapshot.phase === "projectionUnavailable";
  useEffect(() => {
    threadSwitchProbeSession = session;
  }, [session]);

  return (
    <section aria-label="Thread switch capability probe">
      <button
        disabled={session == null || !available}
        onClick={() => {
          void session?.activate(candidateThreadId);
        }}
        type="button"
      >
        Continue candidate thread
      </button>
      <output aria-label="Active thread session">{available ? snapshot.threadId : "none"}</output>
      <output aria-label="Active skill catalog status">
        {available ? snapshot.skills.type : "none"}
      </output>
      <output aria-label="Active skill catalog">
        {available
          ? snapshot.skills.candidates.map(({ name }) => name).join(",") || "none"
          : "none"}
      </output>
    </section>
  );
}

const requireThreadSwitchProbeSession = (): ActiveThreadSession => {
  if (threadSwitchProbeSession == null) {
    throw new Error("thread switch probe must expose an active session");
  }
  return threadSwitchProbeSession;
};

const waitForThreadSwitchProbeSession = async () => {
  await expect
    .poll(() => {
      const snapshot = threadSwitchProbeSession?.getSnapshot();
      return snapshot?.phase === "active" || snapshot?.phase === "projectionUnavailable";
    })
    .toBe(true);
  const session = requireThreadSwitchProbeSession();
  const snapshot = session.getSnapshot();
  if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") {
    throw new Error("thread switch probe session must be available");
  }
  return { session, snapshot };
};

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  threadSwitchProbeSession = null;
});

const getAppComposer = (screen: Awaited<ReturnType<typeof renderWithProviders>>) =>
  screen.getByRole("combobox", { name: "Message Codex", exact: true });

const renderReadyApp = async (commandHandle = createGuiHostCommands()) => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  queueAttachProjectionResponse(commandHandle);
  initializeHost(options, commandHandle);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");

  return { commandHandle, options, screen };
};

const initializeAppWithProjection = (
  options: StartGuiHostConnectionOptions,
  response = attachResponse,
  commands = createGuiHostCommands(),
): GuiHostCommands => {
  queueAttachProjectionResponse(commands, response);
  initializeHost(options, commands);
  return commands;
};

const expectAppComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "false");
  for (const control of [
    screen.getByRole("button", { name: "Send", exact: true }),
    screen.getByRole("button", { name: "Stop" }),
  ]) {
    await expect.element(control).toBeDisabled();
  }
};

test("App stops forwarding runtime events after backpressure pauses synchronization", async () => {
  const { store } = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchCapabilityProbe} />,
  );
  const projectionEvent = eventTurnStarted;
  const projectionClosed = closedBackpressure;

  const options = getHostOptions(startGuiHostConnectionMock);
  initializeAppWithProjection(options);
  const { session } = await waitForThreadSwitchProbeSession();
  emitProjectionClosed(options, projectionClosed);
  await expect.poll(() => session.getSnapshot().phase).toBe("projectionUnavailable");
  const unavailableSnapshot = session.getSnapshot();
  if (unavailableSnapshot.phase !== "projectionUnavailable") {
    throw new Error("expected projectionUnavailable");
  }
  const runtimeAfterClose = selectThreadRuntimeRecord(store.getState(), launchThreadId);
  emitProjectionEvent(options, projectionEvent);

  expect(unavailableSnapshot).toMatchObject({
    phase: "projectionUnavailable",
    reason: "backpressure",
    recovery: { pending: false, error: null },
    threadId: launchThreadId,
  });
  expect(selectThreadRuntimeRecord(store.getState(), launchThreadId)).toBe(runtimeAfterClose);
});

test("App disables composer after projection backpressure pauses synchronization", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);
  const projectionClosed = closedBackpressure;
  emitProjectionClosed(options, projectionClosed);

  await expectAppComposerDisabled(screen);
});

test("App retains transcript and draft read-only after a normal host close", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commandHandle = initializeAppWithProjection(options, attachWithCommittedMessages());
  const composer = screen.getByRole("region", { name: "Message composer" });
  const input = getAppComposer(screen);

  await expect.element(input).toHaveAttribute("contenteditable", "true");
  await input.fill("Keep this draft after closing");
  const editor = input.element();
  options.onCommandsUnavailable?.();
  options.onStatus?.({ label: "closed" });

  await expect.element(screen.getByText("Connection closed", { exact: true })).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Content may not be up to date. Your conversations and input are still here.",
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Committed App response", { exact: true })).toBeVisible();
  await expect.element(composer).toBeVisible();
  await expectAppComposerDisabled(screen);
  await expect.element(input).toHaveTextContent("Keep this draft after closing");
  expect(input.element()).toBe(editor);
  expect(startGuiHostConnectionMock).toHaveBeenCalledTimes(1);
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("App retains projection failure diagnostics when the host connection closes", async () => {
  const { options, screen } = await renderReadyApp();
  emitProjectionClosed(options, closedBackpressure);
  await expect
    .element(screen.getByText("Message synchronization paused", { exact: true }))
    .toBeVisible();
  options.onCommandsUnavailable?.();
  options.onStatus?.({ label: "closed" });

  await expect.element(screen.getByText("Connection closed", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("Message synchronization paused", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Restore sync", exact: true }))
    .toBeDisabled();
  await screen.getByRole("button", { name: "View diagnostic information", exact: true }).click();
  await expect
    .element(screen.getByRole("dialog", { name: "Diagnostic information", exact: true }))
    .toHaveTextContent("backpressure");
  expect(startGuiHostConnectionMock).toHaveBeenCalledTimes(1);
});

test("App records a synchronization pause when a projection event breaks the baseline", async () => {
  await renderWithProviders(<App currentTaskComponent={ThreadSwitchCapabilityProbe} />);
  const projectionEvent = eventItemStarted;

  const options = getHostOptions(startGuiHostConnectionMock);
  initializeAppWithProjection(options);
  const { session } = await waitForThreadSwitchProbeSession();
  emitProjectionEvent(options, projectionEvent);

  await expect
    .poll(() => session.getSnapshot())
    .toMatchObject({
      phase: "projectionUnavailable",
      reason: "commitChainMismatch",
      recovery: { pending: false, error: null },
      threadId: launchThreadId,
    });
});

test("CurrentTaskPage retains its draft, transcript and diagnostics through failed and successful sync restoration", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const baseline = attachWithCommittedMessages();
  const commands = initializeAppWithProjection(options, baseline);
  const input = getAppComposer(screen);
  await expect.element(input).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByText("Committed App response", { exact: true })).toBeVisible();
  await input.fill("Keep this unsent draft");
  const editor = input.element();
  emitProjectionClosed(options, closedBackpressure);
  await expect
    .element(screen.getByText("Message synchronization paused", { exact: true }))
    .toBeVisible();
  const restore = screen.getByRole("button", { name: "Restore sync", exact: true });
  const restoreButton = restore.element();
  if (!(restoreButton instanceof HTMLButtonElement))
    throw new Error("Recovery action must be a button");
  queueAttachProjectionError(commands, new Error("First recovery unavailable"));
  await restore.click();
  await expect
    .element(
      screen.getByText("Synchronization could not be restored. You can try again.", {
        exact: true,
      }),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Committed App response", { exact: true })).toBeVisible();
  const pending = queueDeferredAttachProjection(commands);
  await restore.click();
  await expect
    .element(screen.getByRole("button", { name: "Restoring sync…", exact: true }))
    .toBeDisabled();
  expect(screen.getByRole("button", { name: "Restoring sync…", exact: true }).element()).toBe(
    restoreButton,
  );
  restoreButton.click();
  expect(commands.attachThreadProjection).toHaveBeenCalledTimes(3);
  await expect
    .element(
      screen.getByText("Synchronization could not be restored. You can try again.", {
        exact: true,
      }),
    )
    .toBeVisible();
  await screen.getByRole("button", { name: "View diagnostic information", exact: true }).click();
  const diagnostics = screen.getByRole("dialog", { name: "Diagnostic information", exact: true });
  await expect.element(diagnostics).toHaveTextContent("First recovery unavailable");
  pending.reject(new Error("Second recovery unavailable"));
  await expect.element(diagnostics).toHaveTextContent("Second recovery unavailable");
  await diagnostics.getByRole("button", { name: "Close diagnostics", exact: true }).click();
  await expect.element(restore).toBeEnabled();
  const success = queueDeferredAttachProjection(commands);
  await restore.click();
  await expect.element(input).toHaveTextContent("Keep this unsent draft");
  await expect.element(screen.getByText("Committed App response", { exact: true })).toBeVisible();
  success.resolve(
    attachWithSnapshotThread(baseline, baseline.snapshot.thread, "recovered-subscription"),
  );
  await expect
    .element(screen.getByText("Message synchronization paused", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(input).toHaveAttribute("contenteditable", "true");
  await expect.element(input).toHaveTextContent("Keep this unsent draft");
  expect(input.element()).toBe(editor);
  emitProjectionClosed(options, closedBackpressure);
  await expect.element(input).toHaveAttribute("contenteditable", "true");
  expect(commands.detachThreadProjection).not.toHaveBeenCalled();
  expect(commands.startTurn).not.toHaveBeenCalled();
});

test("CurrentTaskPage explains a broken commit chain without duplicating the transcript notice", async () => {
  const { options, screen } = await renderReadyApp();
  emitProjectionEvent(options, eventItemStarted);
  await expect
    .element(
      screen.getByText(
        "Message updates arrived out of order, so the conversation may be incomplete.",
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Restore sync", exact: true }))
    .toBeEnabled();
  await expect
    .element(screen.getByText("Connection interrupted. Reconnect required.", { exact: true }))
    .not.toBeInTheDocument();
});

test("CurrentTaskPage explains a missing turn from a legal projection event", async () => {
  const { options, screen } = await renderReadyApp();
  emitProjectionEvent(
    options,
    eventWithEnvelope(eventItemStarted, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );
  await expect
    .element(
      screen.getByText(
        "A message update is missing its associated turn, so it cannot be fully displayed.",
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Restore sync", exact: true }))
    .toBeEnabled();
});
