import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("returns to the main draft when the last queued message starts sending during exit", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-browsing--single-message",
  );
  await page.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await page.waitForFunction(() => {
    const backdrop = document.querySelector('[data-slot="drawer-backdrop"]');
    return backdrop
      ?.getAnimations({ subtree: true })
      .every((animation) => animation.playState !== "running");
  });
  const injected = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          const backdrop = document.querySelector('[data-slot="drawer-backdrop"][data-exiting]');
          if (backdrop?.querySelector('[role="dialog"]') == null) return;
          observer.disconnect();
          const send = Array.from(document.querySelectorAll("button")).find((button) =>
            button.textContent.includes("Simulate current turn completed"),
          );
          send?.click();
          resolve(send != null);
        });
        observer.observe(document.body, { subtree: true, attributes: true });
      }),
  );
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  expect(await injected).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Pending:/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Main draft", exact: true })).toBeFocused();
});

test("opens the real queue and restores keyboard focus", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-browsing--queued");
  const trigger = page.getByRole("button", { name: "Pending: Queued 3", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 1");
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="drawer-backdrop"]')
      ?.getAnimations({ subtree: true })
      .every((animation) => animation.playState !== "running"),
  );
  const continuity = trigger.evaluate(
    (entry) =>
      new Promise<{ stable: boolean; sawExit: boolean; samples: number }>((resolve) => {
        const panel = entry.closest("section");
        if (panel == null) throw new Error("Expected pending panel");
        const height = panel.getBoundingClientRect().height;
        let stable = true;
        let sawExit = false;
        let samples = 0;
        let frame = 0;
        const sample = () => {
          samples += 1;
          stable &&=
            entry.isConnected &&
            entry.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
            panel.getBoundingClientRect().height === height;
          sawExit ||= document.querySelector('[data-slot="drawer-backdrop"][data-exiting]') != null;
        };
        const observer = new MutationObserver((records) => {
          stable &&= !records.some((record) =>
            Array.from(record.removedNodes).some((node) => node === entry || node.contains(entry)),
          );
          sample();
          if (sawExit && document.querySelector('[data-slot="drawer-backdrop"]') == null) {
            observer.disconnect();
            cancelAnimationFrame(frame);
            resolve({ stable, sawExit, samples });
          }
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });
        const sampleFrame = () => {
          sample();
          frame = requestAnimationFrame(sampleFrame);
        };
        frame = requestAnimationFrame(sampleFrame);
      }),
  );
  await page.keyboard.press("Escape");
  const observed = await continuity;
  expect(observed.stable).toBe(true);
  expect(observed.sawExit).toBe(true);
  expect(observed.samples).toBeGreaterThan(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pending: Queued 2", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(trigger).toBeVisible();
});

test("pages both lanes independently and reads long queued messages", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-browsing--both-lanes",
  );
  await page.getByRole("button", { name: "Pending: Guide 23, Queued 23", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Guide message 23", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Ordinary message 23", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Show more guiding messages", exact: true }).click();
  await expect(dialog.getByText("Guide message 23", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Ordinary message 23", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Show more queued messages", exact: true }).click();
  await expect(dialog.getByText("Ordinary message 23", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /^Expand pending message: Ordinary message 1/ }).click();
  await expect(dialog.getByText(/END OF LONG MESSAGE/)).toBeVisible();
  await dialog
    .getByRole("button", { name: /^Collapse pending message: Ordinary message 1/ })
    .click();
  await expect(dialog.getByText(/END OF LONG MESSAGE/)).toBeHidden();
});

test("advances response and runtime confirmation separately and resets waiting work", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-browsing--sending");
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const first = page.getByRole("listitem").filter({ hasText: "Ordinary message 1" });
  await expect(first).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 2");
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeEnabled();
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 2");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Response received; waiting for runtime confirmation",
  );
  await page.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 2");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Runtime confirmation received");
  await page.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await expect(first).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 2");
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Pending:/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pending: Queued 1", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Waiting for send response");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pending: Queued 1", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
});

test("hides the empty entry and keeps deletion completion readable", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-browsing--empty");
  await expect(page.getByRole("status")).toHaveText("Current turn is running");
  await expect(page.getByRole("button", { name: /^Pending:/ })).toHaveCount(0);
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-browsing--single-message",
  );
  await page.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Delete this pending message?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No pending messages");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Pending:/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Main draft", exact: true })).toBeFocused();
});

test("keeps read-only pending messages expandable while management is disabled", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-browsing--read-only",
  );
  await page.getByRole("button", { name: "Pending: Queued 3", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Edit", exact: true }).first()).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Delete", exact: true }).first()).toBeDisabled();
  await dialog.getByRole("button", { name: /^Expand pending message: Ordinary message 1/ }).click();
  await expect(dialog.getByText(/END OF LONG MESSAGE/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Pending: Queued 3", exact: true })).toBeFocused();
});
