import { expect, test } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { THREAD_QUERY_KEY } from "@codex-gui-host-contract";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { AppShellTopBar } from "../AppShellTopBar";

function RoutePlaceholder() {
  return null;
}

const createTopBarRouter = (initialEntry = "/") => {
  const rootRoute = createRootRoute({ component: AppShellTopBar });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: RoutePlaceholder,
  });
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/history",
    component: RoutePlaceholder,
  });

  return createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([indexRoute, historyRoute]),
  });
};

const runtimeAttach = ({ name, preview }: { name: string | null; preview: string }) => ({
  ...attachResponse,
  snapshot: {
    ...attachResponse.snapshot,
    thread: {
      ...attachResponse.snapshot.thread,
      name,
      preview,
    },
  },
});

test("top bar is a banner and derives the current task title from name, preview, and fallback", async () => {
  const router = createTopBarRouter();
  const screen = await renderWithProviders(<RouterProvider router={router} />);

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

  screen.store.dispatch(threadRuntimeAttached(runtimeAttach({ name: null, preview: "" })));
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Current task" }))
    .toBeVisible();
});

test("Drawer exposes named navigation and Escape closes it with focus returned to the trigger", async () => {
  const router = createTopBarRouter();
  const screen = await renderWithProviders(<RouterProvider router={router} />);
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

test("navigation preserves the launch thread query between the current task and history", async () => {
  const launchThreadId = "launch-thread";
  const router = createTopBarRouter(`/?${THREAD_QUERY_KEY}=${launchThreadId}`);
  const screen = await renderWithProviders(<RouterProvider router={router} />);

  await screen.getByRole("button", { name: "Menu" }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History" })
    .click();

  await expect.element(screen.getByRole("heading", { level: 1, name: "History" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/history");
  expect(router.state.location.search).toEqual({ [THREAD_QUERY_KEY]: launchThreadId });

  await screen.getByRole("button", { name: "Menu" }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Current task" })
    .click();

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Current task" }))
    .toBeVisible();
  expect(router.state.location.pathname).toBe("/");
  expect(router.state.location.search).toEqual({ [THREAD_QUERY_KEY]: launchThreadId });
});
