import { expect, test, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { THREAD_QUERY_KEY } from "@codex-gui-host-contract";
import { attachResponse, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import type { AppCapabilities, ContinueThread } from "@/features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import { AppShell } from "@/features/appShell/AppShell";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachWithTurns,
  baseTurn,
  contextCompaction,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/threadSwitchCoordinator";
import { renderWithProviders } from "@/utils/test-utils";
import { ThreadHistoryDetailPage } from "../ThreadHistoryDetailPage";

const detailThreadId = "00000000-0000-0000-0000-000000000088";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
};

const historyThread = (
  turns: typeof attachResponse.snapshot.thread.turns,
  name = "Historical task",
) => ({
  ...attachWithTurns(attachResponse, turns).snapshot.thread,
  id: detailThreadId,
  name,
});

const emptyHistoryThread = () => historyThread([]);

const activeOwner = (threadId: string): ActiveThreadOwnerHandle => ({
  threadId,
  subscriptionId: `subscription-${threadId}`,
  projectionOwner: null as never,
  queueCoordinator: null as never,
});

type CapabilitiesStore = Readonly<{
  getSnapshot: () => AppCapabilities;
  publish: (next: AppCapabilities) => void;
  subscribe: (listener: () => void) => () => void;
}>;

const createCapabilitiesStore = (initial: AppCapabilities): CapabilitiesStore => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    publish: (next) => {
      snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

type RenderDetailOptions = Readonly<{
  commands?: GuiHostCommands | null;
  continueThread?: ContinueThread | null;
  initialEntries?: string[];
  status?: AppCapabilities["status"];
}>;

const renderDetail = async ({
  commands: suppliedCommands,
  continueThread: suppliedContinueThread,
  initialEntries = [`/history/${detailThreadId}`],
  status = { label: "attached" },
}: RenderDetailOptions = {}) => {
  const commands = suppliedCommands === undefined ? createGuiHostCommands() : suppliedCommands;
  const continueThread =
    suppliedContinueThread === undefined
      ? vi
          .fn<ContinueThread>()
          .mockResolvedValue({ type: "current", activeOwner: activeOwner(detailThreadId) })
      : suppliedContinueThread;
  const initialCapabilities: AppCapabilities = {
    activeOwner: null,
    commands,
    continueThread,
    launchParams: { threadId: "live-thread", token: "retained-secret" },
    status,
  };
  const capabilitiesStore = createCapabilitiesStore(initialCapabilities);
  const Root = () => {
    const capabilities = useSyncExternalStore(
      capabilitiesStore.subscribe,
      capabilitiesStore.getSnapshot,
      capabilitiesStore.getSnapshot,
    );
    return (
      <AppCapabilitiesProvider capabilities={capabilities}>
        <AppShell>
          <Outlet />
        </AppShell>
      </AppCapabilitiesProvider>
    );
  };
  const CurrentTask = () => <main aria-label="Current task" />;
  const HistoryList = () => <main aria-label="History list" />;
  const Origin = () => <main aria-label="Origin" />;
  const rootRoute = createRootRoute({ component: Root });
  const currentTaskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: CurrentTask,
  });
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/history",
    component: HistoryList,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/history/$threadId",
    component: ThreadHistoryDetailPage,
  });
  const originRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/origin",
    component: Origin,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries }),
    routeTree: rootRoute.addChildren([currentTaskRoute, historyRoute, detailRoute, originRoute]),
  });
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  return {
    capabilitiesStore,
    commands,
    continueThread,
    initialCapabilities,
    router,
    screen,
  };
};

test("loads with exact read parameters, preserves the complete error, and retries into empty history", async () => {
  const initialRead = deferred<Awaited<ReturnType<GuiHostCommands["readThread"]>>>();
  const readThread = vi
    .fn<GuiHostCommands["readThread"]>()
    .mockReturnValueOnce(initialRead.promise)
    .mockResolvedValueOnce({ thread: emptyHistoryThread() });
  const commands = { ...createGuiHostCommands(), readThread };
  const { screen } = await renderDetail({ commands });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Loading task history…");
  expect(readThread).toHaveBeenCalledExactlyOnceWith({
    threadId: detailThreadId,
    includeTurns: true,
  });

  const rawFailure = new Error("complete thread/read failure: request id 88");
  initialRead.reject(rawFailure);
  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to load task history")).toBeVisible();
  await expect.element(alert.getByText(rawFailure.message, { exact: true })).toBeVisible();
  await alert.getByRole("button", { name: "Retry" }).click();

  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  expect(readThread).toHaveBeenCalledTimes(2);
  expect(commands.resumeThread).not.toHaveBeenCalled();
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
});

