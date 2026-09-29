import { expect, test } from "@playwright/test";
import {
  DEV_VISIBILITY_CHANGED,
  type DevVisibility,
} from "../src/storybook/environment/devVisibility";

test.use({ locale: "en" });

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(locale, () => {
    test.use({ locale });

    for (const [story, english, chinese] of [
      ["app-shell-shortcuts-focus--toggle-menu", "Focus the message input", "将焦点移到消息输入框"],
      ["app-shell-shortcuts-focus--focus-composer", "Focus Menu", "先将焦点移到“菜单”"],
      [
        "app-shell-shortcuts-tasks--previous-task",
        "K selects the previous task",
        "使用带 K 的快捷键",
      ],
      [
        "new-session-shortcuts-open--from-task",
        "Open the unsent new-session draft",
        "打开尚未发送的新会话草稿",
      ],
      ["composer-shortcuts-send--send", "Focus the input. Enter sends", "将焦点移入输入框。Enter"],
      [
        "composer-shortcuts-guide--guide",
        "Focus the input and press Command+Enter",
        "将焦点移入输入框并按 Command+Enter",
      ],
    ] as const) {
      test(`${story} localizes its instructions`, async ({ page }) => {
        await page.goto(`/iframe.html?id=${story}`);
        const instructions = page.getByRole("region", {
          name: locale === "en" ? "Shortcut instructions" : "快捷键操作说明",
        });
        await expect(instructions).toBeVisible();
        await expect(instructions).toContainText(locale === "en" ? english : chinese);
        await expect(instructions).toContainText(
          locale === "en" ? "This story waits for manual input." : "本场景等待手动操作",
        );
        await expect(instructions.locator("p").first()).toContainText("macOS");
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
      });
    }
  });
}

for (const width of [375, 1280]) {
  for (const story of [
    "app-shell-shortcuts-focus--toggle-menu",
    "app-shell-shortcuts-tasks--previous-task",
    "new-session-shortcuts-open--from-task",
  ]) {
    test(`${story} keeps instructions below the header without DEV at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/iframe.html?id=${story}`);
      const header = page.getByRole("banner");
      await expect(header).toBeVisible();
      await page.evaluate(
        ({ event, visibility }) => {
          const preview = window as typeof window & {
            __STORYBOOK_ADDONS_CHANNEL__: { emit: (name: string, value: DevVisibility) => void };
          };
          preview.__STORYBOOK_ADDONS_CHANNEL__.emit(event, visibility);
        },
        { event: DEV_VISIBILITY_CHANGED, visibility: { visible: false } },
      );
      // Wait for the setup operation to finish before measuring the instructions.
      await page
        .getByRole("group", { name: "DEV", exact: true })
        .first()
        .waitFor({ state: "hidden" });
      const instructions = page.getByRole("region", { name: "Shortcut instructions" });
      await expect(instructions).toBeInViewport();
      const headerBottom = await header.evaluate(
        (element) => element.getBoundingClientRect().bottom,
      );
      const keys = instructions.locator("p").first();
      await expect
        .poll(() => keys.evaluate((element) => element.getBoundingClientRect().top))
        .toBeGreaterThanOrEqual(headerBottom);
      const bounds = await instructions.evaluate((element) => {
        const { left, right, bottom } = element.getBoundingClientRect();
        return { left, right, bottom };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width);
      expect(bounds.bottom).toBeLessThanOrEqual(800);
    });
  }
}
