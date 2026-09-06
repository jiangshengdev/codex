import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  getComposerPanel,
  renderComposerTurnControl,
} from "@/features/composerTurnControl/__tests__/composerTurnControlBrowserTestSupport";

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const composerFocusIndicator = (composerPanel: HTMLElement) => {
  const style = window.getComputedStyle(composerPanel);
  return {
    boxShadow: style.boxShadow,
    outline: style.outline,
  };
};

const hasUnclippedFocusPaint = (
  element: HTMLElement,
  restingIndicator: ReturnType<typeof composerFocusIndicator>,
): boolean => {
  const context = document.createElement("canvas").getContext("2d");
  if (context == null) throw new Error("focus color sampling requires a canvas context");
  const colorPixel = (color: string): Uint8ClampedArray => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data;
  };
  let background = colorPixel("white");
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const pixel = colorPixel(getComputedStyle(ancestor).backgroundColor);
    if (pixel[3] === 255) {
      background = pixel;
      break;
    }
  }
  const isVisibleColor = (color: string): boolean => {
    const pixel = colorPixel(color);
    return (
      (pixel[3] ?? 0) > 0 &&
      pixel.some((channel, index) => index < 3 && channel !== background[index])
    );
  };
  const style = getComputedStyle(element);
  if (
    element
      .getAnimations()
      .some((animation) => animation.playState === "running" || animation.pending)
  )
    return false;
  const restingShadows = new Set(
    restingIndicator.boxShadow.split(/,(?![^()]*\))/u).map((shadow) => shadow.trim()),
  );
  let outset = 0;
  for (const shadow of style.boxShadow.split(/,(?![^()]*\))/u)) {
    if (shadow.includes("inset") || restingShadows.has(shadow.trim())) continue;
    const color = /(?:rgba?|[a-z]+)\([^)]*\)/u.exec(shadow)?.[0];
    if (color == null || !isVisibleColor(color)) continue;
    const [x = 0, y = 0, blur = 0, spread = 0] = (
      shadow.replace(color, "").match(/-?[\d.]+px/gu) ?? []
    ).map(Number.parseFloat);
    outset = Math.max(outset, Math.max(Math.abs(x), Math.abs(y)) + blur + spread);
  }
  if (
    style.outline !== restingIndicator.outline &&
    style.outlineStyle !== "none" &&
    style.outlineStyle !== "hidden" &&
    isVisibleColor(style.outlineColor)
  ) {
    outset = Math.max(
      outset,
      Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset),
    );
  }
  if (outset <= 0) return false;
  const rect = element.getBoundingClientRect();
  const paint = {
    left: rect.left - outset,
    right: rect.right + outset,
    top: rect.top - outset,
    bottom: rect.bottom + outset,
  };
  if (
    paint.left < 0 ||
    paint.top < 0 ||
    paint.right > window.innerWidth ||
    paint.bottom > window.innerHeight
  )
    return false;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const ancestorStyle = getComputedStyle(ancestor);
    const bounds = ancestor.getBoundingClientRect();
    if (
      /(auto|scroll|hidden|clip)/u.test(ancestorStyle.overflowX) &&
      (paint.left < bounds.left + ancestor.clientLeft ||
        paint.right > bounds.left + ancestor.clientLeft + ancestor.clientWidth)
    )
      return false;
    if (
      /(auto|scroll|hidden|clip)/u.test(ancestorStyle.overflowY) &&
      (paint.top < bounds.top + ancestor.clientTop ||
        paint.bottom > bounds.top + ancestor.clientTop + ancestor.clientHeight)
    )
      return false;
  }
  return true;
};

test("supports pointer editing and visibly indicates keyboard focus", async () => {
  const screen = await renderComposerTurnControl();
  // The isolated component needs space for focus paint outside its border.
  screen.container.style.paddingBlock = "1rem";
  const composerPanel = getComposerPanel(screen);
  const composer = screen.composer();

  await userEvent.unhover(document.body);
  const restingIndicator = composerFocusIndicator(composerPanel);

  await userEvent.click(composer);
  await expect.element(composer).toHaveFocus();

  await userEvent.keyboard("x");
  await expect.element(composer).toHaveTextContent("x");

  await userEvent.tab();
  await expect.element(composer).not.toHaveFocus();
  await userEvent.tab({ shift: true });
  await expect.element(composer).toHaveFocus();
  await expect.element(composerPanel).toBeVisible();
  // Measure only settled paint added by focus, without fixing its color or size.
  await expect
    .poll(async () => {
      const indicator = composerFocusIndicator(composerPanel);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          }),
        ),
      );
      const settledIndicator = composerFocusIndicator(composerPanel);
      return (
        indicator.boxShadow === settledIndicator.boxShadow &&
        indicator.outline === settledIndicator.outline &&
        hasUnclippedFocusPaint(composerPanel, restingIndicator)
      );
    })
    .toBe(true);
});
