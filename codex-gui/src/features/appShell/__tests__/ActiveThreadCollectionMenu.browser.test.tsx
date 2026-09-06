import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelTransitionApplied,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import { attachWithThreadName } from "@/features/projection/__tests__/projectionTestBuilders";
import { currentThreadId, renderTopBar } from "./appShellTopBarBrowserTestSupport";

const backgroundThreadId = "00000000-0000-0000-0000-000000000099";

test("keeps a waiting task unmarked, removal disabled, and its title route selectable", async () => {
  const {
    screen,
    router,
    activeThreadSessionHarness: harness,
  } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });
  harness.publishCollection({
    viewedThreadId: currentThreadId,
    errors: [],
    members: [
      {
        threadId: backgroundThreadId,
        phase: "ready",
        snapshot: harness.activeSnapshot({
          threadId: backgroundThreadId,
          threadStatus: { type: "active", activeFlags: ["waitingOnApproval"] },
        }),
        error: null,
        operationErrors: [],
        canRemove: false,
        removalBlockers: ["activeTurn"],
      },
    ],
  });
  const trigger = screen.getByRole("button", { name: "Menu", exact: true });
  await expect.element(trigger).not.toHaveAttribute("aria-describedby");
  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "Navigation" });
  await dialog
    .getByRole("button", { name: `More options for ${backgroundThreadId}`, exact: true })
    .click();
  const remove = screen.getByRole("menuitem", { name: "Remove from list", exact: true });
  await expect.element(remove).toHaveAttribute("aria-disabled", "true");
  await expect.element(remove).toHaveAccessibleDescription("This task is still running.");
  expect(harness.remove).not.toHaveBeenCalled();
  await userEvent.keyboard("{Escape}");
  await dialog.getByRole("button", { name: backgroundThreadId, exact: true }).click();
  expect(router.state.location.pathname).toBe(`/task/${backgroundThreadId}`);
  expect(harness.remove).not.toHaveBeenCalled();
});

