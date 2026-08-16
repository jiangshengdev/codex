import { expect, test, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { attachResponse, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import type { Thread, ThreadListResponse } from "@codex-protocol/v2";
import { ThreadHistoryListPage } from "../ThreadHistoryListPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

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

const HistoryDetailPlaceholder = () => <main aria-label="History detail" />;

const renderHistory = async (listThreads: GuiHostCommands["listThreads"]) => {
  const capabilities = {
    activeOwner: null,
    commands: { ...createGuiHostCommands(), listThreads },
    continueThread: null,
    launchParams: null,
    status: { label: "attached" } as const,
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
    history: createMemoryHistory({ initialEntries: ["/history"] }),
    routeTree: rootRoute.addChildren([historyRoute, detailRoute]),
  });
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  screen.store.dispatch(threadRuntimeAttached(attachResponse));
  return { router, screen };
};

test("renders generated Thread cards with title fallbacks, nonduplicated summaries, status colors, time, and View navigation", async () => {
  const activitySeconds = 1_725_000_000;
  const threads = [
    thread("named", {
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

  await namedCard.getByRole("button", { name: "View" }).click();
  await expect.element(screen.getByRole("main", { name: "History detail" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/history/named");
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
    threadRuntimeAttached({
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
