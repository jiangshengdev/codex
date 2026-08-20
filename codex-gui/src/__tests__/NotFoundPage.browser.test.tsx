import { beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

const validThreadId = "11111111-2222-3333-4444-555555555555";

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

vi.mock("@/App", async () => {
  const { createElement, useEffect } = await import("react");
  const { Outlet } = await import("@tanstack/react-router");

  return {
    default: function RouterTestApp() {
      useEffect(
        () =>
          guiHostClientMock.startGuiHostConnection({
            location: new URL(window.location.href),
            token: "test-authorization-token",
          }),
        [],
      );
      return createElement(Outlet);
    },
  };
});

vi.mock("@/features/currentTask/CurrentTaskPage", () => ({
  CurrentTaskPage: () => null,
}));

vi.mock("@/features/threadHistory/ThreadHistoryDetailPage", () => ({
  ThreadHistoryDetailPage: () => null,
}));

vi.mock("@/features/threadHistory/ThreadHistoryListPage", async () => {
  const { createElement } = await import("react");

  return {
    ThreadHistoryListPage: () => createElement("h1", null, "History"),
  };
});

beforeEach(() => {
  guiHostClientMock.startGuiHostConnection.mockReset();
  guiHostClientMock.startGuiHostConnection.mockReturnValue(() => undefined);
});

test.each([
  "/",
  "/task",
  `/task/${validThreadId}/extra`,
  `/history/${validThreadId}/extra`,
  "/task/not-a-uuid",
  "/history/not-a-uuid",
  `/task/${validThreadId}?threadId=legacy`,
  "/history?anything=value",
  `/history/${validThreadId}?empty`,
])("rejects invalid URL %s before starting a GUI host connection", async (initialEntry) => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [initialEntry] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Page not found" }))
    .toBeVisible();
  expect(guiHostClientMock.startGuiHostConnection).not.toHaveBeenCalled();

  const originalUrl = new URL(initialEntry, "https://codex.test");
  expect({
    pathname: router.state.location.pathname,
    search: router.state.location.search,
  }).toEqual({
    pathname: originalUrl.pathname,
    search: Object.fromEntries(originalUrl.searchParams),
  });
});

test.each([
  [
    "en" as const,
    {
      title: "Page not found",
      description: "Sorry, we couldn’t find the page you’re looking for.",
      action: "Go back home",
      support: "Contact support",
    },
  ],
  [
    "zh-CN" as const,
    {
      title: "找不到页面",
      description: "抱歉，找不到您要访问的页面。",
      action: "返回首页",
      support: "联系支持",
    },
  ],
])("renders the complete not-found page in %s", async (locale, labels) => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />, { locale });

  await expect.element(screen.getByRole("heading", { level: 1, name: labels.title })).toBeVisible();
  await expect.element(screen.getByText(labels.description, { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: labels.action })).toBeVisible();
  await expect.element(screen.getByText("404", { exact: true })).toBeVisible();
  await expect.poll(() => document.title).toBe(`${labels.title} · Codex`);
  const supportLink = screen.getByRole("link", { name: labels.support });
  await expect.element(supportLink).toBeVisible();
  expect(supportLink.element().getAttribute("href")?.startsWith("mailto:")).toBe(true);
  expect(guiHostClientMock.startGuiHostConnection).not.toHaveBeenCalled();
});

test("navigates to the canonical history list only after Go back home is pressed", async () => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);

  expect(guiHostClientMock.startGuiHostConnection).not.toHaveBeenCalled();
  const goBackHome = screen.getByRole("button", { name: "Go back home" });
  await expect.element(goBackHome).toBeVisible();
  await goBackHome.click();

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/history");
  expect(router.state.location.search).toEqual({});
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});
