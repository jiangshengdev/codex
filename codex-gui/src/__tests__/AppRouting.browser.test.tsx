import { toast } from "@heroui/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  attachResponse,
  createGuiHostCommands,
  getAttachProjectionThreadIds,
  getCleanupConnectionCallCount,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { createDeferred as deferred } from "./testDeferred";
import type {
  ActiveThreadActivationOutcome,
  ActiveThreadSessionController,
  createActiveThreadSession,
  CreateActiveThreadSessionInput,
} from "@/features/activeThreadSession/activeThreadSession";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { attachWithThreadId } from "@/features/projection/__tests__/projectionTestBuilders";
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
const historyThread = attachWithThreadId(attachResponse, historyThreadId).snapshot.thread;

const createHistoryCommands = () => {
  const commands = createGuiHostCommands({
    loadedThreadIds: [],
    storedThreadIds: [launchThreadId, historyThreadId],
  });
  vi.mocked(commands.listThreads).mockResolvedValue({
    data: [historyThread],
    nextCursor: null,
    backwardsCursor: null,
  });
  return commands;
};

const expectHorizontalAlignment = (first: DOMRect, second: DOMRect): void => {
  expect(Math.abs(first.left - second.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(first.right - second.right)).toBeLessThanOrEqual(1);
};

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const expectCanonicalRoute = (href: string, pathname: string, expectedUuidCount: number): void => {
  const url = new URL(href, "https://codex.test");
  expect(url.pathname).toBe(pathname);
  expect(url.search).toBe("");
  expect(url.hash).toBe("");
  expect(url.pathname.match(uuidPattern)?.length ?? 0).toBe(expectedUuidCount);
};

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
    suspendRestoredQueue: vi.fn<ActiveThreadSessionController["suspendRestoredQueue"]>(),
    dispose: vi.fn<ActiveThreadSessionController["dispose"]>(),
  };
  activeThreadSessionFactoryState.controller = controller;
  return controller;
};

test("suspends restored queues before rebuilding the connection after a cached page returns", async () => {
  seedBrowserAuthorizationSession({ token: "history-secret" });
  const harness = createActiveThreadSessionHarness();
  const controller = installActiveThreadSessionController(harness, () =>
    Promise.resolve({ type: "empty" }),
  );
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/history"] }));
  await renderWithProviders(<RouterProvider router={router} />);
  initializeHost(getHostOptions(startGuiHostConnectionMock), createHistoryCommands());
  await expect.poll(() => vi.mocked(controller.activateRecoveryThread).mock.calls.length).toBe(1);
  const connections = startGuiHostConnectionMock.mock.calls.length;

  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  expect(controller.suspendRestoredQueue).toHaveBeenCalledOnce();
  window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  expect(controller.suspendRestoredQueue).toHaveBeenCalledTimes(2);
  await expect.poll(() => startGuiHostConnectionMock.mock.calls.length).toBe(connections + 1);
  expect(controller.dispose).toHaveBeenCalledOnce();
});

test("history subscribes to the collection while startup activation is pending", async () => {
  seedBrowserAuthorizationSession({ token: "history-secret" });
  const startup = deferred<ActiveThreadActivationOutcome>();
  const sessionHarness = createActiveThreadSessionHarness();
  const controller = installActiveThreadSessionController(sessionHarness, () => startup.promise);
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/history"] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();

  initializeHost(options, commands);

  await expect.poll(() => vi.mocked(controller.activateRecoveryThread).mock.calls.length).toBe(1);
  await expect.poll(sessionHarness.listenerCount).toBeGreaterThan(0);
  await expect.poll(() => router.state.location.pathname).toBe("/history");

  startup.resolve({ type: "empty" });

  const alert = screen.getByRole("main").getByRole("alert");
  await expect.element(alert).toHaveTextContent("History context unavailable");
  await expect
    .element(alert)
    .toHaveTextContent("Open an active task in this browser tab before viewing its history.");
  await expect.poll(() => sessionHarness.listenerCount()).toBeGreaterThan(0);
  await expect.poll(() => vi.mocked(commands.listThreads).mock.calls.length).toBe(0);
});

