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
  const commands = createGuiHostCommands();
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
    dispose: vi.fn<ActiveThreadSessionController["dispose"]>(),
  };
  activeThreadSessionFactoryState.controller = controller;
  return controller;
};

test("history waits for startup activation before publishing a settled empty session", async () => {
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
  await expect.element(screen.getByText("Loading history…", { exact: true })).toBeVisible();
  await expect.poll(sessionHarness.listenerCount).toBe(0);
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

test("history publishes a settled startup failure without entering the empty-context branch", async () => {
  seedBrowserAuthorizationSession({ token: "history-secret" });
  const sessionHarness = createActiveThreadSessionHarness();
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
  await expect.element(alert).toHaveTextContent("Unable to load history");
  await expect.element(alert).toHaveTextContent("resume: startup recovery failed");
  await expect
    .element(alert)
    .not.toHaveTextContent("Open an active task in this browser tab before viewing its history.");
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
  await historyCard.getByRole("button", { name: "View" }).click();

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

test("aligns the wider history list with the top bar without widening current or detail routes", async () => {
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
      expectHorizontalAlignment(bannerBounds, routeContentBounds);
      return routeContentBounds;
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
    const historyBounds = alignedRouteBounds(screen.getByRole("main").element());
    expect(historyBounds.width).toBeGreaterThan(currentBounds.width);
    expectCanonicalRoute(router.state.location.href, "/history", 0);

    await historyCard.getByRole("button", { name: "View" }).click();

    await expect
      .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
      .toBeVisible();
    const detailBounds = alignedRouteBounds(screen.getByRole("main").element());
    expectHorizontalAlignment(currentBounds, detailBounds);
    expect(Math.abs(currentBounds.width - detailBounds.width)).toBeLessThanOrEqual(1);
    expect(historyBounds.width).toBeGreaterThan(detailBounds.width);
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
  await expect.element(screen.getByRole("banner").getByText("Read-only history")).toBeVisible();
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

  await screen.getByRole("button", { name: "Back to history", exact: true }).click();
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
    const headingElement = heading.element();
    expect(headingElement.scrollWidth).toBeGreaterThan(headingElement.clientWidth);
    expect(getComputedStyle(headingElement).textOverflow).toBe("ellipsis");
    expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
    const banner = screen.getByRole("banner");
    for (const control of [
      banner.getByRole("button", { name: "Menu", exact: true }),
      banner.getByRole("button", { name: "Back to history", exact: true }),
      banner.getByText("Read-only history", { exact: true }),
    ]) {
      await expect.element(control).toBeVisible();
      const bounds = control.element().getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
    }
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
    expect(commands.resumeThread).not.toHaveBeenCalled();
    expect(commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: historyThreadId,
    });
    expect(commands.detachThreadProjection).not.toHaveBeenCalled();
    expect(storageSetItem).toHaveBeenCalledOnce();
    const storedSession = consumeBrowserAuthorizationSession({
      location: new URL("https://codex.test/browser-authorization-session-read"),
      replaceState: () => undefined,
      storage: window.sessionStorage,
    });
    expect(storedSession.getSnapshot()).toStrictEqual({
      token: "detail-secret",
      activeThreadId: historyThreadId,
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
    const operationDiagnostic = alert.getByText("Operation diagnostic:", { exact: false });
    await expect.element(operationDiagnostic).not.toBeInTheDocument();
    await alert.getByRole("button", { name: "View diagnostic information" }).click();
    await expect.element(operationDiagnostic).toHaveTextContent("attach failed");
    await expect.element(operationDiagnostic).toBeVisible();
    expect(commands.resumeThread).not.toHaveBeenCalled();
    expect(commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: historyThreadId,
    });
    expect(storageSetItem).not.toHaveBeenCalled();
    await expect
      .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
      .not.toBeInTheDocument();
    expectCanonicalRoute(router.state.location.href, `/history/${historyThreadId}`, 1);
    expect(router.history.length).toBe(initialHistoryLength);
  } finally {
    storageSetItem.mockRestore();
  }
});

test("opens a historical task and keeps its cleanup warning visible after replacing the detail route", async () => {
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
  await expect.element(screen.getByText("Task opened", { exact: true })).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "The previous task connection could not be fully cleaned up. Later state may be affected.",
        { exact: true },
      ),
    )
    .toBeVisible();
  expect(commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
  });
  expect(commands.resumeThread).toHaveBeenCalledExactlyOnceWith({ threadId: historyThreadId });
  expect(commands.attachThreadProjection).toHaveBeenLastCalledWith({ threadId: historyThreadId });
});
