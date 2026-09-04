import { afterEach, expect, test } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import {
  createActiveThreadSessionHarness,
  type ActiveThreadSessionHarness,
} from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjection";
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { disableMotionForTest, renderWithProviders } from "@/utils/test-utils";
import { AppShellTopBar } from "../AppShellTopBar";

function RoutePlaceholder() {
  return null;
}

const currentThreadId = attachResponse.snapshot.thread.id;
const otherThreadId = "00000000-0000-0000-0000-000000000099";
let sessionRevision = 0;
let restoreMotion: (() => void) | undefined;

afterEach(() => {
  restoreMotion?.();
  restoreMotion = undefined;
});

const baselineAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) =>
  activeThreadReadModelTransitionApplied({
    sessionRevision: ++sessionRevision,
    facts: [{ type: "baselineAttached", response }],
  });
const capabilities = ({
  activeThreadSessionHarness,
  routeTarget,
}: Readonly<{
  activeThreadSessionHarness: ActiveThreadSessionHarness;
  routeTarget: GuiRouteTarget;
}>): AppCapabilities => ({
  activeThreadSession: activeThreadSessionHarness.session,
  activeThreadStartupError: null,
  authorizationToken: null,
  commands: null,
  routeTarget,
  status: { label: "initialized" },
});

const renderTopBar = async ({
  initialEntry,
  activeThreadId = currentThreadId,
  routeTarget,
}: Readonly<{
  initialEntry: string;
  activeThreadId?: string | null;
  routeTarget: GuiRouteTarget;
}>) => {
  const activeThreadSessionHarness = createActiveThreadSessionHarness();
  if (activeThreadId != null) {
    activeThreadSessionHarness.publish(
      activeThreadSessionHarness.activeSnapshot({
        threadId: activeThreadId,
        subscriptionId: `subscription-${activeThreadId}`,
      }),
    );
  }
  const rootRoute = createRootRoute({
    component: () => (
      <AppCapabilitiesProvider
        capabilities={capabilities({ activeThreadSessionHarness, routeTarget })}
      >
        <AppShellTopBar />
      </AppCapabilitiesProvider>
    ),
  });
  const currentTaskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: CURRENT_TASK_ROUTE_PATH,
    component: RoutePlaceholder,
  });
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: HISTORY_LIST_ROUTE_PATH,
    component: RoutePlaceholder,
  });
  const historyDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: HISTORY_DETAIL_ROUTE_PATH,
    component: RoutePlaceholder,
  });

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([currentTaskRoute, historyRoute, historyDetailRoute]),
  });
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  return { router, screen };
};

const runtimeAttach = ({
  name,
  preview,
  threadId = currentThreadId,
}: {
  name: string | null;
  preview: string;
  threadId?: string;
}) => ({
  ...attachResponse,
  snapshot: {
    ...attachResponse.snapshot,
    thread: {
      ...attachResponse.snapshot.thread,
      id: threadId,
      name,
      preview,
    },
  },
});

test("top bar is a banner and derives the current task title from name, preview, and fallback", async () => {
  const { screen } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });

  await expect.element(screen.getByRole("banner")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Current task" }))
    .toBeVisible();

  screen.store.dispatch(
    baselineAttached(runtimeAttach({ name: "Named task", preview: "Preview" })),
  );
  await expect.element(screen.getByRole("heading", { level: 1, name: "Named task" })).toBeVisible();

  screen.store.dispatch(baselineAttached(runtimeAttach({ name: null, preview: "Preview task" })));
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Preview task" }))
    .toBeVisible();

  screen.store.dispatch(
    baselineAttached(
      runtimeAttach({ name: "Stale task", preview: "Stale preview", threadId: otherThreadId }),
    ),
  );
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Current task" }))
    .toBeVisible();

  screen.store.dispatch(baselineAttached(runtimeAttach({ name: null, preview: "" })));
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Current task" }))
    .toBeVisible();
});

test("Drawer exposes named navigation and Escape closes it with focus returned to the trigger", async () => {
  const { screen } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });
  const trigger = screen.getByRole("button", { name: "Menu" });

  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "Navigation" });
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  const currentTaskButton = navigation.getByRole("button", {
    name: "Current task",
    exact: true,
  });
  const historyButton = navigation.getByRole("button", { name: "History", exact: true });

  await expect.element(dialog).toBeVisible();
  await expect.element(currentTaskButton).toHaveAccessibleName("Current task");
  await expect.element(currentTaskButton).toHaveAccessibleDescription("Open current task");
  await expect.element(currentTaskButton).toHaveAttribute("aria-current", "page");
  expect(
    currentTaskButton
      .element()
      .querySelector('[data-current-page-indicator="true"]')
      ?.getAttribute("aria-hidden"),
  ).toBe("true");
  await expect.element(historyButton).toHaveAccessibleName("History");
  await expect.element(historyButton).toHaveAccessibleDescription("Browse task history");
  await expect.element(historyButton).not.toHaveAttribute("aria-current");
  expect(historyButton.element().querySelector('[data-current-page-indicator="true"]')).toBeNull();

  await screen.user.keyboard("{Escape}");

  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

