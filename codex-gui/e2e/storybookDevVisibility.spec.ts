import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

const storybookUrl = process.env.STORYBOOK_URL ?? "http://localhost:6006";

test("the toolbar removes DEV DOM while preserving the current editing scenario", async ({
  page,
}) => {
  await page.goto(`${storybookUrl}/?path=/story/composer-pending-input-editing--interactive`);
  const preview = page.frameLocator("#storybook-preview-iframe");
  const toggle = page.getByRole("switch", { name: "Show DEV controls", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await preview.getByRole("radio", { name: "Dark theme", exact: true }).click();
  const draft = preview.getByRole("textbox", { name: "Main draft", exact: true });
  await draft.fill("Keep my main draft");
  await preview.getByRole("button", { name: "Queued 1", exact: true }).click();
  await preview.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = preview.getByRole("combobox", { name: "Edit pending message", exact: true });
  await editor.fill("Keep my pending edit");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(
    preview.getByRole("group", { name: "DEV", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await expect(draft).toHaveCount(0);
  await expect(
    preview.getByRole("button", { name: "Restart simulation", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await expect(
    preview.getByRole("radiogroup", { name: "Theme preference", includeHidden: true }),
  ).toHaveCount(0);
  await expect(editor).toHaveText("Keep my pending edit");
  await expect(preview.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(preview.locator("#storybook-root > *")).toHaveCount(1);
  const pending = preview.getByRole("region", {
    name: "Pending messages",
    exact: true,
    includeHidden: true,
  });
  await expect(pending).toHaveJSProperty("previousElementSibling", null);
  await expect(pending).toHaveJSProperty("nextElementSibling", null);
  await toggle.click();
  await expect(editor).toHaveText("Keep my pending edit");
  await preview.getByRole("button", { name: "Simulate editing session lost", exact: true }).click();
  const retained = preview.getByRole("textbox", { name: "Unsaved pending message", exact: true });
  await toggle.click();
  await expect(retained).toHaveValue("Keep my pending edit");
  await expect(preview.getByRole("alert")).toContainText(
    "This editing session is no longer available.",
  );
  await expect(
    preview.getByRole("group", { name: "DEV", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(retained).toHaveValue("Keep my pending edit");
  await expect(draft).toHaveValue("Keep my main draft");
});

test("keeps the DEV choice across stories but resets it on reload", async ({ page }) => {
  await page.goto(`${storybookUrl}/?path=/story/environment-stateful--empty`);
  const preview = page.frameLocator("#storybook-preview-iframe");
  const toggle = page.getByRole("switch", { name: "Show DEV controls", exact: true });
  await preview.getByRole("button", { name: "Create read-model slot", exact: true }).click();
  await toggle.click();
  await expect(
    preview.getByRole("group", { name: "DEV", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(preview.getByRole("status")).toHaveText("Redux slots: 1; route: /");
  await toggle.click();
  await page.getByRole("link", { name: "Seeded", exact: true }).click();
  await expect(page).toHaveURL(/environment-stateful--seeded/);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(
    preview.getByRole("group", { name: "DEV", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(preview.getByRole("status")).toHaveText("Redux slots: 1; route: /");
  await page.getByRole("link", { name: "Empty", exact: true }).click();
  await expect(preview.getByRole("status")).toHaveText("Redux slots: 0; route: /");
});

test("controls every Docs preview without removing business notices", async ({ page }) => {
  await page.goto(`${storybookUrl}/?path=/docs/feedback-connection-recovery-states--docs`);
  const docs = page.frameLocator("#storybook-preview-iframe");
  const toggle = page.getByRole("switch", { name: "Show DEV controls", exact: true });
  const boundaries = docs.getByRole("group", { name: "DEV", exact: true, includeHidden: true });
  // The primary example and five listed stories each render a theme DEV region.
  await expect(boundaries).toHaveCount(6);
  const notice = docs
    .locator("#story--feedback-connection-recovery-states--playground--primary")
    .getByRole("status");
  await expect(notice).toContainText("Connection closed");
  await toggle.click();
  await expect(boundaries).toHaveCount(0);
  await expect(notice).toContainText("Connection closed");
  await toggle.click();
  await expect(boundaries).toHaveCount(6);
});

test("standalone previews retain their default controls without an internal switch", async ({
  page,
}) => {
  await page.goto(`${storybookUrl}/iframe.html?id=environment-stateful--empty`);
  await expect(page.getByRole("group", { name: "DEV", exact: true })).toHaveCount(2);
  await expect(page.getByRole("switch", { name: "Show DEV controls", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create read-model slot", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Redux slots: 1; route: /");
});
