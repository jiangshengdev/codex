import { expect, test, type Locator } from "@playwright/test";

test.use({ locale: "en" });

test("saving failure opens with retained text and skill, recovers, and resets to failure", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--saving-failed");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const failure = page.getByText("Changes could not be saved", { exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(failure).toBeVisible();
  await expect(editor).toContainText("Review this fictional change.");
  await expect(
    page.getByRole("group", { name: "preview-review skill details", exact: true }),
  ).toBeVisible();
  await expect(send).toBeDisabled();
  await editor.press("End");
  await editor.pressSequentially(" Unsaved edit.");
  await expect(editor).toContainText("Unsaved edit.");
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(failure).toBeVisible();
  await page.getByRole("button", { name: "Restore simulated storage", exact: true }).click();
  await expect(failure).toBeVisible();
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(failure).toHaveCount(0);
  await editor.pressSequentially(" Keep this edit.");
  await page.getByRole("button", { name: "Simulate leaving", exact: true }).click();
  await page.getByRole("button", { name: "Simulate returning", exact: true }).click();
  await expect(editor).toContainText("Keep this edit.");
  await expect(failure).toHaveCount(0);
  await send.click();
  await expect(editor).toBeEmpty();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(failure).toBeVisible();
  await expect(editor).not.toContainText("Keep this edit.");
  await expect(send).toBeDisabled();
});

async function appearance(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      radius: style.borderRadius,
      shadow: style.boxShadow,
      padding: style.padding,
      gap: style.gap,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
    };
  });
}

async function surfaceAppearance(locator: Locator) {
  const style = await appearance(locator);
  // Typography belongs to the visible title/description, not the host's inherited text style.
  return {
    background: style.background,
    radius: style.radius,
    shadow: style.shadow,
    padding: style.padding,
    gap: style.gap,
  };
}

for (const width of [375, 1280]) {
  test(`saving failure matches connection recovery presentation at ${String(width)}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--saving-failed");
    const panel = page.getByRole("alert");
    const title = panel.getByText("Changes could not be saved", { exact: true });
    const description = panel.getByText(
      "Your input is still here. Sending is blocked until saving succeeds.",
      { exact: true },
    );
    const retry = panel.getByRole("button", { name: "Retry saving", exact: true });
    const diagnostics = panel.getByRole("button", { name: "View diagnostic information" });
    await expect(panel).toBeVisible();

    const reference = await context.newPage();
    await reference.setViewportSize({ width, height: 900 });
    await reference.goto(
      "http://localhost:6006/iframe.html?id=feedback-connection-recovery-states--reconnect-failed",
    );
    const baseline = reference.getByRole("alert");
    await expect(baseline).toBeVisible();
    // Match the container width without changing viewport-dependent button sizing.
    const panelWidth = await panel.evaluate((element) => element.getBoundingClientRect().width);
    await baseline.evaluate((element, availableWidth) => {
      element.style.width = `${String(availableWidth)}px`;
    }, panelWidth);
    const baselineRetry = baseline.getByRole("button", { name: "Reconnect", exact: true });
    const baselineDiagnostics = baseline.getByRole("button", {
      name: "View diagnostic information",
    });

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await reference.emulateMedia({ colorScheme });
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await expect(reference.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await expect.poll(() => surfaceAppearance(panel)).toEqual(await surfaceAppearance(baseline));
      expect(await appearance(title)).toEqual(
        await appearance(baseline.getByText("Connection closed", { exact: true })),
      );
      expect(await appearance(description)).toEqual(
        await appearance(
          baseline.getByText("The connection could not be restored. You can try again.", {
            exact: true,
          }),
        ),
      );
      expect(await appearance(panel.locator("svg").first())).toEqual(
        await appearance(baseline.locator("svg").first()),
      );
      await expect(async () => {
        expect(await appearance(retry)).toEqual(await appearance(baselineRetry));
        expect(await appearance(diagnostics)).toEqual(await appearance(baselineDiagnostics));
      }).toPass();
      expect(await retry.evaluate((element) => element.getBoundingClientRect().height)).toBe(
        await baselineRetry.evaluate((element) => element.getBoundingClientRect().height),
      );
      await expect
        .poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      await expect(async () => {
        const textBox = await description.boundingBox();
        const diagnosticBox = await diagnostics.boundingBox();
        const retryBox = await retry.boundingBox();
        expect(textBox).not.toBeNull();
        expect(diagnosticBox).not.toBeNull();
        expect(retryBox).not.toBeNull();
        if (textBox == null || diagnosticBox == null || retryBox == null) return;
        expect(diagnosticBox.x).toBe(textBox.x);
        expect(diagnosticBox.y - (textBox.y + textBox.height)).toBe(8);
        const titleBox = await title.boundingBox();
        expect({
          separateActionArea:
            width === 375
              ? retryBox.y >= diagnosticBox.y + diagnosticBox.height
              : retryBox.x >= textBox.x + textBox.width,
          alignedAction: width === 375 ? retryBox.x === textBox.x : retryBox.y === titleBox?.y,
        }).toEqual({ separateActionArea: true, alignedAction: true });
      }).toPass();
    }
    await diagnostics.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
    await expect(dialog).toContainText("Browser persistence failed: write");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(diagnostics).toBeFocused();
    await reference.close();
  });
}

test("existing pending edit error panels retain the connection recovery presentation", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--running-queue");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("$preview");
  await page.getByRole("option", { name: /preview-review/ }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Simulate skill unavailable", exact: true }).click();
  await page.getByRole("button", { name: "Queued 1", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const invalid = page.getByRole("alert");
  await expect(invalid).toContainText("Remove or replace invalid skills before saving.");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  const reference = await context.newPage();
  await reference.setViewportSize({ width: 375, height: 900 });
  await reference.goto(
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-states--reconnect-failed",
  );
  const baseline = reference.getByRole("alert");
  await expect(baseline).toBeVisible();
  expect(await surfaceAppearance(invalid)).toEqual(await surfaceAppearance(baseline));
  expect(await appearance(invalid.getByText("Invalid skill", { exact: true }))).toEqual(
    await appearance(baseline.getByText("Connection closed", { exact: true })),
  );
  await expect(invalid.getByRole("button")).toHaveCount(0);
  const pendingEditor = page.getByRole("combobox", { name: "Edit pending message", exact: true });
  await pendingEditor.fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const empty = page.getByRole("alert");
  await expect(empty).toContainText("Message cannot be empty");
  expect(await surfaceAppearance(empty)).toEqual(await surfaceAppearance(baseline));
  await expect(empty.getByRole("button")).toHaveCount(0);
  await expect
    .poll(() => empty.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
  await pendingEditor.fill("Recovered pending message");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Recovered pending message");
  await reference.close();
});
