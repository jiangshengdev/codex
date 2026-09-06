import { expect, test } from "vitest";
import { currentThreadId, renderTopBar } from "./appShellTopBarBrowserTestSupport";

const backgroundThreadId = "00000000-0000-0000-0000-000000000099";

test("shows a background waiting state, keeps removal disabled, and selects its own route", async () => {
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
    error: null,
    members: [
      {
        threadId: backgroundThreadId,
        phase: "ready",
        snapshot: harness.activeSnapshot({
          threadId: backgroundThreadId,
          threadStatus: { type: "active", activeFlags: ["waitingOnApproval"] },
        }),
        error: null,
        canRemove: false,
        removalBlockers: ["activeTurn"],
      },
    ],
  });
  const trigger = screen.getByRole("button", { name: "Menu", exact: true });
  await expect.element(trigger).toHaveAccessibleDescription(/Waiting for approval/);
  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "Navigation" });
  const remove = dialog.getByRole("button", { name: "Remove from list", exact: true });
  await expect.element(remove).toBeDisabled();
  await expect.element(remove).toHaveAccessibleDescription("This task is still running.");
  expect(harness.remove).not.toHaveBeenCalled();
  await dialog
    .getByRole("button", { name: `${backgroundThreadId} Waiting for approval`, exact: true })
    .click();
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
    error: null,
    members: [
      {
        threadId: currentThreadId,
        phase: "ready",
        snapshot: harness.activeSnapshot({
          threadId: currentThreadId,
          threadStatus: { type: "idle" },
        }),
        error: null,
        canRemove: true,
        removalBlockers: [],
      },
    ],
  });
  harness.remove.mockResolvedValue({ type: "removed", threadId: currentThreadId, wasViewed: true });
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await screen.getByRole("button", { name: "Remove from list", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/history/${currentThreadId}`);
  expect(harness.remove).toHaveBeenCalledExactlyOnceWith(currentThreadId);
  expect(harness.activate).not.toHaveBeenCalled();
});

for (const phase of ["failed", "cleanupPending", "ready"] as const) {
  test(`retries only the background member after ${phase} becomes unavailable`, async () => {
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
      error: null,
      members: [
        {
          threadId: backgroundThreadId,
          phase,
          snapshot:
            phase === "ready"
              ? harness.activeSnapshot({ threadId: backgroundThreadId, threadStatus: null })
              : null,
          error: new Error("Task state unavailable"),
          canRemove: false,
          removalBlockers: ["statusUnknown"],
        },
      ],
    });
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect.element(screen.getByText("Task state unavailable", { exact: true })).toBeVisible();
    await screen.getByRole("button", { name: "Retry", exact: true }).click();
    expect(harness.retry).toHaveBeenCalledExactlyOnceWith(backgroundThreadId);
    expect(router.state.location.pathname).toBe(`/task/${currentThreadId}`);
  });
}