test("Drawer preserves the full focus ring around the current task navigation button", async () => {
  const { screen } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });

  await screen.getByRole("button", { name: "Menu" }).click();
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  const currentTaskButton = navigation.getByRole("button", {
    name: "Current task",
    exact: true,
  });
  const drawerBody = navigation.element().parentElement;

  if (drawerBody == null) {
    throw new Error("Expected navigation to be a direct child of Drawer.Body");
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await screen.user.tab();
    if (document.activeElement === currentTaskButton.element()) {
      break;
    }
  }

  await expect.element(currentTaskButton).toHaveFocus();
  const buttonElement = currentTaskButton.element();
  const bodyBounds = drawerBody.getBoundingClientRect();
  const buttonBounds = buttonElement.getBoundingClientRect();
  // HeroUI 3.2.4 combines a 2px offset with a 2px focus ring.
  const focusRingOutset = 4;

  expect.soft(buttonElement.matches(":focus-visible")).toBe(true);
  expect.soft(buttonBounds.top - bodyBounds.top).toBeGreaterThanOrEqual(focusRingOutset);
  expect.soft(buttonBounds.left - bodyBounds.left).toBeGreaterThanOrEqual(focusRingOutset);
  expect.soft(bodyBounds.right - buttonBounds.right).toBeGreaterThanOrEqual(focusRingOutset);
});

test("History navigation uses the canonical list URL and closes the Drawer", async () => {
  restoreMotion = disableMotionForTest();
  const { router, screen } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });

  await screen.getByRole("button", { name: "Menu" }).click();
  const dialog = screen.getByRole("dialog", { name: "Navigation" });
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History" })
    .click();

  expect(router.state.location.pathname).toBe("/history");
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
  await expect.element(dialog).not.toBeInTheDocument();
});

test("Current task navigation uses the active thread id", async () => {
  const { router, screen } = await renderTopBar({
    initialEntry: "/history",
    activeThreadId: currentThreadId,
    routeTarget: { type: "historyList" },
  });

  await screen.getByRole("button", { name: "Menu" }).click();
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  const currentTaskButton = navigation.getByRole("button", {
    name: "Current task",
    exact: true,
  });
  const historyButton = navigation.getByRole("button", { name: "History", exact: true });

  await expect.element(currentTaskButton).not.toHaveAttribute("aria-current");
  expect(
    currentTaskButton.element().querySelector('[data-current-page-indicator="true"]'),
  ).toBeNull();
  await expect.element(historyButton).toHaveAttribute("aria-current", "page");
  expect(
    historyButton
      .element()
      .querySelector('[data-current-page-indicator="true"]')
      ?.getAttribute("aria-hidden"),
  ).toBe("true");

  await currentTaskButton.click();

  expect(router.state.location.pathname).toBe(`/task/${currentThreadId}`);
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
});

test("History detail marks only History as the current navigation destination", async () => {
  const { screen } = await renderTopBar({
    initialEntry: `/history/${otherThreadId}`,
    routeTarget: { type: "historyDetail", threadId: otherThreadId },
  });

  await screen.getByRole("button", { name: "Menu" }).click();
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  const currentTaskButton = navigation.getByRole("button", {
    name: "Current task",
    exact: true,
  });
  const historyButton = navigation.getByRole("button", { name: "History", exact: true });

  await expect.element(currentTaskButton).not.toHaveAttribute("aria-current");
  expect(
    currentTaskButton.element().querySelector('[data-current-page-indicator="true"]'),
  ).toBeNull();
  await expect.element(historyButton).toHaveAttribute("aria-current", "page");
  expect(
    historyButton
      .element()
      .querySelector('[data-current-page-indicator="true"]')
      ?.getAttribute("aria-hidden"),
  ).toBe("true");
});

test("Current task navigation is disabled when no active thread id exists", async () => {
  const { router, screen } = await renderTopBar({
    initialEntry: "/history",
    activeThreadId: null,
    routeTarget: { type: "historyList" },
  });

  screen.store.dispatch(
    baselineAttached(runtimeAttach({ name: "Stale task", preview: "Stale preview" })),
  );
  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  await screen.getByRole("button", { name: "Menu" }).click();
  const currentTaskButton = screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Current task" });

  await expect.element(currentTaskButton).toBeDisabled();
  expect(router.state.location.pathname).toBe("/history");
});
