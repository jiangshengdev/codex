import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type { ThreadListResponse } from "@codex-protocol/v2";
import {
  baselineAttached,
  renderHistory,
  response,
  thread,
} from "./threadHistoryListPageBrowserTestSupport";

const historyCards = (container: Element): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('article, [role="article"]'));

const historyGrid = (card: HTMLElement): HTMLElement => {
  const grid = card.parentElement;
  if (!(grid instanceof HTMLElement)) {
    throw new Error("history card must be rendered inside the history grid");
  }
  return grid;
};

const fitsWithinOwnWidth = (element: HTMLElement): boolean =>
  element.scrollWidth <= element.clientWidth + 1;

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

test("renders generated Thread cards with title fallbacks, nonduplicated summaries, status colors, time, and whole-card navigation", async () => {
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
    timeStyle: "short",
  }).format(new Date(activitySeconds * 1000));
  await expect.element(namedCard.getByText(formattedActivityTime)).toBeVisible();

  for (const label of ["Not loaded", "Idle", "Active", "System error"]) {
    await expect.element(screen.getByText(label)).toBeVisible();
  }
  await expect
    .element(screen.getByRole("button", { name: "Scan with phone" }))
    .not.toBeInTheDocument();

  const link = namedCard.getByRole("link", { name: "Named task", exact: true });
  await expect.element(link).toHaveAttribute("href", `/history/${namedThreadId}`);
  await expect.element(link.getByText("View", { exact: true })).toBeVisible();
  expect(namedCard.element().querySelectorAll("a")).toHaveLength(1);
  expect(link.element().querySelectorAll("a, button, [role='button']")).toHaveLength(0);
  await namedCard.getByText("Named task", { exact: true }).click();
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