test("history leaves collection startup failure details in the global notice", async () => {
  seedBrowserAuthorizationSession({ token: "history-secret" });
  const sessionHarness = createActiveThreadSessionHarness({
    initialCollection: {
      viewedThreadId: null,
      members: [],
      errors: [
        {
          operation: "collectionRead",
          threadId: null,
          error: new Error("startup recovery failed"),
        },
      ],
    },
  });
  installActiveThreadSessionController(sessionHarness, () =>
    Promise.resolve({
      type: "unavailable",
      failure: {
        type: "operationFailed",
        phase: "resume",
        error: new Error("startup recovery failed"),
        cleanupError: null,
      },
    }),
  );
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/history"] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();

  initializeHost(options, commands);

  const alert = screen.getByRole("main").getByRole("alert");
  await expect.element(alert).toHaveTextContent("History context unavailable");
  await expect.element(alert).not.toHaveTextContent("startup recovery failed");
  await expect
    .element(alert)
    .toHaveTextContent("Open an active task in this browser tab before viewing its history.");
  await expect
    .element(screen.getByText("startup recovery failed", { exact: true }))
    .not.toBeInTheDocument();
  const diagnostics = screen.getByRole("button", {
    name: "View diagnostic information",
    exact: true,
  });
  expect(diagnostics.element().closest("[data-app-shell-top-notices]")).not.toBeNull();
  await expect
    .element(alert.getByRole("button", { name: "View diagnostic information" }))
    .not.toBeInTheDocument();
  await diagnostics.click();
  const dialog = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
  await expect.element(dialog.getByText("startup recovery failed", { exact: true })).toBeVisible();
  expect(page.getByText("startup recovery failed", { exact: true }).elements()).toHaveLength(1);
  await dialog.getByRole("button", { name: "Close diagnostics", exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Unable to start Codex GUI", { exact: true }))
    .not.toBeInTheDocument();
  await expect.poll(() => vi.mocked(commands.listThreads).mock.calls.length).toBe(0);
  await expect.poll(() => router.state.location.pathname).toBe("/history");
});

test("history cards open details and preserve one connection across browser back and forward", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  seedBrowserAuthorizationSession({ token: "task-secret" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();
  const listThreads = vi.mocked(commands.listThreads);
  const readThread = vi.mocked(commands.readThread);
  const detailRead = deferred<Awaited<ReturnType<typeof commands.readThread>>>();
  readThread.mockReturnValueOnce(detailRead.promise);
  const firstPageParams = {
    archived: false,
    cwd: attachResponse.snapshot.thread.cwd,
    limit: 25,
    sortDirection: "desc" as const,
    sortKey: "recency_at" as const,
  };

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Current task" }))
    .toBeVisible();
  await expect.poll(() => document.title).toBe("Current task · Codex");
  expectCanonicalRoute(router.state.location.href, `/task/${launchThreadId}`, 1);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);
  scrollTo.mockClear();

  await expect.poll(() => getAttachProjectionThreadIds(commands)).toEqual([launchThreadId]);
  await expect.poll(() => document.title).toBe("Projection fixture · Codex");
  await screen.getByRole("button", { name: "Menu" }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History" })
    .click();

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  await expect.poll(() => document.title).toBe("History · Codex");
  await expect.element(screen.getByRole("main")).toBeInTheDocument();
  await expect.poll(() => listThreads.mock.calls.length).toBe(1);
  await expect.poll(() => scrollTo.mock.calls.length).toBeGreaterThan(0);
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0 });
  expect(listThreads).toHaveBeenNthCalledWith(1, firstPageParams);
  expect(listThreads.mock.calls[0]?.[0]).not.toHaveProperty("cursor");
  expectCanonicalRoute(router.state.location.href, "/history", 0);
  await expect
    .element(screen.getByRole("button", { name: "Scan with phone" }))
    .not.toBeInTheDocument();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  const historyCard = screen.getByRole("article", { name: "Projection fixture" });
  await expect.element(historyCard).toBeVisible();
  await historyCard.getByRole("link", { name: "Projection fixture", exact: true }).click();

  await expect.element(screen.getByRole("status")).toHaveTextContent("Loading task history…");
  await expect.poll(() => document.title).toBe("History detail · Codex");
  expect(readThread).toHaveBeenNthCalledWith(1, {
    threadId: historyThreadId,
    includeTurns: true,
  });

  detailRead.resolve({ thread: historyThread });

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
    .toBeVisible();
  await expect.poll(() => document.title).toBe("Projection fixture · Codex");
  expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
  await screen.getByRole("button", { name: "Scan with phone" }).click();
  const qrDialog = screen.getByRole("dialog", { name: "Scan with phone" });
  await expect
    .element(
      qrDialog.getByText(`${window.location.origin}/history/${historyThreadId}#token=task-secret`),
    )
    .toBeVisible();
  await expect
    .element(qrDialog.getByText(new RegExp(`/task/${launchThreadId}`)))
    .not.toBeInTheDocument();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  scrollTo.mockClear();
  router.history.back();

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  await expect.poll(() => document.title).toBe("History · Codex");
  await expect.poll(() => listThreads.mock.calls.length).toBe(2);
  await expect.poll(() => scrollTo.mock.calls.length).toBeGreaterThan(0);
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0 });
  expect(listThreads).toHaveBeenNthCalledWith(2, firstPageParams);
  expect(listThreads.mock.calls[1]?.[0]).not.toHaveProperty("cursor");
  expectCanonicalRoute(router.state.location.href, "/history", 0);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  readThread.mockRejectedValueOnce(new Error("history read failed"));
  router.history.forward();

  await expect.element(screen.getByRole("alert")).toHaveTextContent("history read failed");
  await expect.poll(() => document.title).toBe("History detail · Codex");
  expect(readThread).toHaveBeenNthCalledWith(2, {
    threadId: historyThreadId,
    includeTurns: true,
  });
  expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.getByRole("button", { name: "Menu" }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Current task" })
    .click();

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.poll(() => document.title).toBe("Projection fixture · Codex");
  expectCanonicalRoute(router.state.location.href, `/task/${launchThreadId}`, 1);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.unmount();

  expect(getCleanupConnectionCallCount()).toBe(1);
  scrollTo.mockRestore();
});