test("shows a terminal connection error without an invalid Retry before commands exist", async () => {
  const { screen } = await renderDetail({
    commands: null,
    continueThread: null,
    status: { label: "closed" },
  });

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("The task connection was closed.")).toBeVisible();
  await expect.element(alert.getByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  await expect.element(screen.getByText("Loading task history…")).not.toBeInTheDocument();
});

test("retains a loaded read-only snapshot when commands later become unavailable", async () => {
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { capabilitiesStore, initialCapabilities, screen } = await renderDetail({ commands });

  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  capabilitiesStore.publish({
    ...initialCapabilities,
    commands: null,
    continueThread: null,
    status: { label: "closed" },
  });

  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  await expect.element(screen.getByText("The task connection was closed.")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Continue this task" })).toBeDisabled();
});

test("renders isolated context pages without Composer and keeps the transcript end above the fixed primary action", async () => {
  const finalMessage = `${Array.from(
    { length: 80 },
    (_, index) => `Read-only history line ${String(index + 1)}`,
  ).join("\n")}\nEnd of read-only history`;
  const thread = historyThread([
    baseTurn("history-turn-1", [
      userMessage("history-user-1", [textInput("First historical context page")]),
    ]),
    baseTurn("history-turn-2", [
      contextCompaction("history-compaction-2"),
      userMessage("history-user-2", [textInput(finalMessage)]),
    ]),
  ]);
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi.fn<GuiHostCommands["readThread"]>().mockResolvedValue({ thread }),
  };
  const { screen } = await renderDetail({ commands });

  const pagination = screen.getByRole("navigation", { name: "Transcript context pages" });
  const firstPage = pagination.getByRole("button", { name: "Context page 1" });
  const secondPage = pagination.getByRole("button", { name: "Context page 2" });
  await expect.element(secondPage).toHaveAttribute("aria-current", "page");
  await expect
    .element(screen.getByText("End of read-only history", { exact: false }))
    .toBeVisible();
  await expect.element(screen.getByText("First historical context page")).not.toBeInTheDocument();
  await firstPage.click();
  await expect.element(screen.getByText("First historical context page")).toBeVisible();
  await expect
    .element(screen.getByText("End of read-only history", { exact: false }))
    .not.toBeInTheDocument();
  await secondPage.click();

  await expect
    .element(screen.getByRole("region", { name: "Message composer" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByPlaceholder("Message Codex")).not.toBeInTheDocument();
  expect(commands.startTurn).not.toHaveBeenCalled();
  expect(commands.steerTurn).not.toHaveBeenCalled();
  expect(commands.interruptTurn).not.toHaveBeenCalled();

  const action = screen.getByRole("button", { name: "Continue this task" });
  const actionBar = action.element().closest("aside");
  const bottomSpace = screen.container.querySelector("[data-app-shell-bottom-action-space]");
  expect(action.element().classList.contains("button--primary")).toBe(true);
  expect(actionBar?.classList.contains("fixed")).toBe(true);
  expect(bottomSpace).not.toBeNull();
  window.scrollTo(0, document.documentElement.scrollHeight);
  const transcriptEnd = screen.getByText("End of read-only history", { exact: false });
  await expect
    .poll(() => {
      if (!(actionBar instanceof HTMLElement)) {
        return false;
      }
      return (
        transcriptEnd.element().getBoundingClientRect().bottom <=
        actionBar.getBoundingClientRect().top
      );
    })
    .toBe(true);
});

test("reports a synchronous queue block without flashing pending and links the action to its reason", async () => {
  const continueThread = vi.fn<ContinueThread>().mockResolvedValue({
    type: "blocked",
    reason: {
      type: "queueReleaseBlocked",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
    },
    cleanupFailure: null,
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { router, screen } = await renderDetail({ commands, continueThread });
  const action = screen.getByRole("button", { name: "Continue this task" });

  await expect.element(action).toBeEnabled();
  await action.click();

  const reason =
    "The current task still has queued or unresolved messages. Return to it before switching.";
  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to switch tasks yet")).toBeVisible();
  await expect.element(alert.getByText(reason, { exact: true })).toBeVisible();
  await expect.element(action).not.toHaveAttribute("data-pending");
  await expect.element(action).toHaveAccessibleDescription(reason);
  expect(continueThread).toHaveBeenCalledExactlyOnceWith(detailThreadId);

  await alert.getByRole("button", { name: "Return to current task" }).click();
  await expect.element(screen.getByRole("main", { name: "Current task" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/");
});

test("keeps one continuation in flight while the primary action is pending", async () => {
  const switching = deferred<Awaited<ReturnType<ContinueThread>>>();
  const continueThread = vi.fn<ContinueThread>().mockReturnValue(switching.promise);
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { router, screen } = await renderDetail({ commands, continueThread });
  const action = screen.getByRole("button", { name: "Continue this task" });

  await action.click();
  await expect.element(action).toHaveAttribute("data-pending", "true");
  const pendingActionElement = action.element();
  if (!(pendingActionElement instanceof HTMLButtonElement)) {
    throw new Error("Expected the pending continuation action to be a button");
  }
  pendingActionElement.click();
  expect(continueThread).toHaveBeenCalledExactlyOnceWith(detailThreadId);

  const rawFailure = new Error("continuation settled after pending");
  switching.resolve({
    type: "failed",
    phase: "resume",
    error: rawFailure,
    cleanupFailure: null,
  });

  await expect.element(action).not.toHaveAttribute("data-pending");
  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  await expect.element(screen.getByText(rawFailure.message, { exact: true })).toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
});

test.each(["resume", "attach"] as const)(
  "keeps the read-only detail retryable after a %s failure",
  async (phase) => {
    const rawFailure = new Error(`complete ${phase} failure: request id 88`);
    const continueThread = vi.fn<ContinueThread>().mockResolvedValue({
      type: "failed",
      phase,
      error: rawFailure,
      cleanupFailure: null,
    });
    const commands = {
      ...createGuiHostCommands(),
      readThread: vi
        .fn<GuiHostCommands["readThread"]>()
        .mockResolvedValue({ thread: emptyHistoryThread() }),
    };
    const { router, screen } = await renderDetail({ commands, continueThread });
    const action = screen.getByRole("button", { name: "Continue this task" });

    await action.click();
    const alert = screen.getByRole("alert");
    await expect.element(alert.getByText("Unable to continue this task")).toBeVisible();
    await expect.element(alert.getByText(rawFailure.message, { exact: true })).toBeVisible();
    await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
    await expect.element(action).not.toHaveAttribute("data-pending");
    expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);

    await action.click();
    expect(continueThread).toHaveBeenCalledTimes(2);
  },
);

test.each(["current", "switched"] as const)(
  "replaces history with the authoritative thread query after a %s outcome without exposing the token",
  async (outcomeType) => {
    const authoritativeThreadId = `authoritative-${outcomeType}`;
    const owner = activeOwner(authoritativeThreadId);
    const outcome: Awaited<ReturnType<ContinueThread>> =
      outcomeType === "current"
        ? { type: "current", activeOwner: owner }
        : { type: "switched", activeOwner: owner, cleanupFailure: null };
    const continueThread = vi.fn<ContinueThread>().mockResolvedValue(outcome);
    const commands = {
      ...createGuiHostCommands(),
      readThread: vi
        .fn<GuiHostCommands["readThread"]>()
        .mockResolvedValue({ thread: emptyHistoryThread() }),
    };
    const detailUrl = `/history/${detailThreadId}?legacy=1#token=must-not-return`;
    const { router, screen } = await renderDetail({
      commands,
      continueThread,
      initialEntries: ["/origin", detailUrl],
    });

    await screen.getByRole("button", { name: "Continue this task" }).click();

    await expect.element(screen.getByRole("main", { name: "Current task" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    const routedUrl = new URL(router.state.location.href, window.location.origin);
    expect(Array.from(routedUrl.searchParams.keys())).toStrictEqual([THREAD_QUERY_KEY]);
    expect(routedUrl.searchParams.get(THREAD_QUERY_KEY)).toBe(authoritativeThreadId);
    expect(router.state.location.hash).toBe("");
    expect(router.state.location.href).not.toContain("token");

    router.history.back();
    await expect.element(screen.getByRole("main", { name: "Origin" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/origin");
    router.history.forward();
    await expect.element(screen.getByRole("main", { name: "Current task" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  },
);

test("preserves detail and list entries across browser back and forward navigation", async () => {
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { router, screen } = await renderDetail({ commands });

  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  await screen.getByRole("button", { name: "Back to history" }).click();
  await expect.element(screen.getByRole("main", { name: "History list" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/history");

  router.history.back();
  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
  expect(commands.readThread).toHaveBeenCalledTimes(2);

  router.history.forward();
  await expect.element(screen.getByRole("main", { name: "History list" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/history");
});
