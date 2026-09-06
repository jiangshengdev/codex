import { afterEach, expect, test } from "vitest";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import { disableMotionForTest } from "@/utils/test-utils";
import { currentThreadId, renderTopBar } from "./appShellTopBarBrowserTestSupport";

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

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "History detail", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("banner").getByText("Read-only history", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Back to history", exact: true }))
    .not.toBeInTheDocument();
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