test("removing the viewed idle task navigates to its history without selecting another member", async () => {
  const {
    screen,
    router,
    activeThreadSessionHarness: harness,
  } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });
  harness.publishCollection({
    viewedThreadId: currentThreadId,
    errors: [],
    members: [
      {
        threadId: currentThreadId,
        phase: "ready",
        snapshot: harness.activeSnapshot({
          threadId: currentThreadId,
          threadStatus: { type: "idle" },
        }),
        error: null,
        operationErrors: [],
        canRemove: true,
        removalBlockers: [],
      },
    ],
  });
  harness.remove.mockResolvedValue({ type: "removed", threadId: currentThreadId, wasViewed: true });
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await screen
    .getByRole("button", { name: `More options for ${currentThreadId}`, exact: true })
    .click();
  await screen.getByRole("menuitem", { name: "Remove from list", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/history/${currentThreadId}`);
  expect(harness.remove).toHaveBeenCalledExactlyOnceWith(currentThreadId);
  expect(harness.activate).not.toHaveBeenCalled();
});

for (const phase of ["failed", "cleanupPending", "ready"] as const) {
  test(`marks the ${phase} background member and opens its task page for recovery`, async () => {
    const {
      screen,
      router,
      activeThreadSessionHarness: harness,
    } = await renderTopBar({
      initialEntry: `/task/${currentThreadId}`,
      routeTarget: { type: "currentTask", threadId: currentThreadId },
    });
    harness.publishCollection({
      viewedThreadId: currentThreadId,
      errors: [],
      members: [
        {
          threadId: backgroundThreadId,
          phase,
          snapshot:
            phase === "ready"
              ? harness.activeSnapshot({ threadId: backgroundThreadId, threadStatus: null })
              : null,
          error: new Error("Task state unavailable"),
          operationErrors: [],
          canRemove: false,
          removalBlockers: ["statusUnknown"],
        },
      ],
    });
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect
      .element(screen.getByText("Task state unavailable", { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Retry", exact: true }))
      .not.toBeInTheDocument();
    const title = screen.getByRole("button", { name: backgroundThreadId, exact: true });
    await expect.element(title).toHaveAccessibleDescription("This task needs attention.");
    await title.click();
    await expect.poll(() => router.state.location.pathname).toBe(`/task/${backgroundThreadId}`);
    expect(harness.retry).not.toHaveBeenCalled();
  });
}

test("Escape closes actions before the drawer and restores focus to each trigger", async () => {
  const {
    screen,
    router,
    activeThreadSessionHarness: harness,
  } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });
  harness.publishCollection({
    viewedThreadId: currentThreadId,
    errors: [],
    members: [
      {
        threadId: backgroundThreadId,
        phase: "failed",
        snapshot: null,
        error: new Error("failed"),
        operationErrors: [],
        canRemove: true,
        removalBlockers: [],
      },
    ],
  });
  const menu = screen.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const more = screen.getByRole("button", {
    name: `More options for ${backgroundThreadId}`,
    exact: true,
  });
  await more.click();
  await expect
    .element(screen.getByRole("menuitem", { name: "Remove from list", exact: true }))
    .toBeVisible();
  expect(router.state.location.pathname).toBe(`/task/${currentThreadId}`);
  await userEvent.keyboard("{Escape}");
  await expect
    .element(screen.getByRole("menuitem", { name: "Remove from list", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await expect.element(more).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(screen.getByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
  await expect.element(menu).toHaveFocus();
});

test("a thrown remove error survives closing the drawer and clears after successful removal", async () => {
  const { screen, activeThreadSessionHarness: harness } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });
  harness.publishCollection({
    viewedThreadId: currentThreadId,
    errors: [],
    members: [
      {
        threadId: backgroundThreadId,
        phase: "ready",
        snapshot: harness.activeSnapshot({ threadId: backgroundThreadId }),
        error: null,
        operationErrors: [],
        canRemove: true,
        removalBlockers: [],
      },
    ],
  });
  const failure = new Error("Remove operation rejected");
  harness.remove.mockRejectedValueOnce(failure);
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await screen
    .getByRole("button", { name: `More options for ${backgroundThreadId}`, exact: true })
    .click();
  await screen.getByRole("menuitem", { name: "Remove from list", exact: true }).click();
  await expect
    .poll(() => harness.setOperationError.mock.calls)
    .toContainEqual([backgroundThreadId, "remove", failure]);
  await expect.element(screen.getByText(failure.message, { exact: true })).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("menuitem", { name: "Remove from list", exact: true }))
    .not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await expect.element(screen.getByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
  const menu = screen.getByRole("button", { name: "Menu", exact: true });
  await expect.element(menu).toHaveAccessibleDescription("Tasks or the connection need attention.");
  await menu.click();
  await screen
    .getByRole("button", { name: `More options for ${backgroundThreadId}`, exact: true })
    .click();
  await screen.getByRole("menuitem", { name: "Remove from list", exact: true }).click();
  await expect
    .poll(() => harness.setOperationError.mock.calls)
    .toContainEqual([backgroundThreadId, "remove", null]);
});

test("navigation rejections persist in the task owner until that navigation succeeds", async () => {
  const {
    screen,
    router,
    activeThreadSessionHarness: harness,
  } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });
  harness.publishCollection({
    viewedThreadId: currentThreadId,
    errors: [],
    members: [
      {
        threadId: backgroundThreadId,
        phase: "ready",
        snapshot: harness.activeSnapshot({ threadId: backgroundThreadId }),
        error: null,
        operationErrors: [],
        canRemove: true,
        removalBlockers: [],
      },
    ],
  });
  const failure = new Error("Navigation rejected");
  vi.spyOn(router, "navigate").mockRejectedValueOnce(failure);
  const menu = screen.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await screen.getByRole("button", { name: backgroundThreadId, exact: true }).click();
  await expect
    .poll(() => harness.setOperationError.mock.calls)
    .toContainEqual([backgroundThreadId, "navigation", failure]);
  await expect.element(menu).toHaveAccessibleDescription("Tasks or the connection need attention.");
  await menu.click();
  await screen.getByRole("button", { name: backgroundThreadId, exact: true }).click();
  await expect
    .poll(() => harness.setOperationError.mock.calls)
    .toContainEqual([backgroundThreadId, "navigation", null]);
});

test("a long title keeps both actions reachable inside a narrow menu and falls back to UUID without a name", async () => {
  const {
    screen,
    router,
    activeThreadSessionHarness: harness,
  } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });
  const title = "A very long task title ".repeat(20);
  const snapshot = harness.activeSnapshot({ threadId: currentThreadId });
  screen.store.dispatch(activeThreadReadModelSlotCreated(snapshot.identity));
  const publishTitle = (name: string | null, sessionRevision: number) => {
    screen.store.dispatch(
      activeThreadReadModelTransitionApplied({
        identity: snapshot.identity,
        sessionRevision,
        facts: [{ type: "baselineAttached", response: attachWithThreadName(attachResponse, name) }],
      }),
    );
  };
  publishTitle(title, 1);
  harness.publishCollection({
    viewedThreadId: currentThreadId,
    errors: [],
    members: [
      {
        threadId: currentThreadId,
        phase: "ready",
        snapshot,
        error: null,
        operationErrors: [],
        canRemove: true,
        removalBlockers: [],
      },
    ],
  });
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Navigation" });
  const section = dialog
    .element()
    .querySelector<HTMLElement>('section[aria-labelledby="active-tasks-heading"]');
  expect(section).not.toBeNull();
  if (section == null) throw new Error("Active tasks section missing");
  section.style.width = "220px";
  const more = dialog.getByRole("button", {
    name: `More options for ${title.trim()}`,
    exact: true,
  });
  const titleButton = dialog.getByRole("button", { name: title.trim(), exact: true });
  await expect.element(titleButton).toHaveAttribute("aria-current", "true");
  await expect
    .poll(() => {
      const bounds = section.getBoundingClientRect();
      return [titleButton.element(), more.element()].every((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.left >= bounds.left && box.right <= bounds.right;
      });
    })
    .toBe(true);
  await more.click();
  await expect
    .element(screen.getByRole("menuitem", { name: "Remove from list", exact: true }))
    .toBeVisible();
  expect(router.state.location.pathname).toBe(`/task/${currentThreadId}`);
  await userEvent.keyboard("{Escape}");
  await expect.element(more).toHaveFocus();
  publishTitle("   ", 2);
  const fallback = dialog.getByRole("button", { name: currentThreadId, exact: true });
  await expect.element(fallback).toBeVisible();
  await fallback.click();
  await expect.element(dialog).not.toBeInTheDocument();
});
