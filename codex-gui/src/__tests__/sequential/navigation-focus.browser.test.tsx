import { expect, test } from "vitest";
import {
  currentThreadId,
  renderTopBar,
} from "@/features/appShell/__tests__/appShellTopBarBrowserTestSupport";

// Focus visuals require an active browser page throughout measurement.
test("Drawer preserves the full focus ring around the current task navigation button", async () => {
  const { screen } = await renderTopBar({
    initialEntry: `/task/${currentThreadId}`,
    routeTarget: { type: "currentTask", threadId: currentThreadId },
  });

  await screen.getByRole("button", { name: "Menu" }).click();
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  const currentTaskButton = navigation.getByRole("button", {
    name: "Current task",
    exact: true,
  });
  const drawerBody = navigation.element().parentElement;

  if (drawerBody == null) {
    throw new Error("Expected navigation to be a direct child of Drawer.Body");
  }
  const unfocusedShadow = getComputedStyle(currentTaskButton.element()).boxShadow;
  const unfocusedOutline = getComputedStyle(currentTaskButton.element()).outline;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await screen.user.tab();
    if (document.activeElement === currentTaskButton.element()) {
      break;
    }
  }

  await expect.element(currentTaskButton).toHaveFocus();
  const buttonElement = currentTaskButton.element();
  await expect
    .poll(async () => {
      const before = getComputedStyle(buttonElement).boxShadow;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          }),
        ),
      );
      return (
        screen
          .getByRole("dialog", { name: "Navigation" })
          .element()
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState !== "running" && !animation.pending) &&
        getComputedStyle(buttonElement).boxShadow === before
      );
    })
    .toBe(true);
  const buttonBounds = buttonElement.getBoundingClientRect();
  const style = getComputedStyle(buttonElement);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context == null) throw new Error("Expected canvas color measurement");
  const pixels = (color: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data;
  };
  let backdrop: Element | null = drawerBody;
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
    if (unfocusedShadow.split(/,(?![^()]*\))/).some((before) => before.trim() === shadow.trim()))
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
    style.outline !== unfocusedOutline &&
    style.outlineStyle !== "none" &&
    visibleColor(style.outlineColor)
      ? Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
      : 0;
  const focusRingOutset = Math.max(0, outlineOutset, ...shadowOutsets);
  expect(focusRingOutset).toBeGreaterThan(0);

  expect.soft(buttonElement.matches(":focus-visible")).toBe(true);
  expect(buttonBounds.top - focusRingOutset).toBeGreaterThanOrEqual(0);
  expect(buttonBounds.left - focusRingOutset).toBeGreaterThanOrEqual(0);
  expect(buttonBounds.bottom + focusRingOutset).toBeLessThanOrEqual(window.innerHeight);
  expect(buttonBounds.right + focusRingOutset).toBeLessThanOrEqual(window.innerWidth);
  const clippingClearances: number[] = [];
  for (
    let ancestor = buttonElement.parentElement;
    ancestor != null;
    ancestor = ancestor.parentElement
  ) {
    const ancestorStyle = getComputedStyle(ancestor);
    const bounds = ancestor.getBoundingClientRect();
    if (ancestorStyle.overflowX !== "visible") {
      clippingClearances.push(
        buttonBounds.left - focusRingOutset - bounds.left - ancestor.clientLeft,
        bounds.left +
          ancestor.clientLeft +
          ancestor.clientWidth -
          buttonBounds.right -
          focusRingOutset,
      );
    }
    if (ancestorStyle.overflowY !== "visible") {
      clippingClearances.push(
        buttonBounds.top - focusRingOutset - bounds.top - ancestor.clientTop,
        bounds.top +
          ancestor.clientTop +
          ancestor.clientHeight -
          buttonBounds.bottom -
          focusRingOutset,
      );
    }
  }
  expect(clippingClearances.every((clearance) => clearance >= 0)).toBe(true);
});
