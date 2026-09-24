import { storybookOrigin } from "./servers";
import { expect, test, type Page } from "@playwright/test";
import { expectScrollableContent } from "./storybookTextAssertions";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`all three queue entries navigate without clipping at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--all-queues`,
    );
    const entries = page.getByRole("group", { name: /^Pending:/ });
    await expect(entries.getByRole("button")).toHaveText(["Priority23", "Guide1", "Queued23"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const [entryName, headingName] of [
      ["Queued 23", "Queued 23"],
      ["Guide 1", "Guiding 1"],
      ["Priority 23", "Priority 23"],
    ]) {
      const entry = entries.getByRole("button", { name: entryName, exact: true });
      await entry.click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: headingName, exact: true }),
      ).toBeInViewport();
      const trigger = dialog.getByRole("button", { name: headingName, exact: true });
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Space");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(dialog.getByRole("heading", { level: 3 })).toHaveText([
        "Priority23",
        "Guiding1",
        "Queued23",
      ]);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(entry).toBeFocused();
    }
  });
}

test("opens a priority-only queue and returns to the composer when it drains", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--priority-only`,
  );
  const entries = page.getByRole("group", { name: /^Pending:/ });
  await expect(entries.getByRole("button")).toHaveText(["Priority1"]);
  await entries.getByRole("button", { name: "Priority 1", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Guide message 1", { exact: true })).toBeVisible();
  // Advance the external runtime event without moving focus out of the product dialog.
  await page
    .getByRole("button", {
      name: "Simulate current turn completed",
      exact: true,
      includeHidden: true,
    })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
    });
  await expect(dialog).toHaveCount(0);
  await expect(entries).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Main draft", exact: true })).toBeFocused();
});

test("keeps focus inside the drawer when the focused priority group drains", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--combined`);
  await page.getByRole("button", { name: "Priority 2", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Priority 2", exact: true })).toBeFocused();
  await page
    .getByRole("button", {
      name: "Simulate current turn completed",
      exact: true,
      includeHidden: true,
    })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
    });
  await expect(dialog.getByRole("heading", { name: "Priority 2", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: "Pending details", exact: true })).toBeFocused();
  await expect(dialog.getByRole("heading", { name: "Queued 3", exact: true })).toBeInViewport();
});

