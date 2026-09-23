import { expect, test, type Page } from "@playwright/test";
import { firstThreadId, openMenu } from "./multiSessionHarness";
import { createNewSessionHarness, openNewSession } from "./newSessionHarness";
import { composer, ready } from "./persistenceHarness";
import {
  frameDelay,
  installScrollRecorder,
  markScrollProbe,
  type ScrollProbeWindow,
} from "./issue97ScrollRecorder";

test("issue 97: native scrollbar screenshot observability", async ({ page }, info) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.setContent(
    "<!doctype html><style>html,body { margin: 0; background: white; } main { height: 2600px; }</style><main></main>",
  );
  await page.mouse.move(450, 325);
  await page.mouse.wheel(0, 300);
  const natural = await page.screenshot({ path: info.outputPath("natural.png") });
  const naturalNative = info.project.name === "webkit" ? await captureWebKitNative(page) : null;
  const naturalGeometry = await geometry(page);
  await page.addStyleTag({
    content: "html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; }",
  });
  await page.mouse.wheel(0, 300);
  const hidden = await page.screenshot({ path: info.outputPath("hidden.png") });
  const hiddenNative = info.project.name === "webkit" ? await captureWebKitNative(page) : null;
  const hiddenGeometry = await geometry(page);
  await info.attach("natural-scrollbar", { body: natural, contentType: "image/png" });
  await info.attach("intentionally-hidden-scrollbar", {
    body: hidden,
    contentType: "image/png",
  });
  if (naturalNative != null && hiddenNative != null) {
    await info.attach("native-natural-scrollbar", {
      body: naturalNative,
      contentType: "image/png",
    });
    await info.attach("native-intentionally-hidden-scrollbar", {
      body: hiddenNative,
      contentType: "image/png",
    });
  }
  const result = {
    browser: info.project.name,
    screenshotsIdentical: natural.equals(hidden),
    nativeScreenshotsIdentical:
      naturalNative != null && hiddenNative != null ? naturalNative.equals(hiddenNative) : null,
    naturalGeometry,
    hiddenGeometry,
  };
  await info.attach("scrollbar-observability", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify(result));
  expect(naturalGeometry.rootScrollbarWidth).toBe("auto");
  expect(hiddenGeometry.rootScrollbarWidth).toBe("none");
  expect(naturalGeometry.top).toBeGreaterThan(0);
  expect(hiddenGeometry.top).toBeGreaterThan(naturalGeometry.top);
});

async function captureWebKitNative(page: Page): Promise<Buffer> {
  // Investigation only: compare WebKit's UI-process snapshot with Page.snapshotRect.
  // The installed Playwright 1.63.0 in-process connection exposes this mapping.
  const delegate = webKitDelegate(page);
  const browser = member(member(delegate, "_browserContext"), "_browser");
  const result = await invoke(
    member(browser, "_browserSession"),
    "send",
    "Playwright.takePageScreenshot",
    {
      pageProxyId: member(member(delegate, "_pageProxySession"), "sessionId"),
      x: 0,
      y: 0,
      width: 900,
      height: 650,
      omitDeviceScaleFactor: true,
    },
  );
  const dataURL = member(result, "dataURL");
  if (typeof dataURL !== "string") throw new Error("WebKit did not return a screenshot data URL");
  expect(dataURL).toMatch(/^data:image\/png;base64,/);
  return Buffer.from(dataURL.slice(dataURL.indexOf(",") + 1), "base64");
}

function webKitDelegate(page: Page): unknown {
  return member(invoke(member(page, "_connection"), "toImpl", page), "delegate");
}

// These investigation-only internals have no exported TypeScript contract.
// Inspect their actual members, failing explicitly if the installed API changes.
function member(target: unknown, key: string): unknown {
  if ((typeof target !== "object" || target == null) && typeof target !== "function") {
    throw new Error(`Cannot inspect Playwright member ${key}`);
  }
  return Reflect.get(target, key);
}

function invoke(target: unknown, key: string, ...args: unknown[]): unknown {
  const method = member(target, key);
  if (typeof method !== "function") throw new Error(`Missing Playwright method ${key}`);
  return Reflect.apply(method, target, args);
}

