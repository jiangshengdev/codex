import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { attachResponse, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { renderWithProviders } from "@/utils/test-utils";
import type { Thread, ThreadListResponse } from "@codex-protocol/v2";
import { ThreadHistoryListPage } from "../ThreadHistoryListPage";

const thread = (
  id: string,
  overrides: Partial<Pick<Thread, "name" | "preview" | "recencyAt" | "status" | "updatedAt">>,
): Thread => ({
  ...attachResponse.snapshot.thread,
  id,
  turns: [],
  ...overrides,
});

const response = (data: Thread[], nextCursor: string | null): ThreadListResponse => ({
  data,
  nextCursor,
  backwardsCursor: null,
});

let sessionRevision = 0;
const baselineAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) =>
  activeThreadReadModelTransitionApplied({
    sessionRevision: ++sessionRevision,
    facts: [{ type: "baselineAttached", response }],
  });

const historyCards = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="article"]'));

const historyGrid = (card: HTMLElement): HTMLElement => {
  const grid = card.parentElement;
  if (!(grid instanceof HTMLElement)) {
    throw new Error("history card must be rendered inside the history grid");
  }
  return grid;
};

const firstRowColumnCount = (cards: readonly HTMLElement[]): number => {
  const firstTop = cards[0]?.getBoundingClientRect().top;
  if (firstTop == null) {
    return 0;
  }
  return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstTop) <= 1).length;
};

const hasAlignedFirstRow = (cards: readonly HTMLElement[], columns: number): boolean => {
  const firstRow = cards.slice(0, columns);
  const heights = firstRow.map((card) => card.getBoundingClientRect().height);
  const footerTops = firstRow.map(
    (card) =>
      card.querySelector<HTMLElement>('[data-slot="card-footer"]')?.getBoundingClientRect().top ??
      -1,
  );
  return (
    Math.max(...heights) - Math.min(...heights) <= 1 &&
    footerTops.every((top) => top >= 0) &&
    Math.max(...footerTops) - Math.min(...footerTops) <= 1
  );
};

const fitsWithinOwnWidth = (element: HTMLElement): boolean =>
  element.scrollWidth <= element.clientWidth + 1;

const HistoryDetailPlaceholder = () => <main aria-label="History detail" />;

type RenderHistoryOptions = {
  activeThreadSession?: ActiveThreadSession | null;
  activeThreadStartupError?: string | null;
  commandsAvailable?: boolean;
  initialEntry?: string;
  runtimeThreadId?: string | null;
  strictMode?: boolean;
};

const renderHistory = async (
  listThreads: GuiHostCommands["listThreads"],
  {
    activeThreadSession: suppliedActiveThreadSession,
    activeThreadStartupError = null,
    commandsAvailable = true,
    initialEntry = "/history",
    runtimeThreadId = attachResponse.snapshot.thread.id,
    strictMode = false,
  }: RenderHistoryOptions = {},
) => {
  const activeThreadSessionHarness = createActiveThreadSessionHarness();
  activeThreadSessionHarness.publish(
    activeThreadSessionHarness.activeSnapshot({
      threadId: attachResponse.snapshot.thread.id,
      subscriptionId: attachResponse.subscriptionId,
    }),
  );
  const activeThreadSession =
    suppliedActiveThreadSession === undefined
      ? activeThreadSessionHarness.session
      : suppliedActiveThreadSession;
  const target = { type: "historyList" } as const;
  const capabilities: AppCapabilities = {
    activeThreadSession,
    activeThreadStartupError,
    authorizationToken: null,
    commands: commandsAvailable ? { ...createGuiHostCommands(), listThreads } : null,
    routeTarget: target,
    status: { label: "initialized" },
  };
  const Root = () => (
    <AppCapabilitiesProvider capabilities={capabilities}>
      <Outlet />
    </AppCapabilitiesProvider>
  );
  const rootRoute = createRootRoute({ component: Root });
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/history",
    component: ThreadHistoryListPage,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/history/$threadId",
    component: HistoryDetailPlaceholder,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([historyRoute, detailRoute]),
  });
  const app = <RouterProvider router={router} />;
  const screen = await renderWithProviders(strictMode ? <StrictMode>{app}</StrictMode> : app);
  if (runtimeThreadId != null) {
    screen.store.dispatch(
      baselineAttached({
        ...attachResponse,
        snapshot: {
          ...attachResponse.snapshot,
          thread: { ...attachResponse.snapshot.thread, id: runtimeThreadId },
        },
      }),
    );
  }
  return { router, screen };
};