test("aligns history, current task, and detail content with their top bars", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  let unmount: (() => Promise<void>) | null = null;

  try {
    await page.viewport(1440, 900);
    seedBrowserAuthorizationSession({ token: "task-secret" });
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
    );
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    unmount = screen.unmount;
    const options = getHostOptions(startGuiHostConnectionMock);
    const commands = createHistoryCommands();
    const readThread = vi.mocked(commands.readThread);

    queueAttachProjectionResponse(commands);
    initializeHost(options, commands);

    const alignedRouteBounds = (routeContent: Element): DOMRect => {
      const bannerContent = screen.getByRole("banner").element().firstElementChild;
      if (!(bannerContent instanceof HTMLElement) || !(routeContent instanceof HTMLElement)) {
        throw new Error("Expected the app shell banner content and route content elements");
      }

      const bannerBounds = bannerContent.getBoundingClientRect();
      const routeContentBounds = routeContent.getBoundingClientRect();
      const bannerStyle = getComputedStyle(bannerContent);
      const routeStyle = getComputedStyle(routeContent);
      const bannerLeft = bannerBounds.left + parseFloat(bannerStyle.paddingLeft);
      const bannerRight = bannerBounds.right - parseFloat(bannerStyle.paddingRight);
      const routeLeft = routeContentBounds.left + parseFloat(routeStyle.paddingLeft);
      const routeRight = routeContentBounds.right - parseFloat(routeStyle.paddingRight);
      const contentBounds = new DOMRect(
        routeLeft,
        routeContentBounds.top,
        routeRight - routeLeft,
        routeContentBounds.height,
      );
      expectHorizontalAlignment(
        new DOMRect(bannerLeft, bannerBounds.top, bannerRight - bannerLeft, bannerBounds.height),
        contentBounds,
      );
      return contentBounds;
    };

    await expect
      .element(screen.getByRole("region", { name: "Committed transcript" }))
      .toBeVisible();
    const currentContent = screen.getByRole("main").element().firstElementChild;
    if (currentContent == null) {
      throw new Error("Expected the current task route content element");
    }
    const currentBounds = alignedRouteBounds(currentContent);
    expectCanonicalRoute(router.state.location.href, `/task/${launchThreadId}`, 1);

    await screen.getByRole("button", { name: "Menu" }).click();
    await screen
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "History" })
      .click();

    const historyCard = screen.getByRole("article", { name: "Projection fixture" });
    await expect.element(historyCard).toBeVisible();
    alignedRouteBounds(screen.getByRole("main").element());
    expectCanonicalRoute(router.state.location.href, "/history", 0);

    await historyCard.getByRole("link", { name: "Projection fixture", exact: true }).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
      .toBeVisible();
    const detailBounds = alignedRouteBounds(screen.getByRole("main").element());
    expectHorizontalAlignment(currentBounds, detailBounds);
    expect(readThread).toHaveBeenCalledWith({
      threadId: historyThreadId,
      includeTurns: true,
    });
    expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
    expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
    expect(getCleanupConnectionCallCount()).toBe(0);
  } finally {
    await unmount?.();
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test.each(["current task", "history list"])(
  "keeps history available after removing the last task from %s and rebuilding the page",
  async (removalRoute) => {
    seedBrowserAuthorizationSession({ token: "history-secret" });
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
    );
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    const commands = createHistoryCommands();
    initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
    await expect.poll(() => document.title).toBe("Projection fixture · Codex");

    if (removalRoute === "history list") {
      await router.navigate({ to: "/history" });
    }
    await expect
      .poll(() => screen.getByRole("article", { name: "Projection fixture" }).elements().length)
      .toBe(removalRoute === "history list" ? 1 : 0);
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await screen
      .getByRole("button", { name: "More options for Projection fixture", exact: true })
      .click();
    await screen.getByRole("menuitem", { name: "Remove from list", exact: true }).click();
    await expect.poll(() => vi.mocked(commands.detachThreadProjection).mock.calls.length).toBe(1);
    await expect
      .poll(
        () =>
          consumeBrowserAuthorizationSession({
            location: new URL("https://codex.test/history"),
            replaceState: () => undefined,
          }).getSnapshot().activeThreadId,
      )
      .toBeNull();
    await expect.poll(() => router.state.location.pathname).toBe("/history");
    expect(commands.readThread).not.toHaveBeenCalledWith({
      threadId: launchThreadId,
      includeTurns: true,
    });
    if (removalRoute === "history list") {
      await screen
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("button", { name: "History", exact: true })
        .click();
    }
    await expect.element(screen.getByRole("article", { name: "Projection fixture" })).toBeVisible();
    expect(commands.listThreads).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cwd: attachResponse.snapshot.thread.cwd,
      }),
    );
    await screen.unmount();

    const restoredRouter = createAppRouter(createMemoryHistory({ initialEntries: ["/history"] }));
    const restored = await renderWithProviders(<RouterProvider router={restoredRouter} />);
    const restoredCommands = createHistoryCommands();
    initializeHost(getHostOptions(startGuiHostConnectionMock), restoredCommands);
    await expect
      .element(restored.getByRole("article", { name: "Projection fixture" }))
      .toBeVisible();
    expect(restoredCommands.listThreads).toHaveBeenCalledExactlyOnceWith({
      archived: false,
      cwd: attachResponse.snapshot.thread.cwd,
      limit: 25,
      sortDirection: "desc",
      sortKey: "recency_at",
    });
    expect(restoredCommands.attachThreadProjection).not.toHaveBeenCalled();
    expect(restoredCommands.resumeThread).not.toHaveBeenCalled();
    await restored.getByRole("link", { name: "Projection fixture", exact: true }).click();
    await expect
      .poll(() => restoredRouter.state.location.pathname)
      .toBe(`/history/${historyThreadId}`);
    expect(restoredCommands.readThread).toHaveBeenCalledWith({
      threadId: historyThreadId,
      includeTurns: true,
    });
  },
);