test("keeps history cards reachable without horizontal overflow across viewport sizes", async () => {
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
    for (const width of [390, 900, 1440]) {
      await page.viewport(width, 900);
      await expect
        .poll(() => [document.documentElement, ...cards].every(fitsWithinOwnWidth))
        .toBe(true);
      for (const card of cards) {
        card.scrollIntoView({ block: "center" });
        const bounds = card.getBoundingClientRect();
        expect(
          card.contains(
            document.elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            ),
          ),
        ).toBe(true);
      }
    }
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("groups local dates with relative headings and merges same-day pagination in server order", async () => {
  vi.setSystemTime(new Date(2026, 8, 5, 12));
  try {
    const today = new Date(2026, 8, 5, 10).getTime() / 1000;
    const yesterday = new Date(2026, 8, 4, 23, 59).getTime() / 1000;
    const earlier = new Date(2026, 7, 30, 9);
    const priorYear = new Date(2025, 11, 31, 9);
    const listThreads = vi
      .fn<GuiHostCommands["listThreads"]>()
      .mockResolvedValueOnce(
        response(
          [
            thread("today", { name: "Today task", recencyAt: today }),
            thread("yesterday-first", { name: "Yesterday first", recencyAt: yesterday }),
          ],
          "same-day-cursor",
        ),
      )
      .mockResolvedValueOnce(
        response(
          [
            thread("yesterday-first", { name: "Yesterday first", recencyAt: yesterday }),
            thread("yesterday-second", {
              name: "Yesterday second",
              recencyAt: null,
              updatedAt: yesterday - 60,
            }),
            thread("earlier", { name: "Earlier task", recencyAt: earlier.getTime() / 1000 }),
            thread("prior-year", {
              name: "Prior year task",
              recencyAt: priorYear.getTime() / 1000,
            }),
          ],
          null,
        ),
      );
    const { screen } = await renderHistory(listThreads);
    const todayGroup = screen.getByRole("region", { name: "Today", exact: true });
    const yesterdayGroup = screen.getByRole("region", { name: "Yesterday", exact: true });
    await expect
      .element(todayGroup.getByRole("heading", { name: "Today", exact: true }))
      .toBeVisible();
    await expect.element(todayGroup.getByRole("article", { name: "Today task" })).toBeVisible();
    await expect
      .element(yesterdayGroup.getByRole("article", { name: "Yesterday first" }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Load more" }).click();
    await expect
      .element(yesterdayGroup.getByRole("article", { name: "Yesterday second" }))
      .toBeVisible();
    expect(screen.getByRole("heading", { name: "Yesterday", exact: true }).elements()).toHaveLength(
      1,
    );
    expect(
      historyCards(yesterdayGroup.element()).map((card) => card.querySelector("a")?.textContent),
    ).toEqual([
      expect.stringContaining("Yesterday first"),
      expect.stringContaining("Yesterday second"),
    ]);
    const earlierLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
      earlier,
    );
    const priorYearLabel = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(priorYear);
    await expect
      .element(
        screen
          .getByRole("region", { name: earlierLabel, exact: true })
          .getByRole("article", { name: "Earlier task" }),
      )
      .toBeVisible();
    await expect
      .element(
        screen
          .getByRole("region", { name: priorYearLabel, exact: true })
          .getByRole("article", { name: "Prior year task" }),
      )
      .toBeVisible();
    expect(historyCards(screen.container)).toHaveLength(5);
    await expect.element(screen.getByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(listThreads).toHaveBeenNthCalledWith(2, {
      archived: false,
      cwd: attachResponse.snapshot.thread.cwd,
      cursor: "same-day-cursor",
      limit: 25,
      sortDirection: "desc",
      sortKey: "recency_at",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("refreshes relative date labels when pagination renders after local midnight", async () => {
  vi.setSystemTime(new Date(2026, 8, 5, 23, 59));
  try {
    const today = new Date(2026, 8, 5, 10).getTime() / 1000;
    const yesterday = new Date(2026, 8, 4, 10).getTime() / 1000;
    const listThreads = vi
      .fn<GuiHostCommands["listThreads"]>()
      .mockResolvedValueOnce(
        response(
          [
            thread("rollover-today", { name: "Rollover today task", recencyAt: today }),
            thread("rollover-yesterday", { name: "Rollover yesterday task", recencyAt: yesterday }),
          ],
          "rollover-cursor",
        ),
      )
      .mockResolvedValueOnce(response([], null));
    const { screen } = await renderHistory(listThreads);
    await expect
      .element(
        screen
          .getByRole("region", { name: "Today", exact: true })
          .getByRole("article", { name: "Rollover today task" }),
      )
      .toBeVisible();
    await expect
      .element(
        screen
          .getByRole("region", { name: "Yesterday", exact: true })
          .getByRole("article", { name: "Rollover yesterday task" }),
      )
      .toBeVisible();

    vi.setSystemTime(new Date(2026, 8, 6, 0, 1));
    await screen.getByRole("button", { name: "Load more" }).click();

    await expect
      .element(
        screen
          .getByRole("region", { name: "Yesterday", exact: true })
          .getByRole("article", { name: "Rollover today task" }),
      )
      .toBeVisible();
    const earlierLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
      new Date(yesterday * 1000),
    );
    await expect
      .element(
        screen
          .getByRole("region", { name: earlierLabel, exact: true })
          .getByRole("article", { name: "Rollover yesterday task" }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Today", exact: true }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test.each(["summary", "blank space"])("opens a card by clicking its %s", async (target) => {
  const threadId = "00000000-0000-0000-0000-000000000092";
  const listThreads = vi
    .fn<GuiHostCommands["listThreads"]>()
    .mockResolvedValue(
      response([thread(threadId, { name: "Clickable task", preview: "Clickable summary" })], null),
    );
  const { router, screen } = await renderHistory(listThreads);
  const link = screen.getByRole("link", { name: "Clickable task", exact: true });
  await expect.element(link).toBeVisible();
  if (target === "summary") {
    await link.getByText("Clickable summary", { exact: true }).click();
  } else {
    const rect = link.element().getBoundingClientRect();
    await link.click({ position: { x: rect.width / 2, y: 8 } });
  }
  await expect.element(screen.getByRole("main", { name: "History detail" })).toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${threadId}`);
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
});

test("preserves complete long text without horizontal overflow and hides only exact trimmed duplicates", async () => {
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
      const footer = card.querySelector<HTMLElement>('[data-slot="card-footer"]');
      if (footer == null) {
        throw new Error("history cards must retain a compact information footer");
      }
      const footerRect = footer.getBoundingClientRect();
      expect(footerRect.top).toBeGreaterThanOrEqual(summary.getBoundingClientRect().bottom);
      expect(footerRect.bottom).toBeLessThanOrEqual(card.getBoundingClientRect().bottom);
      expect(fitsWithinOwnWidth(footer)).toBe(true);
      expect(footer.textContent).toContain("View");
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

test("keeps load-more and append errors reachable after the history cards", async () => {
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
    await expect
      .poll(() => {
        const buttonRect = loadMore.element().getBoundingClientRect();
        const cardBottom = Math.max(...cards.map((card) => card.getBoundingClientRect().bottom));
        return buttonRect.top >= cardBottom;
      })
      .toBe(true);

    await loadMore.click();
    append.reject(rawFailure);
    const alert = screen.getByRole("alert");
    await expect.element(alert.getByText(rawFailure.message, { exact: true })).toBeVisible();
    await expect
      .poll(() => {
        const alertRect = alert.element().getBoundingClientRect();
        const cardBottom = Math.max(...cards.map((card) => card.getBoundingClientRect().bottom));
        return alertRect.top >= cardBottom;
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
