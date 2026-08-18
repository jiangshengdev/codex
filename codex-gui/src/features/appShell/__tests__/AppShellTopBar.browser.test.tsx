import { expect, test } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { AppShellTopBar } from "../AppShellTopBar";

function RoutePlaceholder() {
  return null;
}

const currentThreadId = attachResponse.snapshot.thread.id;
const otherThreadId = "00000000-0000-0000-0000-000000000099";

const activeOwner = (threadId: string): ActiveThreadOwnerHandle => ({
  threadId,
  subscriptionId: `subscription-${threadId}`,
  projectionOwner: null as never,
  queueCoordinator: null as never,
});

const capabilities = ({
  owner = activeOwner(currentThreadId),
  routeTarget,
}: Readonly<{
  owner?: ActiveThreadOwnerHandle | null;
  routeTarget: GuiRouteTarget;
}>): AppCapabilities => ({
  activeOwner: owner,
  authorizationToken: null,
  commands: null,
  continueThread: null,
  routeTarget,
  startupOutcome: null,
  status: { label: "initialized" },
});

const renderTopBar = async ({
  initialEntry,
  owner,
  routeTarget,
}: Readonly<{
  initialEntry: string;
  owner?: ActiveThreadOwnerHandle | null;
  routeTarget: GuiRouteTarget;
}>) => {
  const rootRoute = createRootRoute({
    component: () => (
      <AppCapabilitiesProvider capabilities={capabilities({ owner, routeTarget })}>
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

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([currentTaskRoute, historyRoute]),
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
    threadRuntimeAttached(runtimeAttach({ name: "Named task", preview: "Preview" })),
  );
  await expect.element(screen.getByRole("heading", { level: 1, name: "Named task" })).toBeVisible();

  screen.store.dispatch(
    threadRuntimeAttached(runtimeAttach({ name: null, preview: "Preview task" })),
  );
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Preview task" }))
    .toBeVisible();

  screen.store.dispatch(
    threadRuntimeAttached(
      runtimeAttach({ name: "Stale task", preview: "Stale preview", threadId: otherThreadId }),
    ),
  );
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Current task" }))
    .toBeVisible();

  screen.store.dispatch(threadRuntimeAttached(runtimeAttach({ name: null, preview: "" })));
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

  await expect.element(dialog).toBeVisible();
  await expect
    .element(navigation.getByRole("button", { name: "Current task" }))
    .toHaveAttribute("aria-current", "page");
  await expect.element(navigation.getByRole("button", { name: "History" })).toBeVisible();

  await screen.user.keyboard("{Escape}");

  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

test("History navigation uses the canonical list URL and closes the Drawer", async () => {
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

test("Current task navigation uses the active owner", async () => {
  const { router, screen } = await renderTopBar({
    initialEntry: "/history",
    owner: activeOwner(currentThreadId),
    routeTarget: { type: "historyList" },
  });

  await screen.getByRole("button", { name: "Menu" }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Current task" })
    .click();

  expect(router.state.location.pathname).toBe(`/task/${currentThreadId}`);
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
});

test("Current task navigation is disabled when no active owner exists", async () => {
  const { router, screen } = await renderTopBar({
    initialEntry: "/history",
    owner: null,
    routeTarget: { type: "historyList" },
  });

  screen.store.dispatch(
    threadRuntimeAttached(runtimeAttach({ name: "Stale task", preview: "Stale preview" })),
  );
  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  await screen.getByRole("button", { name: "Menu" }).click();
  const currentTaskButton = screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Current task" });

  await expect.element(currentTaskButton).toBeDisabled();
  expect(router.state.location.pathname).toBe("/history");
});
