import { expect, type ElementHandle, type Locator, type Page } from "@playwright/test";

export type DocumentWheelInput = {
  kind: "wheel";
  x: number;
  y: number;
  deltasY: number[];
};

/** Read the native document and the evidence owner's ancestor scrollports. */
export async function readDocumentPosition(evidence: Locator) {
  return evidence.evaluate((element) => {
    const root = document.scrollingElement;
    if (root !== document.documentElement && root !== document.body)
      throw new Error("No native document scrollport");
    const nestedScrollports: { tag: string; overflowY: string; extent: number }[] = [];
    for (
      let ancestor: Element | null = element;
      ancestor != null;
      ancestor = ancestor.parentElement
    ) {
      // HTML/body overflow participates in the viewport's native propagation.
      if (ancestor === root || ancestor === document.documentElement || ancestor === document.body)
        continue;
      const overflowY = getComputedStyle(ancestor).overflowY;
      const extent = ancestor.scrollHeight - ancestor.clientHeight;
      if (extent > 0.5 && ["auto", "scroll", "hidden", "clip"].includes(overflowY))
        nestedScrollports.push({ tag: ancestor.tagName, overflowY, extent });
    }
    return {
      scrollport: "document" as const,
      tag: root.tagName,
      scrollTop: root.scrollTop,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      overflowY: getComputedStyle(root).overflowY,
      windowY: window.scrollY,
      documentFocused: document.hasFocus(),
      nestedScrollports,
    };
  });
}

/** Handles retain identity; this never re-resolves, restores or moves focus. */
export async function assertDocumentFocus(
  target: ElementHandle,
  paintedOwner?: ElementHandle<HTMLElement | SVGElement>,
) {
  expect(
    await target.evaluate(
      (element) => element.isConnected && document.hasFocus() && document.activeElement === element,
    ),
    "Document wheel must retain the original real keyboard focus",
  ).toBe(true);
  if (paintedOwner != null) {
    expect(
      await paintedOwner.evaluate(
        (owner, focused) =>
          owner.isConnected && owner.contains(focused) && owner.matches(":focus-within"),
        target,
      ),
      "Document wheel must retain the original painted focus owner",
    ).toBe(true);
  }
}

/**
 * Wheel to a fixed document position, retaining the supplied focused element.
 * The caller owns state preparation, pointer selection, capture and visual verdict.
 * Input is appended before each wheel so callers retain attempted deltas on failure.
 */
export async function wheelDocumentToPosition(
  page: Page,
  evidence: Locator,
  target: ElementHandle<HTMLElement | SVGElement>,
  input: DocumentWheelInput,
  desiredPosition: number,
  paintedOwner?: ElementHandle<HTMLElement | SVGElement>,
  assertRetainedState?: () => Promise<void>,
) {
  const initial = await readDocumentPosition(evidence);
  const maximum = initial.scrollHeight - initial.clientHeight;
  expect(maximum, "Document must overflow").toBeGreaterThan(0.5);
  expect(desiredPosition).toBeGreaterThanOrEqual(0);
  expect(desiredPosition).toBeLessThanOrEqual(maximum);
  const assertPosition = async () => {
    await assertDocumentFocus(target, paintedOwner);
    const current = await readDocumentPosition(evidence);
    expect(current.nestedScrollports, "Evidence must belong to native document scrolling").toEqual(
      [],
    );
    expect(current.scrollHeight, "Document extent changed during wheel journey").toBe(
      initial.scrollHeight,
    );
    expect(current.clientHeight, "Document viewport changed during wheel journey").toBe(
      initial.clientHeight,
    );
    expect(Math.abs(current.windowY - current.scrollTop)).toBeLessThanOrEqual(0.5);
    return current;
  };
  let position = await assertPosition();
  if (assertRetainedState != null) await assertRetainedState();
  await page.mouse.move(input.x, input.y);
  while (Math.abs(position.scrollTop - desiredPosition) > 0.5) {
    // A nested list/editor/menu under the pointer would consume this wheel first.
    const pointerScrollports = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      if (hit == null) throw new Error("Wheel pointer does not hit the document");
      const nested: { tag: string; overflowY: string; extent: number }[] = [];
      for (let element: Element | null = hit; element != null; element = element.parentElement) {
        if (element === document.documentElement || element === document.body) continue;
        const overflowY = getComputedStyle(element).overflowY;
        const extent = element.scrollHeight - element.clientHeight;
        if (extent > 0.5 && ["auto", "scroll", "hidden", "clip"].includes(overflowY))
          nested.push({ tag: element.tagName, overflowY, extent });
      }
      return nested;
    }, input);
    expect(pointerScrollports, "Wheel pointer must not target a nested scrollport").toEqual([]);
    const before = position.scrollTop;
    const deltaY = desiredPosition - before;
    if (assertRetainedState != null) await assertRetainedState();
    input.deltasY.push(deltaY);
    await page.mouse.wheel(0, deltaY);
    if (assertRetainedState != null) await assertRetainedState();
    await expect
      .poll(
        async () => {
          const current = await assertPosition();
          return (current.scrollTop - before) * Math.sign(deltaY) > 0.5;
        },
        { message: "Each wheel input must make progress toward the document position" },
      )
      .toBe(true);
    position = await assertPosition();
    if (assertRetainedState != null) await assertRetainedState();
  }
  position = await assertPosition();
  if (assertRetainedState != null) await assertRetainedState();
  expect(Math.abs(position.scrollTop - desiredPosition)).toBeLessThanOrEqual(0.5);
  return position;
}