test("issue 97: transition wheel with and without scrolling-state preparation", async ({
  page,
  browserName,
}, info) => {
  await installScrollRecorder(page, true, false);
  const host = await createNewSessionHarness(page, true);
  await host.open();
  host.finish(
    firstThreadId,
    Array.from({ length: 120 }, (_, index) => `Transition paragraph ${String(index + 1)}.`).join(
      "\n\n",
    ),
  );
  await expect(page.getByText("Transition paragraph 120.", { exact: true })).toBeAttached();
  const inputPaths = browserName === "webkit" ? ["direct", "prepared"] : ["prepared"];
  const scenarios = inputPaths.flatMap((inputPath) => [
    { inputPath, suppressBottom: false, passThroughBackdrop: false },
    { inputPath, suppressBottom: true, passThroughBackdrop: false },
  ]);
  if (browserName === "webkit") {
    scenarios.push({ inputPath: "direct", suppressBottom: false, passThroughBackdrop: true });
    scenarios.push({ inputPath: "sync-only", suppressBottom: false, passThroughBackdrop: false });
    scenarios.push({ inputPath: "frame-only", suppressBottom: false, passThroughBackdrop: false });
  }
  const results: unknown[] = [];
  for (const { inputPath, suppressBottom, passThroughBackdrop } of scenarios) {
    // Diagnostic intervention only: preserve exit animation but change hit testing.
    const intervention = await page.addStyleTag({
      content: passThroughBackdrop
        ? '[data-slot="drawer-backdrop"][data-exiting] { pointer-events: none !important; }'
        : "/* Baseline: no hit-testing override. */",
    });
    await page.evaluate(() => {
      (window as ScrollProbeWindow).issue97Probe.suppressDocumentScrollTo = false;
    });
    await openNewSession(page);
    await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeHidden();
    const short = await geometry(page);
    expect(short.height - short.viewport).toBeLessThanOrEqual(1);
    await page.evaluate((suppress) => {
      (window as ScrollProbeWindow).issue97Probe.suppressDocumentScrollTo = suppress;
    }, suppressBottom);
    await openMenu(page);
    await page.getByRole("button", { name: "Current task", exact: true }).focus();
    await page.mouse.move(800, 360);
    await markScrollProbe(page, "before-transition", {
      inputPath,
      suppressBottom,
      passThroughBackdrop,
    });
    await page.keyboard.press("Enter");
    const wheel = async (deltaY: number) => {
      if (inputPath === "prepared") {
        await page.mouse.wheel(0, deltaY);
      } else {
        if (inputPath === "sync-only") {
          await invoke(
            member(webKitDelegate(page), "_session"),
            "send",
            "Page.updateScrollingState",
          );
        }
        if (inputPath === "frame-only") {
          await frameDelay(page, 1);
        }
        await invoke(
          member(webKitDelegate(page), "_pageProxySession"),
          "send",
          "Input.dispatchWheelEvent",
          { x: 800, y: 360, deltaX: 0, deltaY, modifiers: 0 },
        );
      }
    };
    await wheel(120);
    // Observe DOM removal only: geometry reads can update the state being investigated.
    await page.waitForFunction(() => !document.querySelector('[data-slot="drawer-backdrop"]'));
    await markScrollProbe(page, "after-drawer-removal", { inputPath });
    await wheel(300);
    await page.waitForFunction(() => {
      const events = (window as ScrollProbeWindow).issue97Probe.events;
      const marker = events.findLastIndex((event) => event.event === "after-drawer-removal");
      return events.slice(marker + 1).some((event) => event.event === "scroll");
    });
    await frameDelay(page, 2);
    const after = await geometry(page);
    const probe = await page.evaluate(() => (window as ScrollProbeWindow).issue97Probe.events);
    results.push({ inputPath, suppressBottom, passThroughBackdrop, short, after, probe });
    await info.attach(`transition-${String(results.length)}-${inputPath}`, {
      body: JSON.stringify(results.at(-1), null, 2),
      contentType: "application/json",
    });
    console.log(
      JSON.stringify({
        browser: browserName,
        inputPath,
        suppressBottom,
        passThroughBackdrop,
        short,
        after,
      }),
    );
    expect(after.top).toBeGreaterThan(50);
    expect(after.height - after.viewport - after.top).toBeGreaterThan(50);
    expect(after.rootOverflow).not.toBe("hidden");
    await intervention.evaluate((element) => {
      document.head.removeChild(element);
    });
  }
});

async function geometry(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const scroller = document.scrollingElement;
    if (scroller == null) throw new Error("Document scrolling element is unavailable");
    return {
      top: scroller.scrollTop,
      height: scroller.scrollHeight,
      viewport: scroller.clientHeight,
      gutter: innerWidth - root.clientWidth,
      rootOverflow: getComputedStyle(root).overflowY,
      rootScrollbarWidth: getComputedStyle(root).scrollbarWidth,
      bodyOverflow: getComputedStyle(body).overflowY,
      rootStyle: root.getAttribute("style"),
      bodyStyle: body.getAttribute("style"),
    };
  });
}

async function probeWheel(page: Page) {
  await page.mouse.move(600, 350);
  const before = await geometry(page);
  const delta = before.top > 400 ? -400 : 400;
  await page.mouse.wheel(0, delta);
  await expect
    .poll(async () => Math.abs((await geometry(page)).top - before.top))
    .toBeGreaterThan(100);
  return { before, after: await geometry(page) };
}

test("issue 97: freshly loaded new-session navigation versus task reload scroll diagnostics", async ({
  page,
}, info) => {
  const host = await createNewSessionHarness(page, true);
  await host.open();
  host.finish(
    firstThreadId,
    Array.from(
      { length: 120 },
      (_, index) => `Scroll diagnostic paragraph ${String(index + 1)}.`,
    ).join("\n\n"),
  );
  await expect(page.getByText("Scroll diagnostic paragraph 120.", { exact: true })).toBeAttached();
  const results: unknown[] = [];
  for (let round = 0; round < 3; round++) {
    await openNewSession(page);
    await page.reload();
    await expect(page).toHaveURL(/\/new$/);
    await expect(composer(page)).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeHidden();
    await expect
      .poll(async () => {
        const value = await geometry(page);
        return value.height - value.viewport;
      })
      .toBeLessThanOrEqual(1);
    const short = await geometry(page);
    await openMenu(page);
    await page.getByRole("button", { name: "Current task", exact: true }).click();
    const atNavigation = await geometry(page);
    await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
    await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeHidden();
    await expect
      .poll(async () => {
        const value = await geometry(page);
        return value.height - value.viewport;
      })
      .toBeGreaterThan(1000);
    const switched = await probeWheel(page);
    await page.reload();
    await ready(page);
    await expect(
      page.getByText("Scroll diagnostic paragraph 120.", { exact: true }),
    ).toBeAttached();
    const reloaded = await probeWheel(page);
    results.push({ round, short, atNavigation, switched, reloaded });
  }
  await info.attach("scroll-geometry", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify({ browser: info.project.name, results }));
});
