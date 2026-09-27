import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { assertDocumentFocus } from "./focusDocumentBoundaries";
import { beginFocusDirectionReplay } from "./focusEvidenceReplay";

/** Shared browser-side scope check for observations and state-preparation controls. */
export function isProductElement(element: Node | null) {
  if (!(element instanceof Element)) return false;
  for (let parent: Element | null = element; parent != null; parent = parent.parentElement) {
    if (parent.getAttribute("role") !== "group") continue;
    const labels = parent.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
    if (
      parent.getAttribute("aria-label") === "DEV" ||
      labels.some((id) => document.getElementById(id)?.textContent.trim() === "DEV")
    )
      return false;
  }
  return true;
}

/** Browser-side stability data for the focused surface and independently portaled tooltips. */
function focusSnapshot() {
  const active = document.activeElement;
  const nodes = new Set<Element>();
  const addChain = (node: Element | null) => {
    for (let element = node; element != null; element = element.parentElement) nodes.add(element);
  };
  addChain(active);
  const activeDescendant = active?.getAttribute("aria-activedescendant");
  if (activeDescendant != null) addChain(document.getElementById(activeDescendant));
  const tooltipRoots = document.querySelectorAll('[role="tooltip"], .tooltip');
  for (const tooltip of tooltipRoots) {
    addChain(tooltip);
    for (const child of tooltip.querySelectorAll("*")) nodes.add(child);
  }
  const chain = [...nodes].map((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return [
      element.tagName,
      element.id,
      element.getAttribute("aria-label"),
      element.getAttribute("aria-selected"),
      element.getAttribute("aria-describedby"),
      element.getAttribute("data-entering"),
      element.getAttribute("data-exiting"),
      style.outline,
      style.outlineOffset,
      style.boxShadow,
      style.backgroundColor,
      style.opacity,
      style.transform,
      style.visibility,
      style.display,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      element.scrollLeft,
      element.scrollTop,
    ];
  });
  const animating = [...nodes].some((element) =>
    element
      .getAnimations()
      .some(
        (animation) =>
          animation.effect?.getTiming().iterations !== Infinity &&
          (animation.pending || animation.playState === "running"),
      ),
  );
  const transitioningTooltip = [...tooltipRoots].some(
    (element) => element.hasAttribute("data-entering") || element.hasAttribute("data-exiting"),
  );
  return {
    value: JSON.stringify({ chain, activeDescendant, documentFocused: document.hasFocus() }),
    animating: animating || transitioningTooltip,
  };
}

/** Settle real keyboard focus before identifying a Tab stop or measuring it. */
export async function waitForStableFocusSnapshot(page: Page) {
  let priorSnapshot = "";
  let stableSince = 0;
  await expect
    .poll(
      async () => {
        const snapshot = await page.evaluate(focusSnapshot);
        if (snapshot.animating || snapshot.value !== priorSnapshot) {
          stableSince = Date.now();
          priorSnapshot = snapshot.value;
          return false;
        }
        return Date.now() - stableSince >= 100;
      },
      { intervals: [50, 50, 100] },
    )
    .toBe(true);
  return page.evaluate(focusSnapshot);
}

/** Raw observations, not an accessibility or screenshot verdict. */
export async function observeKeyboardFocus(page: Page, testInfo: TestInfo, state: string) {
  const initial = await observeCurrentFocus(page, testInfo, `${state}-initial`);
  const forward = await observeDirection(page, testInfo, `${state}-forward`, "Tab");
  const backward = await observeDirection(page, testInfo, `${state}-backward`, "Shift+Tab");
  return [...initial, ...forward, ...backward];
}

/** Capture an already keyboard-focused menu item without Tab dismissing its menu. */
export async function observeCurrentFocus(page: Page, testInfo: TestInfo, state: string) {
  return observeDirection(page, testInfo, state, null);
}

