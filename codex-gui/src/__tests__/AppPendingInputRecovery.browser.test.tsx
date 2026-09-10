import { beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  NEW_TASK_ROUTE_PATH,
} from "@/features/browserLaunch/guiRouteTarget";
import {
  attachWithThreadId,
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  inProgressTurn,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
  createGuiHostCommands,
  emitProjectionEvent,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
} from "./appBrowserTestSupport";
import { eventTurnCompleted } from "@/features/projection/__tests__/projectionFixtures";
import type { TurnSteerResponse } from "@codex-protocol/v2";
import { createComposerInputQueue } from "@/features/composerInputQueue/composerInputQueue";
import { composerQueueMessage } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { createComposerInterruptState } from "@/features/composerInputQueue/composerInterruptState";
import { BrowserPersistenceStore } from "@/features/browserPersistence/browserPersistenceStore";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";

const hostMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: hostMock.startGuiHostConnection,
}));
beforeEach(() => {
  resetAppBrowserTestSupport(hostMock.startGuiHostConnection);
  seedBrowserAuthorizationSession({ token: "pending-edit-recovery-test" });
});

test("shows late accepted guidance in the existing local-stop recovery and sends only on confirmation", async () => {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  let accept!: (response: TurnSteerResponse) => void;
  vi.mocked(commands.steerTurn).mockImplementation(
    () =>
      new Promise((resolve) => {
        accept = resolve;
      }),
  );
  vi.mocked(commands.startTurn).mockImplementation(() => new Promise(() => {}));
  const active = inProgressTurn("late-guide-turn");
  queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, [active]));
  const options = getHostOptions(hostMock.startGuiHostConnection);
  initializeHost(options, commands);
  const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
  await composer.fill("Late guidance");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => vi.mocked(commands.steerTurn).mock.calls.length).toBe(1);
  await composer.fill("Ordinary queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => vi.mocked(commands.interruptTurn).mock.calls.length).toBe(1);
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "late-guide-terminal", {
        ...active,
        status: "interrupted",
      }),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  await expect
    .element(screen.getByText("1 message has not been sent", { exact: true }))
    .toBeVisible();
  accept({ turnId: active.id });
  await expect
    .element(screen.getByText("2 messages have not been sent", { exact: true }))
    .toBeVisible();
  expect(commands.startTurn).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect
    .poll(() => vi.mocked(commands.startTurn).mock.calls[0]?.[0].input)
    .toEqual([{ type: "text", text: "Late guidance", text_elements: [] }]);
  await expect
    .element(screen.getByText("2 messages have not been sent", { exact: true }))
    .not.toBeInTheDocument();
});

test("opens legacy accepted guidance in manual recovery without sending on startup", async () => {
  const queue = createComposerInputQueue({ threadId: launchThreadId, activeTurnId: "legacy-turn" });
  queue.submitSteer(composerQueueMessage("legacy guidance"));
  queue.observe({
    type: "turnCompleted",
    turnId: "legacy-turn",
    status: "completed",
    commitId: "legacy-terminal",
  });
  const state = queue.exportState(null);
  const session = consumeBrowserAuthorizationSession({
    location: new URL("https://codex.test/"),
    replaceState: () => undefined,
    storage: window.sessionStorage,
  });
  const store = new BrowserPersistenceStore({
    authorizationContext: session.getPersistenceContext(),
    threadId: launchThreadId,
    storage: window.sessionStorage,
    codec: { encode: (value: unknown) => value, decode: (value: unknown) => value },
  });
  store.commit(
    {
      version: 1,
      queue: {
        ...state,
        version: 1,
        steer: {
          ...state.steer,
          pending: state.steer.pending.map((entry) => ({
            ...entry,
            phase: "acceptedAwaitingCommit",
          })),
          closedTargets: state.steer.closedTargets.map(({ target, ...identity }) => ({
            ...identity,
            target: { reason: target.reason, rejectionBatch: target.rejectionBatch },
          })),
        },
      },
      draft: null,
      interrupt: createComposerInterruptState().exportState(),
      failedInterruptTurnId: null,
    },
    null,
  );
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  vi.mocked(commands.startTurn).mockImplementation(() => new Promise(() => {}));
  queueAttachProjectionResponse(
    commands,
    attachWithTurns(attachResponse, [baseTurn("legacy-turn")]),
  );
  initializeHost(getHostOptions(hostMock.startGuiHostConnection), commands);
  await expect
    .element(screen.getByText("1 message has not been sent", { exact: true }))
    .toBeVisible();
  expect(commands.startTurn).not.toHaveBeenCalled();
  await screen
    .getByRole("status")
    .getByRole("button", { name: "Continue sending", exact: true })
    .click();
  await expect
    .element(screen.getByText("Restored messages are paused", { exact: true }))
    .not.toBeInTheDocument();
  expect(commands.startTurn).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect
    .poll(() => vi.mocked(commands.startTurn).mock.calls[0]?.[0].input)
    .toEqual(composerQueueMessage("legacy guidance").input);
});

test.each([HISTORY_LIST_ROUTE_PATH, NEW_TASK_ROUTE_PATH, CURRENT_TASK_ROUTE_PATH])(
  "retains the old edit across navigation to %s and preserves the main draft",
  async (to) => {
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
    );
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    const secondThreadId = "00000000-0000-0000-0000-000000000002";
    const commands = createGuiHostCommands({ storedThreadIds: [launchThreadId, secondThreadId] });
    queueAttachProjectionResponse(
      commands,
      attachWithTurns(attachResponse, [inProgressTurn("editing-turn")]),
    );
    initializeHost(getHostOptions(hostMock.startGuiHostConnection), commands);
    const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
    await composer.fill("Original queued message");
    await screen.getByRole("button", { name: "Send", exact: true }).click();
    await composer.fill("Independent main draft");
    await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
    await screen.getByRole("button", { name: "Edit", exact: true }).click();
    await screen
      .getByRole("combobox", { name: "Edit pending message", exact: true })
      .fill("Retain my edit across navigation");
    if (to === CURRENT_TASK_ROUTE_PATH) {
      queueAttachProjectionResponse(
        commands,
        attachWithThreadId(attachWithTurns(attachResponse, []), secondThreadId),
      );
      await router.navigate({ to, params: { threadId: secondThreadId } });
    } else await router.navigate({ to });
    await expect.element(screen.getByRole("alertdialog")).toBeVisible();
    await screen.getByRole("button", { name: "Return to edit", exact: true }).click();
    const retained = screen.getByRole("textbox", { name: "Unsaved pending message", exact: true });
    await expect.element(retained).toHaveValue("Retain my edit across navigation");
    expect(router.state.location.pathname).toBe(
      to === CURRENT_TASK_ROUTE_PATH ? `/task/${secondThreadId}` : to,
    );
    await expect
      .element(screen.getByRole("button", { name: "Save", exact: true }))
      .not.toBeInTheDocument();
    await screen
      .getByRole("dialog")
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await screen
      .getByRole("alertdialog")
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect.element(retained).not.toBeInTheDocument();
    await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
    await expect.element(composer).toHaveTextContent("Independent main draft");
    await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
    await expect
      .element(screen.getByRole("dialog").getByText("Original queued message", { exact: true }))
      .toBeVisible();
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);
