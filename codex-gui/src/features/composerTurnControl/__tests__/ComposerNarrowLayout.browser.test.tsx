import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderComposerTurnControl } from "./composerTurnControlBrowserTestSupport";

for (const width of [160, 320, 1280]) {
  test(`composer controls stay inside the panel at ${String(width)}px`, async () => {
    const previous = { width: window.innerWidth, height: window.innerHeight };
    try {
      await page.viewport(width, 568);
      const screen = await renderComposerTurnControl({ scenario: { type: "activeFixture" } });
      const panel = screen.container.querySelector(".composer-panel");
      if (!(panel instanceof HTMLElement)) throw new Error("Composer panel is missing");
      const bounds = panel.getBoundingClientRect();
      expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth + 1);
      for (const button of panel.querySelectorAll("button")) {
        const rect = button.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(bounds.left);
        expect(rect.right).toBeLessThanOrEqual(bounds.right + 1);
      }
    } finally {
      await page.viewport(previous.width, previous.height);
    }
  });
}
