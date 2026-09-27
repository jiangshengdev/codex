import { expect, test } from "@playwright/test";
import { activateProductControl, focusProductControl } from "./focusKeyboardActions";
import {
  observeCurrentFocus,
  observeKeyboardFocus,
  observeScrollBoundaryFocus,
} from "./focusObservation";
import { loadFocusStory } from "./focusStoryReady";

// CNB #157: only missing boundaries; existing drawer/state reviews stay authoritative.
test.use({ locale: "en", viewport: { width: 1280, height: 900 } });

for (const suffix of ["short-text", "mixed-text", "priority-detail"]) {
  const story = `composer-pending-input-three-queues--${suffix}`;
  const dialogCount = suffix === "priority-detail" ? 2 : 1;

  test(`${story} narrow root focus boundary`, async ({ page }, testInfo) => {
    await loadFocusStory(page, story, 240);
    const drawer = page.getByRole("dialog");
    await expect(drawer).toHaveCount(dialogCount);
    for (let remaining = dialogCount; remaining > 0; remaining -= 1) {
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(remaining - 1);
    }
    await expect(drawer).toHaveCount(0);
    const region = page.getByRole("region", { name: "Pending messages", exact: true });
    await expect(region).toBeVisible();
    // Only inline controls: the portal drawer has already been reviewed.
    const controls = region.getByRole("button");
    await expect(controls).toHaveCount(3);
    // These presets have queued/guiding messages, not unsent recovery messages.
    await expect(region.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(
      0,
    );
    for (const [index, control] of (await controls.all()).entries()) {
      await expect(control).toBeEnabled();
      await focusProductControl(page, control);
      const observations = await observeCurrentFocus(
        page,
        testInfo,
        `${story}-root-${String(index)}`,
      );
      expect(observations.length).toBeGreaterThan(0);
    }
  });
}

const recoveryMenuStories = [
  "feedback-connection-recovery-pages--retained-disconnection",
  "feedback-connection-recovery-pages--startup-failure",
  "feedback-message-synchronization--backpressure",
  "feedback-message-synchronization--commit-chain-mismatch",
  "feedback-message-synchronization--connection-unavailable",
  "feedback-message-synchronization--failed",
  "feedback-message-synchronization--missing-turn",
  "feedback-message-synchronization--restoring",
  "feedback-message-synchronization--task-operations",
  "feedback-task-recovery--partial-recovery",
  "feedback-task-recovery--recovered",
];
const newSessionMenuStories = [
  "new-session-flow--activating",
  "new-session-flow--activation-failed",
  "new-session-flow--blank-input",
  "new-session-flow--creating",
  "new-session-flow--creation-failed",
  "new-session-flow--creation-unknown",
  "new-session-flow--handoff-rejected",
  "new-session-flow--handoff-unknown",
  "new-session-flow--initial-input",
  "new-session-flow--interactive",
  "new-session-flow--missing-directory",
  "new-session-inputs--file",
  "new-session-inputs--image",
  "new-session-inputs--mixed",
  "new-session-inputs--mixed-uploading",
  "new-session-inputs--skill",
  "new-session-mixed-recovery--activation-failed",
  "new-session-mixed-recovery--creation-failed",
  "new-session-mixed-recovery--creation-unknown",
  "new-session-mixed-recovery--handoff-rejected",
  "new-session-mixed-recovery--handoff-unknown",
];

for (const story of [...recoveryMenuStories, ...newSessionMenuStories]) {
  const containerWidth = recoveryMenuStories.includes(story) ? 240 : null;

  test(`${story} Menu scroll metadata`, async ({ page }, testInfo) => {
    await loadFocusStory(page, story, containerWidth);
    await activateProductControl(page, page.getByRole("button", { name: "Menu", exact: true }));
    const body = page.getByRole("dialog").locator(".drawer__body");
    await expect(body).toBeVisible();
    // Retain the existing visual reviews; capture endpoints only if there is overflow.
    await observeScrollBoundaryFocus(page, testInfo, `${story}-menu`, body, {
      mode: "keyboard-then-wheel",
    });
  });
}

test("new-session-flow--creation-failed narrow root failed page and diagnostic", async ({
  page,
}, testInfo) => {
  const story = "new-session-flow--creation-failed";
  await loadFocusStory(page, story, 240);
  const diagnostic = page.getByRole("button", { name: "View diagnostic information", exact: true });
  await expect(diagnostic).toBeVisible();
  await observeKeyboardFocus(page, testInfo, `${story}-failed-root`);
  await activateProductControl(page, diagnostic);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await observeKeyboardFocus(page, testInfo, `${story}-diagnostic`);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(diagnostic).toBeFocused();
  await observeCurrentFocus(page, testInfo, `${story}-diagnostic-return`);
});

test("composer-pending-input-reordering--reject-first-move desktop rejection", async ({
  page,
}, testInfo) => {
  const story = "composer-pending-input-reordering--reject-first-move";
  await loadFocusStory(page, story, null);
  await activateProductControl(page, page.getByRole("button", { name: "Queued 3", exact: true }));
  const dialog = page.getByRole("dialog");
  await activateProductControl(
    page,
    dialog.getByRole("button", {
      name: "Move up pending message: Ordinary message 2",
      exact: true,
    }),
  );
  await expect(dialog.getByRole("alert")).toContainText("Pending message was not reordered");
  await expect(dialog.getByRole("heading", { name: "Pending details", exact: true })).toBeFocused();
  await observeKeyboardFocus(page, testInfo, `${story}-rejected`);
  await observeScrollBoundaryFocus(
    page,
    testInfo,
    `${story}-rejected-drawer`,
    dialog.locator(".drawer__body"),
    {
      mode: "keyboard-then-wheel",
    },
  );
});
