import type { Page } from "@playwright/test";

type ScrollSample = {
  time: number;
  event: string;
  top: number | null;
  maximum: number | null;
  overflow: string | null;
  details?: unknown;
};

export type ScrollProbeWindow = typeof window & {
  issue97Probe: {
    events: ScrollSample[];
    droppedEvents: number;
    frameCount: number;
    longFrames: number[];
    suppressDocumentScrollTo: boolean;
    mark: (event: string, details?: unknown) => void;
    stop: () => void;
  };
};

export type ScrollRecorderOptions = {
  instrument: boolean;
  captureCallDetails?: boolean;
  sampleGeometry?: boolean;
  sampleFrames?: boolean;
};

export async function installScrollRecorder(
  page: Page,
  instrumentCalls: boolean,
  sampleGeometry = instrumentCalls,
) {
  await page.addInitScript(installBrowserScrollRecorder, {
    instrument: instrumentCalls,
    sampleGeometry,
  });
}

// Keep runtime dependencies inside this function so it can run as a serialized init script.
export function installBrowserScrollRecorder({
  instrument,
  captureCallDetails = true,
  sampleGeometry = instrument,
  sampleFrames = true,
}: ScrollRecorderOptions): void {
  const probeWindow = window as ScrollProbeWindow;
  const events: ScrollSample[] = [];
  const longFrames: number[] = [];
  const restoreMethods: (() => void)[] = [];
  let stopped = false;
  let observer: MutationObserver | null = null;
  let animationFrameId: number | null = null;
  const mark = (event: string, details?: unknown) => {
    if (stopped) return;
    const root = document.documentElement;
    const scroller = document.scrollingElement;
    const canSample = sampleGeometry && scroller != null;
    events.push({
      time: performance.now(),
      event,
      top: canSample ? scroller.scrollTop : null,
      maximum: canSample ? scroller.scrollHeight - scroller.clientHeight : null,
      overflow: canSample ? getComputedStyle(root).overflowY : null,
      details,
    });
    if (events.length > 2000) {
      probeWindow.issue97Probe.droppedEvents += events.splice(0, 1000).length;
    }
  };
  const onScroll = () => {
    mark("scroll");
  };
  const onWheel = (event: WheelEvent) => {
    const describe = (target: EventTarget) => {
      if (!(target instanceof Element)) return target.constructor.name;
      return {
        tag: target.tagName,
        slot: target.getAttribute("data-slot"),
        role: target.getAttribute("role"),
        exiting: target.hasAttribute("data-exiting"),
      };
    };
    const details = {
      deltaY: event.deltaY,
      trusted: event.isTrusted,
      cancelable: event.cancelable,
      path: event.composedPath().map(describe),
      drawerPresent: document.querySelector('[data-slot="drawer-backdrop"]') != null,
    };
    mark("wheel", { ...details, defaultPrevented: event.defaultPrevented });
    queueMicrotask(() => {
      mark("wheel-after-dispatch", { ...details, defaultPrevented: event.defaultPrevented });
    });
  };
  const onLoaded = () => {
    observer = new MutationObserver((records) => {
      mark(
        "root-style",
        records.map((record) => ({
          element: record.target === document.documentElement ? "html" : "body",
          attribute: record.attributeName,
          old: record.oldValue,
          current: (record.target as HTMLElement).getAttribute("style"),
          inlineOverflowHidden: [
            (record.target as HTMLElement).style.overflowY,
            (record.target as HTMLElement).style.overflow,
          ].includes("hidden"),
        })),
      );
    });
    for (const element of [document.documentElement, document.body]) {
      observer.observe(element, {
        attributes: true,
        attributeFilter: ["style", "class"],
        attributeOldValue: true,
      });
    }
    mark("loaded");
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    document.removeEventListener("scroll", onScroll);
    window.removeEventListener("wheel", onWheel, true);
    document.removeEventListener("DOMContentLoaded", onLoaded);
    observer?.disconnect();
    if (animationFrameId != null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    for (const restore of restoreMethods) restore();
  };
  probeWindow.issue97Probe = {
    events,
    droppedEvents: 0,
    frameCount: 0,
    longFrames,
    suppressDocumentScrollTo: false,
    mark,
    stop,
  };
  mark("probe-start");
  document.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: true, capture: true });
  document.addEventListener("DOMContentLoaded", onLoaded);
  if (instrument) {
    for (const name of ["scrollTo", "scrollBy"] as const) {
      const windowMethod = Reflect.get(window, name);
      const wrappedWindowMethod = new Proxy(windowMethod.bind(window), {
        apply(target, receiver, args) {
          mark(
            `window.${name}`,
            captureCallDetails ? { args, stack: new Error().stack } : undefined,
          );
          Reflect.apply(target, receiver, args);
        },
      });
      window[name] = wrappedWindowMethod;
      restoreMethods.push(() => {
        if (window[name] === wrappedWindowMethod) window[name] = windowMethod;
      });
      const elementMethod = Object.getOwnPropertyDescriptor(Element.prototype, name)?.value as
        | Element[typeof name]
        | undefined;
      if (elementMethod == null) {
        stop();
        throw new Error(`Missing Element.${name}`);
      }
      const wrappedElementMethod = new Proxy(elementMethod, {
        apply(target, receiver: Element, args) {
          if (receiver === document.scrollingElement) {
            const suppressed =
              !stopped && name === "scrollTo" && probeWindow.issue97Probe.suppressDocumentScrollTo;
            mark(
              `document.${name}`,
              captureCallDetails ? { args, stack: new Error().stack, suppressed } : { suppressed },
            );
            if (suppressed) return;
          }
          Reflect.apply(target, receiver, args);
        },
      });
      Element.prototype[name] = wrappedElementMethod;
      restoreMethods.push(() => {
        if (Element.prototype[name] === wrappedElementMethod)
          Element.prototype[name] = elementMethod;
      });
    }
  }
  let previous = performance.now();
  const frame = (time: number) => {
    const gap = time - previous;
    previous = time;
    probeWindow.issue97Probe.frameCount++;
    // A diagnostic distribution, not a pass/fail definition of jank.
    if (gap > 50) {
      longFrames.push(gap);
      if (longFrames.length > 500) longFrames.shift();
    }
    animationFrameId = requestAnimationFrame(frame);
  };
  if (sampleFrames) animationFrameId = requestAnimationFrame(frame);
}

export async function scrollState(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const scroller = document.scrollingElement;
    if (scroller == null) throw new Error("Document scroller is unavailable");
    return {
      top: scroller.scrollTop,
      maximum: scroller.scrollHeight - scroller.clientHeight,
      height: scroller.scrollHeight,
      viewport: scroller.clientHeight,
      overflow: getComputedStyle(root).overflowY,
      scrollbarWidth: getComputedStyle(root).scrollbarWidth,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      rootStyle: root.getAttribute("style"),
      gutter: innerWidth - root.clientWidth,
      modalCount: document.querySelectorAll('[role="dialog"]').length,
    };
  });
}

export async function markScrollProbe(page: Page, event: string, details?: unknown) {
  await page.evaluate(
    ({ event, details }) => {
      (window as ScrollProbeWindow).issue97Probe.mark(event, details);
    },
    {
      event,
      details,
    },
  );
}

export async function frameDelay(page: Page, frames: number) {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          resolve();
        }),
      );
    }
  }, frames);
}
