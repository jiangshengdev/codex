import { beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  getCleanupConnectionCallCount,
  launchThreadId,
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
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Current task" }))
    .toBeVisible();
  expect(router.state.location.pathname).toBe("/");
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
  expect(getCleanupConnectionCallCount()).toBe(0);

  await screen.getByRole("button", { name: "Menu" }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History" })
    .click();

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  await expect.element(screen.getByRole("main")).toBeInTheDocument();
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
});