test("history list with token-only authorization fails closed without attaching or listing", async () => {
  seedBrowserAuthorizationSession({ token: "history-secret" });
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/history"] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();

  initializeHost(options, commands);

  const alert = screen.getByRole("alert");
  await expect.element(alert).toHaveTextContent("History context unavailable");
  await expect
    .element(alert)
    .toHaveTextContent("Open an active task in this browser tab before viewing its history.");
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
  expect(commands.listThreads).not.toHaveBeenCalled();
  expectCanonicalRoute(router.state.location.href, "/history", 0);
  await expect
    .element(screen.getByRole("button", { name: "Scan with phone" }))
    .not.toBeInTheDocument();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);
});

test("history detail uses the localized fallback when its task has no name or preview", async () => {
  seedBrowserAuthorizationSession({ token: "detail-secret" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/history/${historyThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();
  vi.mocked(commands.readThread).mockResolvedValueOnce({
    thread: { ...historyThread, name: "", preview: "" },
  });

  initializeHost(options, commands);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Untitled task" }))
    .toBeVisible();
  await expect.poll(() => document.title).toBe("Untitled task · Codex");
  expect(commands.readThread).toHaveBeenCalledExactlyOnceWith({
    threadId: historyThreadId,
    includeTurns: true,
  });
  expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
});

test("history titles follow route identity through loading, error, retry, and unmount", async () => {
  seedBrowserAuthorizationSession({ token: "detail-secret" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/history/${historyThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createHistoryCommands();
  const nextRead = deferred<Awaited<ReturnType<typeof commands.readThread>>>();
  const returnRead = deferred<Awaited<ReturnType<typeof commands.readThread>>>();
  const readThread = vi
    .mocked(commands.readThread)
    .mockResolvedValueOnce({ thread: { ...historyThread, name: "First preview" } })
    .mockReturnValueOnce(nextRead.promise)
    .mockResolvedValueOnce({
      thread: { ...historyThread, id: launchThreadId, name: "Second preview" },
    })
    .mockReturnValueOnce(returnRead.promise);
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  const heading = screen.getByRole("banner").getByRole("heading", { level: 1 });

  await expect.element(heading).toHaveTextContent("First preview");
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
  await expect
    .element(screen.getByRole("banner").getByText("Read-only history"))
    .not.toBeInTheDocument();
  await router.navigate({ to: "/history/$threadId", params: { threadId: launchThreadId } });
  await expect.element(heading).toHaveTextContent("History detail");
  await expect.element(screen.getByText("First preview", { exact: true })).not.toBeInTheDocument();
  await expect.poll(() => document.title).toBe("History detail · Codex");

  nextRead.reject(new Error("second preview failed"));
  await expect.element(screen.getByRole("alert")).toHaveTextContent("second preview failed");
  await expect.element(heading).toHaveTextContent("History detail");
  await screen.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.element(heading).toHaveTextContent("Second preview");
  await expect.poll(() => document.title).toBe("Second preview · Codex");
  expect(readThread).toHaveBeenCalledTimes(3);
  expect(readThread).toHaveBeenNthCalledWith(2, { threadId: launchThreadId, includeTurns: true });
  expect(readThread).toHaveBeenNthCalledWith(3, { threadId: launchThreadId, includeTurns: true });

  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History", exact: true })
    .click();
  await expect.element(heading).toHaveTextContent(/^History$/);
  await expect
    .element(screen.getByText("Read-only history", { exact: true }))
    .not.toBeInTheDocument();
  await expect.poll(() => document.title).toBe("History · Codex");
  await router.navigate({ to: "/history/$threadId", params: { threadId: launchThreadId } });
  await expect.element(heading).toHaveTextContent("History detail");
  await expect.poll(() => document.title).toBe("History detail · Codex");
  returnRead.resolve({
    thread: { ...historyThread, id: launchThreadId, name: "Refreshed preview" },
  });
  await expect.element(heading).toHaveTextContent("Refreshed preview");
  expect(readThread).toHaveBeenCalledTimes(4);
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
  expect(commands.resumeThread).not.toHaveBeenCalled();
});

test("long preview titles retain their full accessible name while the compact header fits a narrow screen", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  let unmount: (() => Promise<void>) | null = null;
  try {
    await page.viewport(360, 800);
    seedBrowserAuthorizationSession({ token: "detail-secret" });
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/history/${historyThreadId}`] }),
    );
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    unmount = screen.unmount;
    const commands = createHistoryCommands();
    const title = "Long preview task ".repeat(10).trim();
    vi.mocked(commands.readThread).mockResolvedValueOnce({
      thread: { ...historyThread, name: title },
    });
    initializeHost(getHostOptions(startGuiHostConnectionMock), commands);

    const heading = screen.getByRole("heading", { level: 1, name: title, exact: true });
    await expect.element(heading).toBeVisible();
    await expect.element(heading).toHaveAccessibleName(title);
    await expect.poll(() => document.title).toBe(`${title.slice(0, 51)}… · Codex`);
    expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
    const banner = screen.getByRole("banner");
    for (const control of [banner.getByRole("button", { name: "Menu", exact: true }), heading]) {
      await expect.element(control).toBeVisible();
      const bounds = control.element().getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
    }
    await expect
      .element(banner.getByRole("button", { name: "Back to history", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(banner.getByText("Read-only history", { exact: true }))
      .not.toBeInTheDocument();
    const menuBounds = banner
      .getByRole("button", { name: "Menu", exact: true })
      .element()
      .getBoundingClientRect();
    const headingBounds = heading.element().getBoundingClientRect();
    expect(headingBounds.left).toBeGreaterThan(menuBounds.right);
    expect(headingBounds.right).toBeCloseTo(window.innerWidth - menuBounds.left, 0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    expect(commands.readThread).toHaveBeenCalledExactlyOnceWith({
      threadId: historyThreadId,
      includeTurns: true,
    });
    expect(commands.attachThreadProjection).not.toHaveBeenCalled();
    expect(commands.resumeThread).not.toHaveBeenCalled();
  } finally {
    await unmount?.();
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("pure read-only history detail reads the route thread without attaching", async () => {
  seedBrowserAuthorizationSession({ token: "detail-secret" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/history/${historyThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();
  const readThread = vi.mocked(commands.readThread);

  initializeHost(options, commands);

  await expect.poll(() => readThread.mock.calls.length).toBe(1);
  expect(readThread).toHaveBeenCalledWith({
    threadId: historyThreadId,
    includeTurns: true,
  });
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
  expect(commands.resumeThread).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Menu" }).click();
  const currentTaskAction = screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Current task" });
  await expect.element(currentTaskAction).toBeDisabled();
  expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);
});

test("pure read-only history detail activates its first task and replaces the route", async () => {
  window.history.replaceState({}, "", `/history/${historyThreadId}`);
  seedBrowserAuthorizationSession({ token: "detail-secret" });
  const storageSetItem = vi.spyOn(Storage.prototype, "setItem");
  storageSetItem.mockClear();

  try {
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/history/${historyThreadId}`] }),
    );
    const initialHistoryLength = router.history.length;
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    const options = getHostOptions(startGuiHostConnectionMock);
    const commands = createHistoryCommands();
    const candidateAttach = attachWithThreadId(attachResponse, historyThreadId);
    vi.mocked(commands.readThread).mockResolvedValueOnce({ thread: historyThread });
    queueAttachProjectionResponse(commands, candidateAttach);

    initializeHost(options, commands);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
      .toBeVisible();
    expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
    const continueButton = screen.getByRole("button", { name: "Continue this task", exact: true });
    await expect.element(continueButton).toBeEnabled();
    expect(commands.resumeThread).not.toHaveBeenCalled();
    expect(commands.attachThreadProjection).not.toHaveBeenCalled();

    await continueButton.click();

    await expect
      .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
      .toBeVisible();
    expect(commands.resumeThread).toHaveBeenCalledExactlyOnceWith({ threadId: historyThreadId });
    expect(commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: historyThreadId,
    });
    expect(commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(
      storageSetItem.mock.calls.filter(
        ([key]) => key === "codex-gui.browserAuthorizationSession.v1",
      ),
    ).toHaveLength(1);
    const storedSession = consumeBrowserAuthorizationSession({
      location: new URL("https://codex.test/browser-authorization-session-read"),
      replaceState: () => undefined,
      storage: window.sessionStorage,
    });
    expect(storedSession.getSnapshot()).toStrictEqual({
      token: "detail-secret",
      activeThreadId: historyThreadId,
      historyCwd: attachResponse.snapshot.thread.cwd,
    });
    expectCanonicalRoute(router.state.location.href, `/task/${historyThreadId}`, 1);
    expect(router.history.length).toBe(initialHistoryLength);
  } finally {
    storageSetItem.mockRestore();
  }
});

test("pure read-only history detail preserves its route when first activation fails", async () => {
  window.history.replaceState({}, "", `/history/${historyThreadId}`);
  seedBrowserAuthorizationSession({ token: "detail-secret" });
  const storageSetItem = vi.spyOn(Storage.prototype, "setItem");
  storageSetItem.mockClear();

  try {
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/history/${historyThreadId}`] }),
    );
    const initialHistoryLength = router.history.length;
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    const options = getHostOptions(startGuiHostConnectionMock);
    const commands = createHistoryCommands();
    vi.mocked(commands.readThread).mockResolvedValueOnce({ thread: historyThread });
    vi.mocked(commands.attachThreadProjection).mockRejectedValueOnce(new Error("attach failed"));

    initializeHost(options, commands);

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
      .toBeVisible();
    expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
    const continueButton = screen.getByRole("button", { name: "Continue this task", exact: true });
    await expect.element(continueButton).toBeEnabled();
    expect(commands.resumeThread).not.toHaveBeenCalled();
    expect(commands.attachThreadProjection).not.toHaveBeenCalled();

    await continueButton.click();

    const alert = screen.getByRole("alert");
    await expect.element(alert).toHaveTextContent("Unable to continue this task");
    await expect
      .element(alert.getByText("The task connection could not be prepared.", { exact: true }))
      .toBeVisible();
    const operationDiagnostic = page.getByText("Operation diagnostic:", { exact: false });
    await expect.element(operationDiagnostic).not.toBeInTheDocument();
    await alert.getByRole("button", { name: "View diagnostic information" }).click();
    await expect.element(operationDiagnostic).toHaveTextContent("attach failed");
    await expect.element(operationDiagnostic).toBeVisible();
    await page
      .getByRole("dialog", { name: "Diagnostic information" })
      .getByRole("button", { name: "Close diagnostics" })
      .click();
    await expect
      .element(page.getByRole("dialog", { name: "Diagnostic information" }))
      .not.toBeInTheDocument();
    expect(commands.resumeThread).toHaveBeenCalledExactlyOnceWith({ threadId: historyThreadId });
    expect(commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: historyThreadId,
    });
    expect(
      storageSetItem.mock.calls.filter(
        ([key]) => key === "codex-gui.browserAuthorizationSession.v1",
      ),
    ).toHaveLength(0);
    await expect
      .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
      .not.toBeInTheDocument();
    expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
    expect(router.history.length).toBe(initialHistoryLength);
  } finally {
    storageSetItem.mockRestore();
  }
});

test("history Continue reports a loaded-query failure and rechecks loading when retried", async () => {
  window.history.replaceState({}, "", `/history/${historyThreadId}`);
  seedBrowserAuthorizationSession({ token: "detail-secret" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/history/${historyThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createHistoryCommands();
  vi.mocked(commands.readThread).mockResolvedValueOnce({ thread: historyThread });
  vi.mocked(commands.listLoadedThreads)
    .mockRejectedValueOnce(new Error("Loaded task query unavailable"))
    .mockResolvedValueOnce({ data: [historyThreadId], nextCursor: null });
  queueAttachProjectionResponse(commands, attachWithThreadId(attachResponse, historyThreadId));
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  const continueButton = screen.getByRole("button", { name: "Continue this task", exact: true });
  await expect.element(continueButton).toBeEnabled();

  await continueButton.click();

  const alert = screen.getByRole("alert");
  await expect.element(alert).toHaveTextContent("Unable to continue this task");
  await expect.element(alert).toHaveTextContent("The task connection could not be prepared.");
  expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
  expect(commands.resumeThread).not.toHaveBeenCalled();
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
  await alert.getByRole("button", { name: "View diagnostic information" }).click();
  const diagnostic = page.getByRole("dialog", { name: "Diagnostic information" });
  await expect.element(diagnostic).toHaveTextContent("Loaded task query unavailable");
  await diagnostic.getByRole("button", { name: "Close diagnostics" }).click();
  await expect.element(diagnostic).not.toBeInTheDocument();

  await continueButton.click();

  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toBeVisible();
  expectCanonicalRoute(router.state.location.href, `/task/${historyThreadId}`, 1);
  expect(commands.listLoadedThreads).toHaveBeenCalledTimes(2);
  expect(commands.resumeThread).not.toHaveBeenCalled();
  expect(commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: historyThreadId,
  });
});

test("opens a historical task and retains the previous task without detaching", async () => {
  seedBrowserAuthorizationSession({ token: "detail-secret" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();
  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
    .toBeVisible();
  await expect.poll(() => getAttachProjectionThreadIds(commands)).toEqual([launchThreadId]);

  await router.navigate({
    to: "/history/$threadId",
    params: { threadId: historyThreadId },
  });
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
    .toBeVisible();
  expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);

  const candidateAttach = attachWithThreadId(attachResponse, historyThreadId);
  queueAttachProjectionResponse(commands, candidateAttach);
  vi.mocked(commands.detachThreadProjection).mockRejectedValueOnce(
    new Error("previous owner detach failed"),
  );

  await screen.getByRole("button", { name: "Continue this task", exact: true }).click();

  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toBeVisible();
  expectCanonicalRoute(router.state.location.href, `/task/${historyThreadId}`, 1);
  expect(commands.detachThreadProjection).not.toHaveBeenCalled();
  expect(commands.resumeThread).toHaveBeenLastCalledWith({ threadId: historyThreadId });
  expect(commands.attachThreadProjection).toHaveBeenLastCalledWith({ threadId: historyThreadId });
  await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toBeVisible();
  expect(getAttachProjectionThreadIds(commands)).toEqual([launchThreadId, historyThreadId]);
});