/** A visible product surface whose wheel cannot be consumed by an inner scrollport. */
function productWheelPoint(
  element: Element,
  input: { axis: "x" | "y"; point?: { x: number; y: number } },
) {
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left + element.clientLeft);
  const top = Math.max(0, rect.top + element.clientTop);
  const right = Math.min(innerWidth, rect.left + element.clientLeft + element.clientWidth);
  const bottom = Math.min(innerHeight, rect.top + element.clientTop + element.clientHeight);
  if (right <= left || bottom <= top)
    throw new Error("Product scrollport has no visible wheel surface");
  const points =
    input.point == null
      ? [0.5, 0.1, 0.9].flatMap((fy) =>
          [0.5, 0.1, 0.9].map((fx) => ({
            x: left + (right - left) * fx,
            y: top + (bottom - top) * fy,
          })),
        )
      : [input.point];
  for (const point of points) {
    if (point.x < left || point.x >= right || point.y < top || point.y >= bottom) continue;
    const hit = document.elementFromPoint(point.x, point.y);
    if (hit == null || !element.contains(hit)) continue;
    let nested = false;
    for (
      let node: Element | null = hit;
      node != null && node !== element;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      const overflow = input.axis === "x" ? style.overflowX : style.overflowY;
      const extent =
        input.axis === "x"
          ? node.scrollWidth - node.clientWidth
          : node.scrollHeight - node.clientHeight;
      if (extent > 0.5 && ["auto", "scroll"].includes(overflow)) nested = true;
    }
    if (!nested) return point;
  }
  throw new Error(
    "No wheel point hits the original scrollport without a consuming inner scrollport",
  );
}

