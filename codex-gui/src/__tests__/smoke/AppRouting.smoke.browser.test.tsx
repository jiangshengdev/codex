import { toast } from "@heroui/react";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  launchThreadId,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
  type StartGuiHostConnectionMock,
} from "../appBrowserTestSupport";
import { createDeferred as deferred } from "../testDeferred";
import type {
  ActiveThreadActivationOutcome,
  ActiveThreadSessionController,
  createActiveThreadSession,
  CreateActiveThreadSessionInput,
} from "@/features/activeThreadSession/activeThreadSession";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";

const activeThreadSessionFactoryState: {
  controller: ActiveThreadSessionController | null;
} = vi.hoisted(() => ({ controller: null }));

vi.mock("@/features/activeThreadSession/activeThreadSession", async (importOriginal) => {
  const actual = await importOriginal<{
    createActiveThreadSession: typeof createActiveThreadSession;
  }>();
  return {
    createActiveThreadSession: (input: CreateActiveThreadSessionInput) => {
      const controller = activeThreadSessionFactoryState.controller;
      return controller ?? actual.createActiveThreadSession(input);
    },
  };
});

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

const historyThreadId = "00000000-0000-0000-0000-000000000002";

beforeEach(() => {
  activeThreadSessionFactoryState.controller = null;
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
});

afterEach(() => {
  toast.clear();
});

const installActiveThreadSessionController = (
  sessionHarness: ReturnType<typeof createActiveThreadSessionHarness>,
  activateRecoveryThread: ActiveThreadSessionController["activateRecoveryThread"] = () =>
    sessionHarness.activate(launchThreadId),
): ActiveThreadSessionController => {
  const controller: ActiveThreadSessionController = {
    session: sessionHarness.session,
    activateRecoveryThread:
      vi.fn<ActiveThreadSessionController["activateRecoveryThread"]>(activateRecoveryThread),
    handleProjectionEvent: vi.fn<ActiveThreadSessionController["handleProjectionEvent"]>(),
    handleProjectionDelta: vi.fn<ActiveThreadSessionController["handleProjectionDelta"]>(),
    handleProjectionClosed: vi.fn<ActiveThreadSessionController["handleProjectionClosed"]>(),
    handleSkillsChanged: vi.fn<ActiveThreadSessionController["handleSkillsChanged"]>(),
    handleThreadStatusChanged: vi.fn<ActiveThreadSessionController["handleThreadStatusChanged"]>(),
    connectionUnavailable: vi.fn<ActiveThreadSessionController["connectionUnavailable"]>(),
    dispose: vi.fn<ActiveThreadSessionController["dispose"]>(),
  };
  activeThreadSessionFactoryState.controller = controller;
  return controller;
};

test("route sync observes the active thread only after atomic startup publication", async () => {
  seedBrowserAuthorizationSession({ token: "task-secret", activeThreadId: launchThreadId });
  const startup = deferred<ActiveThreadActivationOutcome>();
  const sessionHarness = createActiveThreadSessionHarness({ activate: () => startup.promise });
  installActiveThreadSessionController(sessionHarness);
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const initialHistoryLength = router.history.length;
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);

  initializeHost(options, createGuiHostCommands());

  await expect.poll(() => sessionHarness.activate.mock.calls.length).toBe(1);
  sessionHarness.publish(sessionHarness.activeSnapshot({ threadId: historyThreadId }));

  await expect.poll(sessionHarness.listenerCount).toBe(0);
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${launchThreadId}`);
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .not.toBeInTheDocument();

  startup.resolve({ type: "ready", threadId: historyThreadId, warnings: [] });

  await expect.poll(() => router.state.location.pathname).toBe(`/task/${historyThreadId}`);
  await expect.poll(() => router.history.length).toBe(initialHistoryLength);
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toBeVisible();
});
