/// <reference lib="dom" />
import { installBrowserScrollRecorder, type ScrollProbeWindow } from "../e2e/issue97ScrollRecorder";
import { runIssue97Transition } from "./issue97Transition";

export type Issue97CaptureOptions = {
  label: string;
  transitionDelayMs?: number;
  instrumentCalls?: boolean;
};

export function startIssue97Capture({
  label,
  transitionDelayMs,
  instrumentCalls = false,
}: Issue97CaptureOptions): void {
  // Playwright's init script owns its recorder and must retain its event buffer.
  if ("issue97Probe" in window) {
    console.info("[issue97] Native capture not started: a recorder is already installed");
    return;
  }
  const documentId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("");
  installBrowserScrollRecorder({
    instrument: instrumentCalls,
    captureCallDetails: false,
    sampleGeometry: false,
    sampleFrames: false,
  });
  const probe = (window as ScrollProbeWindow).issue97Probe;
  const describeTranscript = () => {
    const surface = document.querySelector(".committed-transcript-surface");
    return {
      transcriptPresent: surface != null,
      renderedFragmentCount:
        surface?.querySelectorAll("article.committed-transcript-turn").length ?? 0,
      renderedMessageCardCount:
        surface?.querySelectorAll(".committed-transcript-entry-message").length ?? 0,
      renderedImageCount: surface?.querySelectorAll("img").length ?? 0,
      paginationPresent: surface?.querySelector("nav") != null,
    };
  };
  let sequence = 0;
  let inFlight: Promise<void> | null = null;
  let stopped = false;
  let deliveryFailed = false;
  const scenarioController = new AbortController();
  let scenarioPending = transitionDelayMs != null;
  const eventsAllowed = new Set([
    "probe-start",
    "loaded",
    "scroll",
    "wheel",
    "wheel-after-dispatch",
    "root-style",
    "window.scrollTo",
    "window.scrollBy",
    "document.scrollTo",
    "document.scrollBy",
    "page-show",
    "page-hide",
    "capture-end",
    "scenario-short-ready",
    "scenario-armed",
    "scenario-current-click",
    "scenario-complete",
    "scenario-failed",
  ]);
  const onPageShow = (event: PageTransitionEvent) => {
    probe.mark("page-show", {
      persisted: event.persisted,
      visible: document.visibilityState === "visible",
    });
  };
  const onPageHide = (event: PageTransitionEvent) => {
    probe.mark("page-hide", { persisted: event.persisted });
    void flush().catch(() => undefined);
  };
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("pagehide", onPageHide);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (scenarioPending) {
      probe.mark("scenario-failed", { category: "aborted" });
      scenarioPending = false;
    }
    scenarioController.abort();
    probe.mark("capture-end", describeTranscript());
    probe.stop();
    clearInterval(interval);
    clearTimeout(deadline);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("pagehide", onPageHide);
  };
  const send = async () => {
    try {
      while (probe.events.length > 0) {
        // The recorder can contain stacks and raw styles. Export only this whitelist.
        const events = probe.events.splice(0, 12).map((sample) => {
          const details = sample.details;
          const scalar: Record<string, number | boolean | string> = {};
          if (sample.event === "root-style" && Array.isArray(details)) {
            for (const entry of details) {
              if (entry == null || typeof entry !== "object") continue;
              const element: unknown = Reflect.get(entry, "element");
              const hidden: unknown = Reflect.get(entry, "inlineOverflowHidden");
              if ((element === "html" || element === "body") && typeof hidden === "boolean") {
                scalar[`${element}InlineOverflowHidden`] = hidden;
              }
            }
          }
          if (details != null && typeof details === "object" && !Array.isArray(details)) {
            for (const key of [
              "deltaY",
              "trusted",
              "cancelable",
              "defaultPrevented",
              "drawerPresent",
              "persisted",
              "visible",
              "delayMs",
              "clickAt",
              "transcriptPresent",
              "renderedFragmentCount",
              "renderedMessageCardCount",
              "renderedImageCount",
              "paginationPresent",
            ]) {
              const value: unknown = Reflect.get(details, key);
              if (
                typeof value === "boolean" ||
                (typeof value === "number" && Number.isFinite(value))
              ) {
                scalar[key] = value;
              }
            }
            if (sample.event === "wheel" || sample.event === "wheel-after-dispatch") {
              const path: unknown = Reflect.get(details, "path");
              if (Array.isArray(path)) {
                scalar.tableInPath = path.some(
                  (entry: unknown) =>
                    entry != null &&
                    typeof entry === "object" &&
                    Reflect.get(entry, "tag") === "TABLE",
                );
              }
            }
            const category: unknown = Reflect.get(details, "category");
            if (
              sample.event === "scenario-failed" &&
              typeof category === "string" &&
              [
                "aborted",
                "deadline",
                "invalid-delay",
                "button-unavailable",
                "publish-failed",
                "unexpected",
              ].includes(category)
            ) {
              scalar.category = category;
            }
          }
          return {
            time: sample.time,
            event: eventsAllowed.has(sample.event) ? sample.event : "other",
            ...scalar,
          };
        });
        const navigation = performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined;
        const response = await fetch("/__issue97_capture", {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
          headers: {
            "x-issue97-data": JSON.stringify({
              label,
              documentId,
              sequence: sequence++,
              droppedEvents: probe.droppedEvents,
              navigationType: navigation?.type ?? "unknown",
              instrumentCalls,
              events,
            }),
          },
        });
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      }
    } catch (error) {
      deliveryFailed = true;
      stop();
      console.error("[issue97] Capture delivery failed; sample is incomplete", error);
      throw error;
    }
  };
  const flush = (): Promise<void> => {
    if (deliveryFailed) return Promise.reject(new Error("Capture delivery failed"));
    if (inFlight != null) return inFlight;
    inFlight = send().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
  const interval = window.setInterval(() => {
    void flush().catch(() => undefined);
  }, 250);
  const deadline = window.setTimeout(() => {
    stop();
    void flush().catch(() => undefined);
  }, 90_000);
  void flush().catch(() => undefined);
  if (transitionDelayMs != null) {
    void runIssue97Transition({
      mark: (event, details) => {
        if (event === "scenario-complete" || event === "scenario-failed") scenarioPending = false;
        probe.mark(event, event === "scenario-complete" ? describeTranscript() : details);
      },
      publish: flush,
      signal: scenarioController.signal,
      delayMs: transitionDelayMs,
    });
  }
}