/** Observe actual scroll limits of one caller-selected product scrollport. */
export async function observeScrollBoundaryFocus(
  page: Page,
  testInfo: TestInfo,
  state: string,
  scrollport: Locator,
  options: {
    mode?: "keyboard-then-wheel";
    assertRetainedState?: () => Promise<void>;
  } = {},
) {
  await expect(scrollport).toHaveCount(1);
  const metrics = () =>
    scrollport.evaluate((element) => ({
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      overflowX: getComputedStyle(element).overflowX,
      overflowY: getComputedStyle(element).overflowY,
      direction: getComputedStyle(element).direction,
    }));
  const original = await metrics();
  const originalFocus = await page.evaluateHandle(() => document.activeElement);
  type WheelJourney = {
    mode: "keyboard-then-wheel";
    expectedPosition?: number;
    naturalKeyboardPosition?: Awaited<ReturnType<typeof metrics>>;
    finalPosition?: Awaited<ReturnType<typeof metrics>>;
    inputs: { x: number; y: number; deltaX: number; deltaY: number }[];
  };
  const boundaries: {
    axis: "x" | "y";
    endpoint: "start" | "end" | null;
    target: { tag: string; name: string } | null;
    status: "not-applicable" | "observed-awaiting-visual-review" | "blocked";
    reason?: string;
    dimensions: Awaited<ReturnType<typeof metrics>>;
    expectedPosition?: number;
    observations?: number;
    journey?: WheelJourney;
  }[] = [];
  try {
    for (const axis of ["x", "y"] as const) {
      const dimensions = await metrics();
      const extent =
        axis === "x"
          ? dimensions.scrollWidth - dimensions.clientWidth
          : dimensions.scrollHeight - dimensions.clientHeight;
      const overflow = axis === "x" ? dimensions.overflowX : dimensions.overflowY;
      if (extent <= 0.5 || !["auto", "scroll", "hidden"].includes(overflow)) {
        boundaries.push({
          axis,
          endpoint: null,
          target: null,
          status: "not-applicable",
          reason: extent <= 0.5 ? "No overflow on this axis" : "This axis is not a scrollport",
          dimensions,
        });
        continue;
      }
      for (const endpoint of ["start", "end"] as const) {
        const candidates = await scrollport
          .locator('button, a[href], input, select, textarea, [contenteditable="true"], [tabindex]')
          .elementHandles();
        const actionable = [];
        for (const candidate of candidates) {
          if (!(await candidate.evaluate(isProductElement))) continue;
          if (
            await candidate.evaluate((element) => {
              if (
                !(element instanceof HTMLElement) ||
                element.tabIndex < 0 ||
                element.matches(':disabled, [aria-disabled="true"]') ||
                element.closest('[inert], [hidden], [aria-hidden="true"]')
              )
                return false;
              if (
                !element.matches(
                  'button, a[href], input, select, textarea, [contenteditable="true"]',
                ) &&
                ![
                  "button",
                  "link",
                  "checkbox",
                  "radio",
                  "switch",
                  "combobox",
                  "textbox",
                  "spinbutton",
                  "slider",
                  "tab",
                  "menuitem",
                  "menuitemcheckbox",
                  "menuitemradio",
                  "treeitem",
                  "option",
                ].includes(element.getAttribute("role") ?? "")
              )
                return false;
              const style = getComputedStyle(element);
              if (style.visibility !== "visible" || element.getClientRects().length === 0)
                return false;
              return true;
            })
          )
            actionable.push(candidate);
        }
        const target = endpoint === "start" ? actionable[0] : actionable.at(-1);
        let targetInfo: { tag: string; name: string } | null = null;
        const journey: WheelJourney | undefined =
          options.mode === "keyboard-then-wheel"
            ? { mode: "keyboard-then-wheel", inputs: [] }
            : undefined;
        const owner = journey == null ? null : await scrollport.elementHandle();
        try {
          if (target == null)
            throw new Error("Overflowing product scrollport has no operable keyboard target");
          targetInfo = await target.evaluate((element) => {
            if (!(element instanceof HTMLElement))
              throw new Error("Focus target is not an HTML element");
            return {
              tag: element.tagName,
              name: element.getAttribute("aria-label") ?? element.textContent.slice(0, 200),
            };
          });
          const focusedMetrics = await metrics();
          const maximum =
            axis === "x"
              ? focusedMetrics.scrollWidth - focusedMetrics.clientWidth
              : focusedMetrics.scrollHeight - focusedMetrics.clientHeight;
          const expectedPosition =
            endpoint === "start"
              ? 0
              : axis === "x" && focusedMetrics.direction === "rtl"
                ? -maximum
                : maximum;
          if (journey != null) journey.expectedPosition = expectedPosition;
          if (journey == null)
            await scrollport.evaluate(
              (element, position) => {
                element.scrollTo({
                  left: position.axis === "x" ? position.value : element.scrollLeft,
                  top: position.axis === "y" ? position.value : element.scrollTop,
                  behavior: "instant",
                });
              },
              { axis, value: expectedPosition },
            );
          // The default path establishes the endpoint first. The opt-in path
          // records natural keyboard reveal, then uses real wheel input only.
          await target.evaluate((element) => {
            if (element instanceof HTMLElement) element.focus({ preventScroll: true });
          });
          // Move inward first so the document's final control does not hand focus
          // to browser chrome, where activeElement may retain its previous node.
          await page.keyboard.press(endpoint === "start" ? "Tab" : "Shift+Tab");
          const traversalLimit = await page.locator("*").count();
          for (let step = 0; step < traversalLimit; step += 1) {
            await page.keyboard.press(endpoint === "start" ? "Shift+Tab" : "Tab");
            if (
              await target.evaluate(
                (element) => document.hasFocus() && document.activeElement === element,
              )
            )
              break;
          }
          const assertWheelIdentity = async () => {
            if (owner == null) throw new Error("Missing retained product scrollport");
            await assertDocumentFocus(target);
            expect(
              await scrollport.evaluate((element, retained) => element === retained, owner),
              "Product scrollport identity changed",
            ).toBe(true);
            expect(
              await owner.evaluate(
                (element, focused) => element.isConnected && element.contains(focused),
                target,
              ),
              "Original scrollport must retain the original target",
            ).toBe(true);
            const current = await metrics();
            for (const dimension of [
              "scrollWidth",
              "scrollHeight",
              "clientWidth",
              "clientHeight",
              "overflowX",
              "overflowY",
              "direction",
            ] as const)
              expect(current[dimension], `Product scrollport ${dimension} changed`).toBe(
                focusedMetrics[dimension],
              );
            return current;
          };
          if (journey != null) {
            await options.assertRetainedState?.();
            await waitForStableFocusSnapshot(page);
            let position = await assertWheelIdentity();
            journey.naturalKeyboardPosition = position;
            journey.finalPosition = position;
            expect(["auto", "scroll"], "Product endpoint must accept wheel input").toContain(
              axis === "x" ? position.overflowX : position.overflowY,
            );
            const axisPosition = (value: typeof position) =>
              axis === "x" ? value.scrollLeft : value.scrollTop;
            while (Math.abs(axisPosition(position) - expectedPosition) > 0.5) {
              if (owner == null) throw new Error("Missing retained product scrollport");
              const point = await owner.evaluate(productWheelPoint, { axis });
              await page.mouse.move(point.x, point.y);
              // Hover may mount an overlay; revalidate the actual pointer after moving.
              await owner.evaluate(productWheelPoint, { axis, point });
              position = await assertWheelIdentity();
              const before = axisPosition(position);
              const delta = expectedPosition - before;
              const input = {
                ...point,
                deltaX: axis === "x" ? delta : 0,
                deltaY: axis === "y" ? delta : 0,
              };
              await options.assertRetainedState?.();
              journey.inputs.push(input);
              try {
                await page.mouse.wheel(input.deltaX, input.deltaY);
              } finally {
                await options.assertRetainedState?.();
              }
              await expect
                .poll(
                  async () => {
                    position = await assertWheelIdentity();
                    journey.finalPosition = position;
                    return (axisPosition(position) - before) * Math.sign(delta);
                  },
                  { message: "Real wheel must make progress toward the requested endpoint" },
                )
                .toBeGreaterThan(0.5);
              await waitForStableFocusSnapshot(page);
              position = await assertWheelIdentity();
              journey.finalPosition = position;
              expect(
                Math.abs(axisPosition(position) - expectedPosition),
                "Wheel must reduce remaining endpoint distance",
              ).toBeLessThan(Math.abs(before - expectedPosition));
              await options.assertRetainedState?.();
            }
          }
          const assertEndpoint = async () => {
            if (journey != null) journey.finalPosition = await assertWheelIdentity();
            await expect
              .poll(async () => {
                const current = await metrics();
                return Math.abs(
                  (axis === "x" ? current.scrollLeft : current.scrollTop) - expectedPosition,
                );
              })
              .toBeLessThanOrEqual(0.5);
            await expect
              .poll(() =>
                target.evaluate(
                  (element) => document.hasFocus() && document.activeElement === element,
                ),
              )
              .toBe(true);
          };
          await assertEndpoint();
          await options.assertRetainedState?.();
          let observations: Awaited<ReturnType<typeof observeCurrentFocus>>;
          try {
            observations = await observeCurrentFocus(
              page,
              testInfo,
              `${state}-${axis}-${endpoint}`,
            );
          } finally {
            await options.assertRetainedState?.();
          }
          await assertEndpoint();
          if (observations.length === 0)
            throw new Error("No product focus observation was captured at the scroll boundary");
          boundaries.push({
            axis,
            endpoint,
            target: targetInfo,
            status: "observed-awaiting-visual-review",
            dimensions: await metrics(),
            expectedPosition,
            observations: observations.length,
            journey,
          });
        } catch (error) {
          let failedPosition = journey?.finalPosition ?? dimensions;
          let reason = String(error);
          try {
            failedPosition = await metrics();
            if (journey != null) journey.finalPosition = failedPosition;
          } catch (measurementError) {
            reason += `; failure-position measurement also failed: ${String(measurementError)}`;
            if (journey != null) delete journey.finalPosition;
          }
          boundaries.push({
            axis,
            endpoint,
            target: targetInfo,
            status: "blocked",
            reason,
            dimensions: failedPosition,
            journey,
          });
        } finally {
          await Promise.all(candidates.map((candidate) => candidate.dispose()));
          await owner?.dispose();
        }
      }
    }
  } finally {
    try {
      await originalFocus.evaluate((element) => {
        if (element instanceof HTMLElement && element.isConnected)
          element.focus({ preventScroll: true });
      });
      await scrollport.evaluate((element, position) => {
        element.scrollTo({
          left: position.scrollLeft,
          top: position.scrollTop,
          behavior: "instant",
        });
      }, original);
    } finally {
      await originalFocus.dispose();
      const artifact = testInfo.outputPath(`${state}-scroll-boundaries.json`);
      await writeFile(artifact, JSON.stringify(boundaries, null, 2));
      await testInfo.attach(`${state}-scroll-boundaries`, {
        path: artifact,
        contentType: "application/json",
      });
    }
  }
  expect(
    boundaries.filter((boundary) => boundary.status === "blocked"),
    "Scroll boundary observation was blocked",
  ).toEqual([]);
  return boundaries;
}

