import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { TranscriptContextPagination } from "@/features/committedTranscriptSurface/TranscriptContextPagination";
import { renderWithProviders } from "@/utils/test-utils";

test("keeps keyboard pagination focus visible in regular and constrained layouts", async () => {
  const originalViewport = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(800, 900);
  try {
    const screen = await renderWithProviders(
      <div
        data-testid="pagination-layout"
        style={{ display: "grid", gap: "16px", position: "relative", width: "min(640px, 100%)" }}
      >
        <button
          aria-label="Focus before context pagination"
          style={{ height: "1px", opacity: 0, position: "absolute", width: "1px" }}
          type="button"
        />
        <div aria-hidden="true" data-testid="pagination-before" style={{ height: "20px" }} />
        <TranscriptContextPagination onPageChange={() => undefined} page={4} totalPages={8} />
        <div aria-hidden="true" data-testid="pagination-after" style={{ height: "20px" }} />
        <button
          aria-label="Focus after context pagination"
          style={{ height: "1px", opacity: 0, position: "absolute", width: "1px" }}
          type="button"
        />
      </div>,
    );

    const layout = screen.getByTestId("pagination-layout").element() as HTMLElement;
    const focusBefore = screen.getByRole("button", {
      name: "Focus before context pagination",
    });
    const focusAfter = screen.getByRole("button", {
      name: "Focus after context pagination",
    });
    const pagination = screen.getByRole("navigation", { name: "Transcript context pages" });
    const previous = pagination.getByRole("button", { name: "Previous context page" });
    const firstPage = pagination.getByRole("button", { name: "Context page 1" });
    const next = pagination.getByRole("button", { name: "Next context page" });
    const paginationElement = pagination.element() as HTMLElement;
    const scrollport = paginationElement.parentElement;
    if (scrollport == null) {
      throw new Error("Expected pagination scrollport");
    }
    const unfocusedShadows = new Map(
      [previous, firstPage, next].map((control) => [
        control.element(),
        getComputedStyle(control.element()).boxShadow,
      ]),
    );
    const unfocusedOutlines = new Map(
      [previous, firstPage, next].map((control) => [
        control.element(),
        getComputedStyle(control.element()).outline,
      ]),
    );
    const expectFocusedClearance = async (control: HTMLElement) => {
      await expect
        .poll(async () => {
          const before = getComputedStyle(control).boxShadow;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                resolve();
              }),
            ),
          );
          return (
            control
              .getAnimations({ subtree: true })
              .every((animation) => animation.playState !== "running" && !animation.pending) &&
            getComputedStyle(control).boxShadow === before
          );
        })
        .toBe(true);
      const controlBounds = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      const context = document.createElement("canvas").getContext("2d");
      if (context == null) throw new Error("Expected canvas color measurement");
      const pixels = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data;
      };
      let backdrop: Element | null = scrollport;
      let background = pixels("white");
      while (backdrop != null) {
        const candidate = pixels(getComputedStyle(backdrop).backgroundColor);
        if (candidate[3] === 255) {
          background = candidate;
          break;
        }
        backdrop = backdrop.parentElement;
      }
      const visibleColor = (color: string) => {
        const actual = pixels(color);
        return (
          (actual[3] ?? 0) > 0 &&
          actual.some((channel, index) => index < 3 && channel !== background[index])
        );
      };
      const shadowOutsets = style.boxShadow.split(/,(?![^()]*\))/).flatMap((shadow) => {
        if (
          unfocusedShadows
            .get(control)
            ?.split(/,(?![^()]*\))/)
            .some((before) => before.trim() === shadow.trim())
        )
          return [];
        const color = /(?:rgba?|[a-z]+)\([^)]*\)/.exec(shadow)?.[0];
        const lengths = shadow
          .replace(/(?:rgba?|[a-z]+)\([^)]*\)/g, "")
          .match(/-?[\d.]+px/g)
          ?.map(Number.parseFloat);
        if (
          shadow.includes("inset") ||
          color == null ||
          !visibleColor(color) ||
          lengths == null ||
          lengths.length < 4
        )
          return [];
        const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
        return [Math.max(Math.abs(x), Math.abs(y)) + blur + spread];
      });
      const outlineOutset =
        style.outline !== unfocusedOutlines.get(control) &&
        style.outlineStyle !== "none" &&
        visibleColor(style.outlineColor)
          ? Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
          : 0;
      const outset = Math.max(0, outlineOutset, ...shadowOutsets);
      expect(outset).toBeGreaterThan(0);
      expect.soft(control.matches(":focus-visible")).toBe(true);
      expect(controlBounds.top - outset).toBeGreaterThanOrEqual(0);
      expect(controlBounds.left - outset).toBeGreaterThanOrEqual(0);
      expect(controlBounds.bottom + outset).toBeLessThanOrEqual(window.innerHeight);
      expect(controlBounds.right + outset).toBeLessThanOrEqual(window.innerWidth);
      const clippingClearances: number[] = [];
      for (
        let ancestor = control.parentElement;
        ancestor != null;
        ancestor = ancestor.parentElement
      ) {
        const ancestorStyle = getComputedStyle(ancestor);
        const bounds = ancestor.getBoundingClientRect();
        if (ancestorStyle.overflowX !== "visible") {
          clippingClearances.push(
            controlBounds.left - outset - bounds.left - ancestor.clientLeft,
            bounds.left + ancestor.clientLeft + ancestor.clientWidth - controlBounds.right - outset,
          );
        }
        if (ancestorStyle.overflowY !== "visible") {
          clippingClearances.push(
            controlBounds.top - outset - bounds.top - ancestor.clientTop,
            bounds.top + ancestor.clientTop + ancestor.clientHeight - controlBounds.bottom - outset,
          );
        }
      }
      expect(clippingClearances.every((clearance) => clearance >= 0)).toBe(true);
    };
    const focusPreviousWithKeyboard = async () => {
      (focusBefore.element() as HTMLElement).focus();
      await userEvent.keyboard("{ArrowRight}");
      await userEvent.tab();
      if (document.activeElement === scrollport) {
        await userEvent.tab();
      }
      await expect.element(previous).toHaveFocus();
    };
    const focusNextWithKeyboard = async () => {
      (focusAfter.element() as HTMLElement).focus();
      await userEvent.keyboard("{ArrowLeft}");
      await userEvent.tab({ shift: true });
      if (document.activeElement === scrollport) {
        await userEvent.tab({ shift: true });
      }
      await expect.element(next).toHaveFocus();
    };

    expect.soft(scrollport.scrollWidth).toBe(scrollport.clientWidth);

    await focusPreviousWithKeyboard();
    await expectFocusedClearance(previous.element() as HTMLElement);
    await userEvent.tab();
    await expect.element(firstPage).toHaveFocus();
    await expectFocusedClearance(firstPage.element() as HTMLElement);
    await focusNextWithKeyboard();
    await expectFocusedClearance(next.element() as HTMLElement);

    layout.style.width = "240px";
    expect.soft(scrollport.scrollWidth).toBeGreaterThan(scrollport.clientWidth);

    scrollport.scrollLeft = 0;
    await focusPreviousWithKeyboard();
    expect.soft(scrollport.scrollLeft).toBe(0);
    await expectFocusedClearance(previous.element() as HTMLElement);
    await userEvent.tab();
    await expect.element(firstPage).toHaveFocus();
    await expectFocusedClearance(firstPage.element() as HTMLElement);

    scrollport.scrollLeft = scrollport.scrollWidth;
    await focusNextWithKeyboard();
    expect.soft(scrollport.scrollLeft).toBe(scrollport.scrollWidth - scrollport.clientWidth);
    await expectFocusedClearance(next.element() as HTMLElement);
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});