test("opens the read-only priority queue in the shared drawer", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--mixed-text-combined`,
  );
  const entries = page.getByRole("group", { name: /^Pending:/ });
  await expect(entries.getByRole("button")).toHaveText(["Priority23", "Queued23"]);
  await expect(
    page.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toHaveCount(0);
  await entries.getByRole("button", { name: "Priority 23", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Pending details", exact: true });
  const heading = dialog.getByRole("heading", { name: "Priority 23", exact: true });
  await expect(heading).toBeInViewport();
  await expect(heading.getByRole("button")).toBeFocused();
  await expect(
    dialog.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  const priority = dialog.getByRole("region", { name: "Priority 23", exact: true });
  await expect(priority.getByRole("listitem")).toHaveCount(23);
  await expect(priority.getByRole("button", { name: /Edit|Delete|Move/ })).toHaveCount(0);
});

for (const interaction of ["focus", "click"] as const) {
  test(`retains drawer focus when a priority preview disappears after ${interaction}`, async ({
    page,
  }) => {
    await page.goto(
      `${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--mixed-text-combined`,
    );
    await page.getByRole("button", { name: "Priority 23", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Pending details", exact: true }).first();
    const fullText = drawer
      .getByRole("region", { name: "Priority 23", exact: true })
      .getByRole("button", { name: "View full message", exact: true })
      .first();
    await fullText[interaction]();
    await page
      .getByRole("button", {
        name: "Simulate current turn completed",
        exact: true,
        includeHidden: true,
      })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
      });
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(drawer.getByRole("heading", { name: "Priority 23", exact: true })).toHaveCount(0);
    await expect
      .poll(() => drawer.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
  });
}

async function inspectMixedRecoveryQueue(page: Page, count: number, detailIndex: number) {
  await page
    .getByRole("group", { name: /^Pending:/ })
    .getByRole("button", { name: `Queued ${String(count)}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const ordinary = dialog.getByRole("group", { name: /^Ordinary message / });
  await expect(ordinary).toHaveCount(20);
  await expect(dialog.getByText("Ordinary message 4", { exact: true })).toBeVisible();
  await expectScrollableContent(ordinary.first());
  await dialog.getByRole("button", { name: "Show more queued messages", exact: true }).click();
  await expect(ordinary).toHaveCount(count);
  await ordinary.last().scrollIntoViewIfNeeded();
  await expect(ordinary.last()).toBeInViewport();
  await dialog
    .getByRole("group", { name: new RegExp(`^Ordinary message ${String(detailIndex)}\\b`) })
    .getByRole("button", { name: "View full message", exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "Pending details", exact: true }).last();
  await expect(detail).toContainText(`END OF Ordinary message ${String(detailIndex)}`);
  await expect(detail).toContainText("end-of-reference");
  await expect(detail).toContainText(/\n\nCheck the narrow-screen/);
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
}

async function assertCombinedRecovery(page: Page) {
  await page
    .getByRole("group", { name: /^Pending:/ })
    .getByRole("button", { name: "Priority 23", exact: true })
    .click();
  await expect(
    page.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  const pending = page.getByRole("dialog", { name: "Pending details", exact: true });
  await expect(pending.getByRole("heading", { name: "Priority 23", exact: true })).toBeVisible();
  const priority = pending
    .getByRole("region", { name: "Priority 23", exact: true })
    .getByRole("listitem");
  await expect(priority).toHaveCount(23);
  await expect(priority.first()).toContainText("Guide message 1");
  await expect(priority.nth(1)).toHaveText("Guide message 2");
  await expectScrollableContent(priority.first());
  await expect(priority.nth(1).getByRole("button", { name: "View full message" })).toHaveCount(0);
  const viewMore = priority.first().getByRole("button", { name: "View full message", exact: true });
  await expect
    .poll(async () => {
      const row = await priority.first().locator('[data-slot="card-content"]').boundingBox();
      const button = await viewMore.boundingBox();
      return row != null && button != null
        ? Math.abs(row.x + row.width - button.x - button.width)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(1);
  await viewMore.click();
  const detail = page.getByRole("dialog", { name: "Pending details", exact: true }).last();
  await expect(detail).toContainText("END OF Guide message 1");
  await expect(detail).toContainText("end-of-reference");
  await expect(detail).toContainText(/\n\nCheck the narrow-screen/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(viewMore).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function assertUnsentRecovery(page: Page) {
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toBeEnabled();
}

async function assertUnknownRecovery(page: Page) {
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Priority / })).toHaveCount(0);
}

async function recoverUnsentMessage(page: Page) {
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
}

const mixedRecoveryCases = [
  {
    preset: "combined",
    count: 23,
    detailIndex: 1,
    assertState: assertCombinedRecovery,
    inspectAfterQueue: assertCombinedRecovery,
  },
  {
    preset: "unsent",
    // Failure retains the first message and reserves the next start without issuing it.
    count: 21,
    detailIndex: 3,
    assertState: assertUnsentRecovery,
    inspectAfterQueue: recoverUnsentMessage,
  },
  {
    preset: "guide-unknown",
    count: 23,
    detailIndex: 1,
    assertState: assertUnknownRecovery,
    inspectAfterQueue: assertUnknownRecovery,
  },
];

for (const width of [375, 1280]) {
  for (const { preset, count, detailIndex, assertState, inspectAfterQueue } of mixedRecoveryCases) {
    test(`previews mixed-text ${preset} recovery at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      const url = `${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--mixed-text-${preset}`;
      const assertInitial = async () => {
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(
          page
            .getByRole("group", { name: /^Pending:/ })
            .getByRole("button", { name: `Queued ${String(count)}`, exact: true }),
        ).toBeVisible();
        await assertState(page);
      };
      await page.goto(url);
      await assertInitial();
      await inspectMixedRecoveryQueue(page, count, detailIndex);
      await inspectAfterQueue(page);
    });
  }
}

test("keeps guide delivery unknown without promoting it to priority", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--guiding`);
  await page.getByRole("button", { name: "Simulate guide unknown", exact: true }).click();
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Priority / })).toHaveCount(0);
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
});

test("recovers a definite send failure manually and can retry another failure", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--unsent`);
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
});

test("keeps accepted guidance pending until runtime confirmation", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--guiding`);
  await page.getByRole("button", { name: "Simulate guide success", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Pending: Guide 1, Queued 3", exact: true })
      .getByRole("button", { name: "Guide 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate guide runtime confirmation", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "Pending: Queued 3", exact: true })
      .getByRole("button", { name: "Queued 3", exact: true }),
  ).toBeVisible();
});

test("queues refused guidance with priority", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--guiding`);
  await page.getByRole("button", { name: "Simulate guide refusal", exact: true }).click();
  await page.getByRole("button", { name: "Priority 1", exact: true }).click();
  await expect(
    page.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priority 1", exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 1", { exact: true })).toBeVisible();
});

test("renders priority, unknown delivery, and recovery availability", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--priority`);
  await expect(page.getByRole("button", { name: "Priority 1", exact: true })).toBeVisible();
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--guide-unknown`,
  );
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--recovery-disabled`,
  );
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toBeDisabled();
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--recovering`);
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toHaveCount(0);
});

test("keeps failed priority guidance ahead of the ordinary queue", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--combined`);
  await expect(page.getByRole("button", { name: "Priority 2", exact: true })).toBeVisible();
  await page
    .getByRole("group", { name: /^Pending:/ })
    .getByRole("button", { name: "Queued 3", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 3");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await page.getByRole("button", { name: "Priority 2", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Priority 2", exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 2", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("group", { name: /^Pending:/ })
      .getByRole("button", { name: "Queued 3", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
});

test("offers ordinary recovery after priority guidance is delivered", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--combined`);
  await expect(page.getByRole("button", { name: "Priority 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Priority / })).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toBeEnabled();
});
