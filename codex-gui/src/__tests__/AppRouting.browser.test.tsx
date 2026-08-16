import { beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { THREAD_QUERY_KEY, TOKEN_FRAGMENT_KEY } from "@codex-gui-host-contract";
import {
  attachProjection,
  attachResponse,
  createGuiHostCommands,
  getCleanupConnectionCallCount,
  getHostOptions,
  launchThreadId,
  markCommandsReady,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { attachWithThreadId } from "@/features/projection/__tests__/projectionTestBuilders";
import { selectThreadIdentityState } from "@/features/threadIdentity/threadIdentitySlice";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";

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

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
});

test("history cards open details and preserve one connection across browser back and forward", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();
  const listThreads = vi.mocked(commands.listThreads);
  const readThread = vi.mocked(commands.readThread);
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
  expect(router.state.location.pathname).toBe("/");
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  attachProjection(options);
  markCommandsReady(options, commands);
  scrollTo.mockClear();

  await screen.getByRole("button", { name: "Menu" }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History" })
    .click();

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  await expect.element(screen.getByRole("main")).toBeInTheDocument();
  await expect.poll(() => listThreads.mock.calls.length).toBe(1);
  await expect.poll(() => scrollTo.mock.calls.length).toBeGreaterThan(0);
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0 });
  expect(listThreads).toHaveBeenNthCalledWith(1, firstPageParams);
  expect(listThreads.mock.calls[0]?.[0]).not.toHaveProperty("cursor");
  expect(router.state.location.pathname).toBe("/history");
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  const historyCard = screen.getByRole("article", { name: "Projection fixture" });
  await expect.element(historyCard).toBeVisible();
  await historyCard.getByRole("button", { name: "View" }).click();

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
    .toBeVisible();
  expect(readThread).toHaveBeenNthCalledWith(1, {
    threadId: historyThreadId,
    includeTurns: true,
  });
  expect(router.state.location.pathname).toBe(`/history/${historyThreadId}`);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  scrollTo.mockClear();
  router.history.back();

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  await expect.poll(() => listThreads.mock.calls.length).toBe(2);
  await expect.poll(() => scrollTo.mock.calls.length).toBeGreaterThan(0);
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0 });
  expect(listThreads).toHaveBeenNthCalledWith(2, firstPageParams);
  expect(listThreads.mock.calls[1]?.[0]).not.toHaveProperty("cursor");
  expect(router.state.location.pathname).toBe("/history");
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  router.history.forward();

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Projection fixture" }))
    .toBeVisible();
  expect(readThread).toHaveBeenNthCalledWith(2, {
    threadId: historyThreadId,
    includeTurns: true,
  });
  expect(router.state.location.pathname).toBe(`/history/${historyThreadId}`);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.getByRole("button", { name: "Menu" }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Current task" })
    .click();

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/");
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.unmount();

  expect(getCleanupConnectionCallCount()).toBe(1);
  scrollTo.mockRestore();
});

test("successful continuation replaces detail with the authoritative current-thread URL", async () => {
  const router = createAppRouter(
    createMemoryHistory({
      initialEntries: [
        `/history/${historyThreadId}?${THREAD_QUERY_KEY}=${launchThreadId}#${TOKEN_FRAGMENT_KEY}=secret`,
      ],
    }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createHistoryCommands();
  const candidateAttach = attachWithThreadId(attachResponse, historyThreadId);
  vi.mocked(commands.attachThreadProjection).mockResolvedValue(candidateAttach);

  attachProjection(options);
  markCommandsReady(options, commands);

  const continueButton = screen.getByRole("button", { name: "Continue this task" });
  await expect.element(continueButton).toBeEnabled();
  await continueButton.click();

  await expect.element(screen.getByPlaceholder("Message Codex")).toBeVisible();
  const activeIdentity = selectThreadIdentityState(screen.store.getState());
  const routedUrl = new URL(router.state.location.href, "https://codex.test");
  expect(router.state.location.pathname).toBe("/");
  expect(router.history.length).toBe(1);
  expect(routedUrl.searchParams.get(THREAD_QUERY_KEY)).toBe(activeIdentity.attachedThreadId);
  expect(activeIdentity).toStrictEqual({
    launchThreadId: historyThreadId,
    attachedThreadId: historyThreadId,
    attachStatus: "attached",
  });
  expect(new URLSearchParams(routedUrl.hash.slice(1)).has(TOKEN_FRAGMENT_KEY)).toBe(false);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.unmount();

  expect(getCleanupConnectionCallCount()).toBe(1);
});
