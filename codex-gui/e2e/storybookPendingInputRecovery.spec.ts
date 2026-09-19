import { expect, test, type Page } from "@playwright/test";
import { expectScrollableContent } from "./storybookTextAssertions";

test.use({ locale: "en" });

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
  await expect(
    page.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  const pending = page.getByRole("region", { name: "Pending messages", exact: true });
  await expect(
    pending.getByRole("heading", { name: "Will send first", exact: true }),
  ).toBeVisible();
  const priority = pending.getByRole("listitem");
  await expect(priority).toHaveCount(23);
  await expect(priority.first()).toContainText("Guide message 1");
  await expect(priority.nth(1)).toHaveText("Guide message 2");
  await expectScrollableContent(priority.first());
}

async function assertUnsentRecovery(page: Page) {
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toBeEnabled();
}

async function assertUnknownRecovery(page: Page) {
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(0);
}

async function recoverUnsentMessage(page: Page) {
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeDisabled();
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
      const url = `http://localhost:6006/iframe.html?id=composer-pending-input-recovery--mixed-text-${preset}`;
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
      await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
      await assertInitial();
      await page.reload();
      await assertInitial();
      await page.goto(
        "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guiding",
      );
      await expect(
        page.getByRole("group", { name: "Pending: Guide 1, Queued 3", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Guide status unknown", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(
        0,
      );
      await page.goto(url);
      await assertInitial();
    });
  }
}

test("keeps guide delivery unknown until reset without promoting it to priority", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guiding");
  await expect(
    page.getByRole("button", { name: "Simulate guide unknown", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Simulate guide unknown", exact: true }).click();
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect(page.getByText("Will send first", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate guide success", exact: true }),
  ).toBeDisabled();
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByText("Guide status unknown", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate guide success", exact: true }),
  ).toBeEnabled();
});

test("recovers a definite send failure manually and can retry another failure", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--unsent");
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Simulate send failure", exact: true }),
  ).toBeDisabled();
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate send failure", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
});

test("distinguishes accepted guidance from priority fallback and exposes recovery presets", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guiding");
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
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await page.getByRole("button", { name: "Simulate guide refusal", exact: true }).click();
  await expect(
    page.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 1", { exact: true })).toBeVisible();
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--priority");
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guide-unknown",
  );
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guide-accepted",
  );
  await expect(
    page.getByRole("button", { name: "Simulate guide runtime confirmation", exact: true }),
  ).toBeEnabled();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--recovery-disabled",
  );
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toBeDisabled();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--recovering",
  );
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--combined");
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await page
    .getByRole("group", { name: "Pending: Queued 3", exact: true })
    .getByRole("button", { name: "Queued 3", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 3");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 2", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Pending: Queued 3", exact: true })
      .getByRole("button", { name: "Queued 3", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toBeEnabled();
});