async function observeDirection(
  page: Page,
  testInfo: TestInfo,
  state: string,
  key: "Tab" | "Shift+Tab" | null,
) {
  const replay = await beginFocusDirectionReplay(testInfo, state, key);
  const observations = [];
  const seen = new Set<number>();
  const createStore = () =>
    page.evaluateHandle(() => ({
      identities: new WeakMap<Element, number>(),
      baseline: new WeakMap<Element, { shadow: string; outline: string; outlineOffset: string }>(),
      nextId: 0,
    }));
  let store: Awaited<ReturnType<typeof createStore>> | undefined;
  let cycleCompleted = key == null;
  let traversalFailed = false;
  let cleanupFailures: PromiseRejectedResult[];
  try {
    store = await createStore();
    const limit = key == null ? 0 : await page.locator("*").count();
    for (let step = 0; step <= limit; step += 1) {
      await page.evaluate((state) => {
        const virtualId = document.activeElement?.getAttribute("aria-activedescendant");
        const virtualTarget = virtualId == null ? null : document.getElementById(virtualId);
        const virtualFocusChain = new Set<Element>();
        for (let owner = virtualTarget; owner != null; owner = owner.parentElement) {
          virtualFocusChain.add(owner);
        }
        for (const element of document.querySelectorAll("*")) {
          const style = getComputedStyle(element);
          // Virtual selection is focus evidence even though DOM focus stays on its editor.
          // Preserve a prior unselected baseline, but never invent one from selected style.
          if (!element.matches(":focus-within") && !virtualFocusChain.has(element))
            state.baseline.set(element, {
              shadow: style.boxShadow,
              outline: style.outline,
              outlineOffset: style.outlineOffset,
            });
        }
      }, store);
      if (key != null) await page.keyboard.press(key);
      const stableSnapshot = await waitForStableFocusSnapshot(page);
      const identity = await page.evaluate((state) => {
        const active = document.activeElement;
        if (!document.hasFocus() || !(active instanceof HTMLElement) || active === document.body)
          return null;
        const existing = state.identities.get(active);
        if (existing != null) return existing;
        const next = state.nextId++;
        state.identities.set(active, next);
        return next;
      }, store);
      replay?.stop(step, identity, identity != null && seen.has(identity), stableSnapshot.value);
      if (identity == null) continue;
      if (seen.has(identity)) {
        cycleCompleted = true;
        break;
      }
      seen.add(identity);
      const active = await page.evaluateHandle(() => document.activeElement);
      const product = await active.evaluate(isProductElement);
      const virtualTarget = await active.evaluateHandle((element) => {
        const id = element?.getAttribute("aria-activedescendant");
        return id == null ? null : document.getElementById(id);
      });
      const virtualProduct = await virtualTarget.evaluate(isProductElement);
      await active.dispose();
      if (!product) {
        await virtualTarget.dispose();
        continue;
      }
      const observation = await page.evaluate(
        ({ state, activeDescendant }) => {
          const element = document.activeElement;
          if (
            !document.hasFocus() ||
            !(element instanceof HTMLElement) ||
            element === document.body
          )
            return null;
          // Only the actual, scope-checked virtual focus target gets independent geometry.
          const virtualOwner =
            activeDescendant instanceof HTMLElement &&
            activeDescendant !== document.body &&
            element.getAttribute("aria-activedescendant") === activeDescendant.id &&
            document.getElementById(activeDescendant.id) === activeDescendant
              ? activeDescendant
              : null;
          const rectData = (rect: DOMRect) => ({
            x: rect.x,
            y: rect.y,
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          const visible = (color: string) => {
            if (context == null) return false;
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return (context.getImageData(0, 0, 1, 1).data[3] ?? 0) > 0;
          };
          // The focused node need not paint its own ring (for example, Composer's field).
          // Keep one parser and geometry calculation for every possible painting node.
          const measure = (owner: Element) => {
            const style = getComputedStyle(owner);
            const bounds = owner.getBoundingClientRect();
            const prior = state.baseline.get(owner);
            const shadows = style.boxShadow
              .split(/,(?![^()]*\))/)
              .filter(
                (shadow) =>
                  !prior?.shadow
                    .split(/,(?![^()]*\))/)
                    .some((before) => before.trim() === shadow.trim()),
              );
            const outsets = shadows.flatMap((shadow) => {
              const color = /(?:rgba?|[a-z]+)\([^)]*\)/.exec(shadow)?.[0];
              const lengths = shadow
                .replace(/(?:rgba?|[a-z]+)\([^)]*\)/g, "")
                .match(/-?[\d.]+px/g)
                ?.map(Number.parseFloat);
              if (
                shadow.includes("inset") ||
                color == null ||
                !visible(color) ||
                lengths == null ||
                lengths.length < 4
              )
                return [];
              const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
              return [
                {
                  left: spread + blur - x,
                  right: spread + blur + x,
                  top: spread + blur - y,
                  bottom: spread + blur + y,
                  blur,
                },
              ];
            });
            const outline =
              (style.outline !== prior?.outline || style.outlineOffset !== prior.outlineOffset) &&
              style.outlineStyle !== "none" &&
              visible(style.outlineColor)
                ? Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
                : 0;
            const edges = {
              left: Math.max(0, outline, ...outsets.map((shadow) => shadow.left)),
              right: Math.max(0, outline, ...outsets.map((shadow) => shadow.right)),
              top: Math.max(0, outline, ...outsets.map((shadow) => shadow.top)),
              bottom: Math.max(0, outline, ...outsets.map((shadow) => shadow.bottom)),
            };
            const outset = Math.max(...Object.values(edges));
            const estimatedBlur = outsets.some((shadow) => shadow.blur > 0);
            const ancestors = [];
            for (let parent = owner.parentElement; parent != null; parent = parent.parentElement) {
              const parentStyle = getComputedStyle(parent);
              const rect = parent.getBoundingClientRect();
              // Root overflow clips at the viewport, not at the scrolled document's box.
              const rootClip = parent === document.documentElement;
              const clipLeft = rootClip ? 0 : rect.left + parent.clientLeft;
              const clipTop = rootClip ? 0 : rect.top + parent.clientTop;
              const clipRight = rootClip ? innerWidth : clipLeft + parent.clientWidth;
              const clipBottom = rootClip ? innerHeight : clipTop + parent.clientHeight;
              ancestors.push({
                tag: parent.tagName,
                classes: parent.className,
                bounds: rectData(rect),
                clippingBounds: {
                  left: clipLeft,
                  top: clipTop,
                  right: clipRight,
                  bottom: clipBottom,
                },
                clientWidth: parent.clientWidth,
                clientHeight: parent.clientHeight,
                scrollLeft: parent.scrollLeft,
                scrollTop: parent.scrollTop,
                scrollWidth: parent.scrollWidth,
                scrollHeight: parent.scrollHeight,
                overflowX: parentStyle.overflowX,
                overflowY: parentStyle.overflowY,
                radius: parentStyle.borderRadius,
                clearanceX:
                  parentStyle.overflowX === "visible"
                    ? null
                    : [bounds.left - edges.left - clipLeft, clipRight - bounds.right - edges.right],
                clearanceY:
                  parentStyle.overflowY === "visible"
                    ? null
                    : [bounds.top - edges.top - clipTop, clipBottom - bounds.bottom - edges.bottom],
              });
            }
            const viewportClearance = [
              bounds.left - edges.left,
              bounds.top - edges.top,
              innerWidth - bounds.right - edges.right,
              innerHeight - bounds.bottom - edges.bottom,
            ];
            const clippingCandidate = [
              ...viewportClearance,
              ...ancestors.flatMap((parent) => [
                ...(parent.clearanceX ?? []),
                ...(parent.clearanceY ?? []),
              ]),
            ].some((value) => value < -0.5);
            return {
              tag: element.tagName,
              name: element.getAttribute("aria-label") ?? element.textContent.slice(0, 200),
              role: element.getAttribute("role"),
              activeBounds: rectData(element.getBoundingClientRect()),
              ringOwner: {
                tag: owner.tagName,
                id: owner.id,
                classes: owner.getAttribute("class"),
                isActiveElement: owner === element,
                isActiveDescendant: owner === virtualOwner,
                focusWithin: owner.matches(":focus-within"),
                bounds: rectData(bounds),
              },
              bounds: rectData(bounds),
              focusVisible: element.matches(":focus-visible"),
              ariaSelected: owner.getAttribute("aria-selected"),
              backgroundColor: style.backgroundColor,
              documentFocused: document.hasFocus(),
              shadow: style.boxShadow,
              outline: style.outline,
              outlineOffset: style.outlineOffset,
              radius: style.borderRadius,
              outset,
              edges,
              estimatedBlur,
              baselineAvailable: prior != null,
              viewport: { width: innerWidth, height: innerHeight },
              viewportClearance,
              ancestors,
              result:
                outset === 0 || prior == null || estimatedBlur
                  ? "needs-visual-review"
                  : clippingCandidate
                    ? "clipping-candidate"
                    : "geometry-clear-needs-visual-review",
            };
          };
          const measurements = [measure(element)];
          for (let owner = element.parentElement; owner != null; owner = owner.parentElement) {
            if (!owner.matches(":focus-within")) continue;
            const measurement = measure(owner);
            if (measurement.outset > 0) measurements.push(measurement);
          }
          if (virtualOwner != null && virtualOwner !== element) {
            measurements.push(measure(virtualOwner));
          }
          return measurements;
        },
        { state: store, activeDescendant: virtualProduct ? virtualTarget : null },
      );
      await virtualTarget.dispose();
      if (observation == null) continue;
      const screenshot = replay?.inherited
        ? replay.image(step, observation)
        : testInfo.outputPath(`${state}-${String(step)}.png`);
      if (!replay?.inherited) await page.screenshot({ path: screenshot });
      expect(
        await page.evaluate(focusSnapshot),
        replay?.inherited
          ? "Focus geometry changed during evidence replay"
          : "Focus geometry changed during screenshot capture",
      ).toEqual(stableSnapshot);
      observations.push(
        ...observation.map((measurement) => ({
          ...measurement,
          step,
          screenshot,
          traversalCompleted: false,
          evidenceOrigin: replay?.inherited ? "inherited-image-live-replay" : "new-capture",
        })),
      );
    }
    expect(cycleCompleted, "Tab traversal did not complete a cycle").toBe(true);
    replay?.assertComplete();
    for (const observation of observations) observation.traversalCompleted = true;
  } catch (error) {
    traversalFailed = true;
    await replay?.fail(error, "observe-direction");
    throw error;
  } finally {
    // Only captures or inherited images that passed the stability check enter this prefix.
    // Persist it even when a later step fails, without replacing that original error.
    const cleanupResults = await Promise.allSettled([
      (async () => {
        const artifact = testInfo.outputPath(`${state}-focus.json`);
        await writeFile(artifact, JSON.stringify(observations, null, 2));
        await testInfo.attach(`${state}-focus-observations`, {
          path: artifact,
          contentType: "application/json",
        });
      })(),
      store?.dispose(),
      replay?.finish(!traversalFailed && cycleCompleted),
    ]);
    cleanupFailures = cleanupResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (traversalFailed) {
      for (const result of cleanupFailures) {
        testInfo.annotations.push({
          type: "focus-evidence-cleanup-error",
          description: String(result.reason),
        });
      }
    }
  }
  const firstCleanupFailure = cleanupFailures[0];
  if (firstCleanupFailure != null) throw firstCleanupFailure.reason;
  return observations;
}
