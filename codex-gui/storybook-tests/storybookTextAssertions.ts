import { expect, type Locator } from "@playwright/test";

/** Observe a real scroll container, rather than inferring scrolling from record count. */
export async function expectScrollableContent(content: Locator) {
  await expect
    .poll(() =>
      content.evaluate((element) => {
        for (let parent: Element | null = element; parent != null; parent = parent.parentElement) {
          const overflow = getComputedStyle(parent).overflowY;
          if (
            (overflow === "auto" || overflow === "scroll") &&
            parent.scrollHeight > parent.clientHeight
          ) {
            parent.scrollTop = parent.scrollHeight;
            const moved = parent.scrollTop > 0;
            parent.scrollTop = 0;
            return moved;
          }
        }
        const root = document.scrollingElement;
        if (root == null) return false;
        root.scrollTop = root.scrollHeight;
        const moved = root.scrollTop > 0;
        root.scrollTop = 0;
        return moved;
      }),
    )
    .toBe(true);
}
