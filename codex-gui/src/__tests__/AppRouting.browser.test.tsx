import { beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
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

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
});

test("root App keeps one connection across current, history, and detail routes and cleans up on unmount", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  const listThreads = vi.mocked(commands.listThreads);
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

  await router.navigate({
    to: "/history/$threadId",
    params: { threadId: launchThreadId },
  });

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${launchThreadId}`);
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  scrollTo.mockClear();
  await router.navigate({ to: "/history" });

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  await expect.poll(() => listThreads.mock.calls.length).toBe(2);
  await expect.poll(() => scrollTo.mock.calls.length).toBeGreaterThan(0);
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0 });
  expect(listThreads).toHaveBeenNthCalledWith(2, firstPageParams);
  expect(listThreads.mock.calls[1]?.[0]).not.toHaveProperty("cursor");
  expect(router.state.location.pathname).toBe("/history");
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