test("settles the initial history request and renders its result under StrictMode", async () => {
  const listThreads = vi
    .fn<GuiHostCommands["listThreads"]>()
    .mockResolvedValue(response([thread("strict", { name: "Strict mode task" })], null));
  const { screen } = await renderHistory(listThreads, { strictMode: true });

  await expect.element(screen.getByRole("article", { name: "Strict mode task" })).toBeVisible();
  await expect.element(screen.getByText("Loading history…")).not.toBeInTheDocument();
  expect(listThreads).toHaveBeenCalledExactlyOnceWith({
    archived: false,
    cwd: attachResponse.snapshot.thread.cwd,
    limit: 25,
    sortDirection: "desc",
    sortKey: "recency_at",
  });
});

test("keeps loading while the active thread session is pending publication", async () => {
  const listThreads = vi.fn<GuiHostCommands["listThreads"]>();
  const { screen } = await renderHistory(listThreads, { activeThreadSession: null });

  await expect.element(screen.getByText("Loading history…")).toBeVisible();
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  expect(listThreads).not.toHaveBeenCalled();
});

test("fails closed with the complete context error when the settled session is empty", async () => {
  const listThreads = vi.fn<GuiHostCommands["listThreads"]>();
  const emptySession = createActiveThreadSessionHarness();
  const { screen } = await renderHistory(listThreads, {
    activeThreadSession: emptySession.session,
  });

  const alert = screen.getByRole("alert");
  await expect
    .element(alert.getByText("History context unavailable", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      alert.getByText("Open an active task in this browser tab before viewing its history.", {
        exact: true,
      }),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Loading history…")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  expect(listThreads).not.toHaveBeenCalled();
});

test("shows the startup activation error only after the session settles empty", async () => {
  const listThreads = vi.fn<GuiHostCommands["listThreads"]>();
  const emptySession = createActiveThreadSessionHarness();
  const startupError = "Startup activation failed";
  const { screen } = await renderHistory(listThreads, {
    activeThreadSession: emptySession.session,
    activeThreadStartupError: startupError,
  });

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to load history", { exact: true })).toBeVisible();
  await expect.element(alert.getByText(startupError, { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Loading history…")).not.toBeInTheDocument();
  expect(listThreads).not.toHaveBeenCalled();
});

test("requires the runtime cwd to belong to the active thread id", async () => {
  const listThreads = vi.fn<GuiHostCommands["listThreads"]>();
  const { screen } = await renderHistory(listThreads, { runtimeThreadId: "different-thread" });

  await expect
    .element(screen.getByRole("alert").getByText("Unable to load history", { exact: true }))
    .toBeVisible();
  expect(listThreads).not.toHaveBeenCalled();
});

test("shows the non-retryable dependency error when commands are unavailable", async () => {
  const listThreads = vi.fn<GuiHostCommands["listThreads"]>();
  const { screen } = await renderHistory(listThreads, { commandsAvailable: false });

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to load history", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Loading history…")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  expect(listThreads).not.toHaveBeenCalled();
});

test("renders generated Thread cards with title fallbacks, nonduplicated summaries, status colors, time, and View navigation", async () => {
  const activitySeconds = 1_725_000_000;
  const namedThreadId = "00000000-0000-0000-0000-000000000091";
  const threads = [
    thread(namedThreadId, {
      name: "Named task",
      preview: "Named summary",
      recencyAt: activitySeconds,
      status: { type: "idle" },
    }),
    thread("preview", {
      name: null,
      preview: "Preview title",
      recencyAt: null,
      updatedAt: activitySeconds,
      status: { type: "notLoaded" },
    }),
    thread("untitled", { name: null, preview: "", status: { type: "active", activeFlags: [] } }),
    thread("failed", {
      name: "Failed task",
      preview: "Failure summary",
      status: { type: "systemError" },
    }),
  ];
  const listThreads = vi
    .fn<GuiHostCommands["listThreads"]>()
    .mockResolvedValue(response(threads, null));
  const { router, screen } = await renderHistory(listThreads);

  const namedCard = screen.getByRole("article", { name: "Named task" });
  const previewCard = screen.getByRole("article", { name: "Preview title" });
  await expect.element(namedCard.getByText("Named summary")).toBeVisible();
  expect(previewCard.element().querySelector("p")).toBeNull();
  await expect.element(screen.getByRole("article", { name: "Untitled task" })).toBeVisible();

  const formattedActivityTime = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(activitySeconds * 1000));
  await expect.element(namedCard.getByText(formattedActivityTime)).toBeVisible();

  const statusDangerByLabel = ["Not loaded", "Idle", "Active", "System error"].map((label) =>
    screen.getByText(label).element().closest(".chip")?.classList.contains("chip--danger"),
  );
  expect(statusDangerByLabel).toStrictEqual([false, false, false, true]);
  await expect
    .element(screen.getByRole("button", { name: "Scan with phone" }))
    .not.toBeInTheDocument();

  await namedCard.getByRole("button", { name: "View" }).click();
  await expect.element(screen.getByRole("main", { name: "History detail" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(`/history/${namedThreadId}`);
  expect(
    router.state.location.pathname.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ),
  ).toStrictEqual([namedThreadId]);
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
});

test("lays out history cards in one, two, and three real columns with aligned rows", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  try {
    await page.viewport(390, 900);
    const threads = [
      thread("short", { name: "Short task", preview: "Short summary" }),
      thread("long", {
        name: "A history task with a substantially longer title that occupies more room",
        preview:
          "A longer summary makes this card exercise the row-stretching behavior of the responsive grid.",
      }),
      thread("title-only", { name: "Title only task", preview: "" }),
      thread("fourth", { name: "Fourth task", preview: "Fourth summary" }),
      thread("fifth", { name: "Fifth task", preview: "Fifth summary" }),
      thread("sixth", { name: "Sixth task", preview: "Sixth summary" }),
    ];
    const listThreads = vi
      .fn<GuiHostCommands["listThreads"]>()
      .mockResolvedValue(response(threads, null));
    const { screen } = await renderHistory(listThreads);
    await expect.element(screen.getByRole("article", { name: "Short task" })).toBeVisible();

    const cards = historyCards(screen.container);
    expect(cards).toHaveLength(6);
    await expect.poll(() => firstRowColumnCount(cards)).toBe(1);

    await page.viewport(900, 900);
    await expect.poll(() => firstRowColumnCount(cards)).toBe(2);
    await expect.poll(() => hasAlignedFirstRow(cards, 2)).toBe(true);

    await page.viewport(1440, 900);
    await expect.poll(() => firstRowColumnCount(cards)).toBe(3);
    await expect.poll(() => hasAlignedFirstRow(cards, 3)).toBe(true);
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("clamps complete long text without horizontal overflow and hides only exact trimmed duplicates", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  try {
    await page.viewport(390, 900);
    const longUrl = `https://example.test/${"deeply-nested-route/".repeat(30)}`;
    const markdownSummary = `[$debug-responsive-gui](/Users/example/SKILL.md) ${"很长的中文摘要".repeat(40)}`;
    const unbrokenTitle = `unbroken-${"x".repeat(320)}`;
    const unbrokenSummary = `token-${"y".repeat(480)}`;
    const threads = [
      thread("url", { name: longUrl, preview: markdownSummary }),
      thread("unbroken", { name: unbrokenTitle, preview: unbrokenSummary }),
      thread("duplicate", { name: "  Repeated task  ", preview: "Repeated task" }),
      thread("similar", {
        name: "Responsive history",
        preview: "Responsive history for mobile and desktop",
      }),
    ];
    const listThreads = vi
      .fn<GuiHostCommands["listThreads"]>()
      .mockResolvedValue(response(threads, null));
    const { screen } = await renderHistory(listThreads);

    const urlCard = screen.getByRole("article", { name: longUrl });
    const unbrokenCard = screen.getByRole("article", { name: unbrokenTitle });
    await expect.element(urlCard).toHaveAccessibleName(longUrl);
    await expect.element(unbrokenCard).toHaveAccessibleName(unbrokenTitle);
    await expect.element(urlCard.getByText(markdownSummary, { exact: true })).toBeInTheDocument();
    await expect
      .element(unbrokenCard.getByText(unbrokenSummary, { exact: true }))
      .toBeInTheDocument();

    const cards = historyCards(screen.container);
    const firstCard = cards[0];
    if (firstCard == null) {
      throw new Error("history grid must render at least one card");
    }
    const grid = historyGrid(firstCard);
    await expect
      .poll(() =>
        [document.documentElement, document.body, grid, ...cards].every(fitsWithinOwnWidth),
      )
      .toBe(true);

    for (const card of [urlCard.element(), unbrokenCard.element()]) {
      const title = card.querySelector<HTMLElement>("[id^='thread-history-title-']");
      const summary = card.querySelector<HTMLElement>("p");
      if (title == null || summary == null) {
        throw new Error("long history cards must render a title and summary");
      }
      expect(getComputedStyle(title).webkitLineClamp).toBe("2");
      expect(getComputedStyle(summary).webkitLineClamp).toBe("3");
      expect(getComputedStyle(title).overflow).toBe("hidden");
      expect(getComputedStyle(summary).overflow).toBe("hidden");
    }

    const duplicateCard = screen.getByRole("article", { name: "Repeated task" }).element();
    expect(duplicateCard.querySelector("p")).toBeNull();
    const similarCard = screen.getByRole("article", { name: "Responsive history" });
    await expect
      .element(similarCard.getByText("Responsive history for mobile and desktop", { exact: true }))
      .toBeInTheDocument();
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("keeps load-more and append errors on their own full-grid rows", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  try {
    await page.viewport(1440, 900);
    const append = deferred<ThreadListResponse>();
    const rawFailure = new Error("complete grid append failure");
    const listThreads = vi
      .fn<GuiHostCommands["listThreads"]>()
      .mockResolvedValueOnce(
        response(
          [
            thread("grid-first", { name: "Grid first" }),
            thread("grid-second", { name: "Grid second" }),
            thread("grid-third", { name: "Grid third" }),
          ],
          "cursor-grid",
        ),
      )
      .mockReturnValueOnce(append.promise);
    const { screen } = await renderHistory(listThreads);
    const loadMore = screen.getByRole("button", { name: "Load more" });
    await expect.element(loadMore).toBeVisible();

    const cards = historyCards(screen.container);
    const firstCard = cards[0];
    if (firstCard == null) {
      throw new Error("history grid must render at least one card");
    }
    const grid = historyGrid(firstCard);
    await expect.poll(() => firstRowColumnCount(cards)).toBe(3);
    await expect
      .poll(() => {
        const gridRect = grid.getBoundingClientRect();
        const buttonRect = loadMore.element().getBoundingClientRect();
        const cardBottom = Math.max(...cards.map((card) => card.getBoundingClientRect().bottom));
        return (
          Math.abs(buttonRect.left + buttonRect.width / 2 - (gridRect.left + gridRect.width / 2)) <=
            1 && buttonRect.top >= cardBottom
        );
      })
      .toBe(true);

    await loadMore.click();
    append.reject(rawFailure);
    const alert = screen.getByRole("alert");
    await expect.element(alert.getByText(rawFailure.message, { exact: true })).toBeVisible();
    await expect
      .poll(() => {
        const gridRect = grid.getBoundingClientRect();
        const alertRect = alert.element().getBoundingClientRect();
        const cardBottom = Math.max(...cards.map((card) => card.getBoundingClientRect().bottom));
        return (
          Math.abs(alertRect.left - gridRect.left) <= 1 &&
          Math.abs(alertRect.right - gridRect.right) <= 1 &&
          alertRect.top >= cardBottom
        );
      })
      .toBe(true);
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("shows the complete initial error and retries into the empty state", async () => {
  const rawFailure = new Error("complete backend failure: request id 42");
  const listThreads = vi
    .fn<GuiHostCommands["listThreads"]>()
    .mockRejectedValueOnce(rawFailure)
    .mockResolvedValueOnce(response([], null));
  const { screen } = await renderHistory(listThreads);

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to load history")).toBeVisible();
  await expect.element(alert.getByText(rawFailure.message, { exact: true })).toBeVisible();
  await alert.getByRole("button", { name: "Retry" }).click();

  await expect
    .element(screen.getByText("No history for the current working directory."))
    .toBeVisible();
  expect(listThreads).toHaveBeenCalledTimes(2);
});

test("keeps loaded cards while load-more is pending and retries an append failure", async () => {
  const append = deferred<ThreadListResponse>();
  const retryAppend = deferred<ThreadListResponse>();
  const rawFailure = new Error("complete append failure");
  const listThreads = vi
    .fn<GuiHostCommands["listThreads"]>()
    .mockResolvedValueOnce(response([thread("first", { name: "First task" })], "cursor-1"))
    .mockReturnValueOnce(append.promise)
    .mockReturnValueOnce(retryAppend.promise);
  const { screen } = await renderHistory(listThreads);
  const loadMore = screen.getByRole("button", { name: "Load more" });

  await loadMore.click();
  await expect.element(loadMore).toBeDisabled();
  await expect.element(screen.getByRole("article", { name: "First task" })).toBeVisible();
  expect(listThreads).toHaveBeenCalledTimes(2);

  append.reject(rawFailure);
  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText(rawFailure.message, { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("article", { name: "First task" })).toBeVisible();
  await alert.getByRole("button", { name: "Retry" }).click();

  retryAppend.resolve(response([thread("second", { name: "Second task" })], null));
  await expect.element(screen.getByRole("article", { name: "Second task" })).toBeVisible();
  await expect.element(screen.getByRole("article", { name: "First task" })).toBeVisible();
  expect(listThreads).toHaveBeenCalledTimes(3);
});

test("removes cards from the previous cwd before the replacement cwd request settles", async () => {
  const replacementPage = deferred<ThreadListResponse>();
  const listThreads = vi
    .fn<GuiHostCommands["listThreads"]>()
    .mockResolvedValueOnce(response([thread("old", { name: "Old cwd task" })], null))
    .mockReturnValueOnce(replacementPage.promise);
  const { screen } = await renderHistory(listThreads);

  await expect.element(screen.getByRole("article", { name: "Old cwd task" })).toBeVisible();

  screen.store.dispatch(
    baselineAttached({
      ...attachResponse,
      snapshot: {
        ...attachResponse.snapshot,
        thread: { ...attachResponse.snapshot.thread, cwd: "/workspace/replacement" },
      },
    }),
  );

  await expect.element(screen.getByText("Loading history…")).toBeVisible();
  await expect
    .element(screen.getByRole("article", { name: "Old cwd task" }))
    .not.toBeInTheDocument();
  expect(listThreads).toHaveBeenNthCalledWith(2, {
    archived: false,
    cwd: "/workspace/replacement",
    limit: 25,
    sortDirection: "desc",
    sortKey: "recency_at",
  });

  replacementPage.resolve(response([thread("new", { name: "Replacement cwd task" })], null));
  await expect.element(screen.getByRole("article", { name: "Replacement cwd task" })).toBeVisible();
});
