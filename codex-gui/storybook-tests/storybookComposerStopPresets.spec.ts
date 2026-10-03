import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.describe("Chinese stop failure layout", () => {
  test.use({ locale: "zh-CN" });

  for (const width of [320, 1280]) {
    test(`keeps stop feedback and actions inside the composer at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 568 });
      await page.goto(
        `${storybookOrigin}/iframe.html?id=composer-input-and-send-stop--stop-failed`,
      );
      const composer = page.getByRole("region", { name: "消息输入区", exact: true });
      await expect(composer.getByText("停止失败", { exact: true })).toBeVisible();
      for (const name of ["停止", "引导", "发送"]) {
        await expect(composer.getByRole("button", { name, exact: true })).toBeEnabled();
      }
      await expect
        .poll(() =>
          composer.evaluate((element) => {
            const panel = element.querySelector(".composer-panel");
            if (!panel) return false;
            const bounds = panel.getBoundingClientRect();
            return Array.from(panel.querySelectorAll("button, [role='status']")).every(
              (control) => {
                const rect = control.getBoundingClientRect();
                return rect.left >= bounds.left && rect.right <= bounds.right;
              },
            );
          }),
        )
        .toBe(true);
      for (const [first, second] of [
        [
          composer.getByText("停止失败", { exact: true }),
          composer.getByRole("button", { name: "停止", exact: true }),
        ],
        [
          composer.getByRole("button", { name: "引导", exact: true }),
          composer.getByRole("button", { name: "发送", exact: true }),
        ],
      ] as const) {
        await expect
          .poll(async () => {
            const firstBounds = await first.boundingBox();
            const secondBounds = await second.boundingBox();
            if (!firstBounds || !secondBounds) return false;
            return (
              Math.abs(
                firstBounds.y + firstBounds.height / 2 - (secondBounds.y + secondBounds.height / 2),
              ) < 1
            );
          })
          .toBe(true);
      }
    });
  }
});

test("stop failure preset keeps the turn active and allows retry without clearing the draft", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-stop--stop-failed`);
  const failed = page.getByText("Stop failed", { exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(failed).toBeVisible();
  await expect(stop).toBeEnabled();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toHaveText("Keep this draft while stopping.");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await stop.click();
  await expect(failed).toHaveCount(0);
  await expect(stop).toHaveAttribute("data-pending", "true");
  await page.getByRole("button", { name: "Simulate stop response", exact: true }).click();
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toHaveText("Keep this draft while stopping.");
});

test("unknown stop preset does not retry and retains input until termination", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-stop--stop-unknown`);
  const preview = page;
  const stop = preview.getByRole("button", { name: "Stop", exact: true });
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(stop).toBeDisabled();
  await expect(preview.getByText("Stop failed", { exact: true })).toHaveCount(0);
  await editor.fill("Editable while stop is unknown");
  await expect(preview.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(preview.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await expect(stop).toBeDisabled();
  await preview
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toHaveText("Editable while stop is unknown");
});

test("accepted stop preset remains active and allows queueing until runtime termination", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-stop--stop-accepted`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(stop).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await editor.fill("Separate draft after accepted stop");
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(editor).toHaveText("Separate draft after accepted stop");
});

test("stop request preset retains editable input and waits separately for response and termination", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-input-and-send-stop--stop-request-pending`,
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  const response = page.getByRole("button", { name: "Simulate stop response", exact: true });
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(stop).toBeDisabled();
  await expect(editor).toHaveText("Keep this draft while stopping.");
  await expect(send).toBeEnabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await editor.fill("Edited while waiting");
  await response.click();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toHaveText("Edited while waiting");
  await expect(send).toBeEnabled();
});
