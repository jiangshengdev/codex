import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import { createDeferred } from "@/__tests__/testDeferred";
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

test.each(["viewed", "background", "changed route", "failed"])(
  "removing a %s task preserves the intended destination",
  async (scenario) => {
    const {
      screen,
      router,
      activeThreadSessionHarness: harness,
    } = await renderTopBar({
      initialEntry: `/task/${currentThreadId}`,
      routeTarget: { type: "currentTask", threadId: currentThreadId },
    });
    const removedThreadId = scenario === "background" ? backgroundThreadId : currentThreadId;
    const initialHistoryLength = router.history.length;
    harness.publishCollection({
      viewedThreadId: currentThreadId,
      errors: [],
      members: [
        {
          threadId: removedThreadId,
          phase: "ready",
          snapshot: harness.activeSnapshot({
            threadId: removedThreadId,
            threadStatus: { type: "idle" },
          }),
          error: null,
          operationErrors: [],
          canRemove: true,
          removalBlockers: [],
        },
      ],
    });
    const removal = createDeferred<Awaited<ReturnType<typeof harness.remove>>>();
    harness.remove.mockReturnValueOnce(removal.promise);
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await screen
      .getByRole("button", { name: `More options for ${removedThreadId}`, exact: true })
      .click();
    await screen.getByRole("menuitem", { name: "Remove from list", exact: true }).click();
    expect(harness.remove).toHaveBeenCalledExactlyOnceWith(removedThreadId);
    if (scenario === "changed route") {
      await router.navigate({ to: "/task/$threadId", params: { threadId: backgroundThreadId } });
    }
    const failure = new Error("Remove operation rejected");
    if (scenario === "failed") {
      removal.reject(failure);
    } else {
      removal.resolve({
        type: "removed",
        threadId: removedThreadId,
        wasViewed: scenario !== "background",
      });
    }
    await expect
      .poll(() => harness.setOperationError.mock.calls)
      .toContainEqual([removedThreadId, "remove", scenario === "failed" ? failure : null]);
    const expectedPath =
      scenario === "viewed"
        ? "/history"
        : `/task/${scenario === "changed route" ? backgroundThreadId : currentThreadId}`;
    await expect.poll(() => router.state.location.pathname).toBe(expectedPath);
    expect(router.history.length).toBe(
      initialHistoryLength + (scenario === "changed route" ? 1 : 0),
    );
    await expect
      .poll(() => screen.getByRole("dialog", { name: "Navigation" }).elements().length)
      .toBe(scenario === "viewed" ? 0 : 1);
    expect(harness.activate).not.toHaveBeenCalled();
  },
);

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
        error: new Error("Task needs attention"),
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
  await expect.element(titleButton).toHaveAccessibleDescription("This task needs attention.");
  await expect.element(more).toHaveClass("button--ghost");
  const label = titleButton.element().querySelector<HTMLElement>("[title]");
  const indicator = titleButton
    .element()
    .querySelector<HTMLElement>('[data-current-task-indicator="true"]');
  const error = titleButton
    .element()
    .querySelector<HTMLElement>('[data-task-error-indicator="true"]');
  expect(label).not.toBeNull();
  expect(indicator).not.toBeNull();
  expect(error).not.toBeNull();
  if (label == null || indicator == null || error == null)
    throw new Error("Task row contents missing");
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  try {
    for (const width of [1280, 375]) {
      await page.viewport(width, 720);
      await expect
        .poll(() => {
          const navigationLabel = dialog
            .getByText("Current task", { exact: true })
            .element()
            .getBoundingClientRect();
          const titleBounds = label.getBoundingClientRect();
          const errorBounds = error.getBoundingClientRect();
          const moreBounds = more.element().getBoundingClientRect();
          return (
            Math.abs(titleBounds.left - navigationLabel.left) < 1 &&
            titleBounds.right <= errorBounds.left &&
            errorBounds.right <= moreBounds.left &&
            errorBounds.width > 0 &&
            label.scrollWidth > label.clientWidth &&
            Math.abs(
              errorBounds.top + errorBounds.height / 2 - moreBounds.top - moreBounds.height / 2,
            ) < 1
          );
        })
        .toBe(true);
    }
  } finally {
    await page.viewport(viewport.width, viewport.height);
  }
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
