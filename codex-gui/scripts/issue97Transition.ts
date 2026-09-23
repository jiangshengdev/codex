import {
  CURRENT_TASK_PATH_SEGMENT,
  NEW_TASK_PATH_SEGMENT,
} from "../../codex-rs/gui-host/schema/typescript/browserContract";

const newTaskPath = `/${NEW_TASK_PATH_SEGMENT}`;

type TransitionFailureCategory =
  | "aborted"
  | "deadline"
  | "invalid-delay"
  | "button-unavailable"
  | "publish-failed"
  | "unexpected";

class TransitionFailure extends Error {
  readonly category: TransitionFailureCategory;

  constructor(category: TransitionFailureCategory) {
    super(category);
    this.category = category;
  }
}

export type Issue97TransitionOptions = {
  mark: (event: string, details?: unknown) => void;
  publish: () => Promise<unknown>;
  signal: AbortSignal;
  delayMs: number;
};

export async function runIssue97Transition({
  mark,
  publish,
  signal,
  delayMs,
}: Issue97TransitionOptions): Promise<void> {
  const controller = new AbortController();
  let abortCategory: "aborted" | "deadline" = "aborted";
  const onExternalAbort = () => {
    controller.abort();
  };
  signal.addEventListener("abort", onExternalAbort, { once: true });
  if (signal.aborted) controller.abort();
  const deadlineTimer = window.setTimeout(() => {
    abortCategory = "deadline";
    controller.abort();
  }, 90_000);

  const checkAbort = () => {
    if (controller.signal.aborted) throw new TransitionFailure(abortCategory);
  };
  const availableButton = (selector: string): HTMLButtonElement | null => {
    const matches = document.querySelectorAll(selector);
    const button = matches.length === 1 ? matches[0] : null;
    return button instanceof HTMLButtonElement &&
      button.isConnected &&
      !button.disabled &&
      button.getAttribute("aria-disabled") !== "true" &&
      button.closest('[inert], [aria-hidden="true"]') == null
      ? button
      : null;
  };
  const menuSelector = "header > .app-shell-content-boundary button";
  const newSessionSelector = 'button[aria-labelledby="new-session-navigation-label"]';
  const currentTaskSelector = 'button[aria-labelledby="current-task-navigation-label"]';
  const drawerSelector = '[data-slot="drawer-backdrop"]';
  const editorSelector = 'main [contenteditable="true"]';

  // Observe DOM facts only. Geometry reads could prepare the scrolling state under investigation.
  const waitFor = <T>(read: () => T | null): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let settled = false;
      const observer = new MutationObserver(check);
      const clean = () => {
        observer.disconnect();
        document.removeEventListener("visibilitychange", check);
        controller.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        clean();
        reject(new TransitionFailure(abortCategory));
      };
      function check() {
        if (settled) return;
        try {
          checkAbort();
          const value = read();
          if (value == null) return;
          settled = true;
          clean();
          resolve(value);
        } catch (error: unknown) {
          settled = true;
          clean();
          reject(error instanceof Error ? error : new TransitionFailure("unexpected"));
        }
      }
      controller.signal.addEventListener("abort", onAbort, { once: true });
      document.addEventListener("visibilitychange", check);
      observer.observe(document, { childList: true, subtree: true, attributes: true });
      check();
    });

  const awaitAbortable = <T>(operation: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const clean = () => {
        controller.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        clean();
        reject(new TransitionFailure(abortCategory));
      };
      controller.signal.addEventListener("abort", onAbort, { once: true });
      void operation.then(
        (value) => {
          clean();
          resolve(value);
        },
        (error: unknown) => {
          clean();
          reject(error instanceof Error ? error : new TransitionFailure("unexpected"));
        },
      );
      if (controller.signal.aborted) onAbort();
    });

  const publishStage = async () => {
    checkAbort();
    try {
      await awaitAbortable(publish());
      checkAbort();
    } catch (error: unknown) {
      if (error instanceof TransitionFailure) throw error;
      throw new TransitionFailure("publish-failed");
    }
  };
  const click = (button: HTMLButtonElement) => {
    checkAbort();
    if (
      !button.isConnected ||
      button.disabled ||
      button.getAttribute("aria-disabled") === "true" ||
      button.closest('[inert], [aria-hidden="true"]') != null
    ) {
      throw new TransitionFailure("button-unavailable");
    }
    button.click();
  };

  try {
    checkAbort();
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new TransitionFailure("invalid-delay");
    await waitFor(() => (document.visibilityState === "visible" ? true : null));
    let expectedTaskPath: string | null = null;
    if (location.pathname !== newTaskPath) {
      click(await waitFor(() => availableButton(menuSelector)));
      const newSessionButton = await waitFor(() => {
        const currentTask = availableButton(currentTaskSelector);
        return currentTask?.getAttribute("aria-current") === "page"
          ? availableButton(newSessionSelector)
          : null;
      });
      expectedTaskPath = location.pathname;
      click(newSessionButton);
    }
    await waitFor(() =>
      location.pathname === newTaskPath &&
      document.querySelector(drawerSelector) == null &&
      document.querySelector(editorSelector) != null
        ? true
        : null,
    );
    mark("scenario-short-ready");
    click(await waitFor(() => availableButton(menuSelector)));
    const currentTaskButton = await waitFor(() => {
      const newSession = availableButton(newSessionSelector);
      return newSession?.getAttribute("aria-current") === "page"
        ? availableButton(currentTaskSelector)
        : null;
    });
    mark("scenario-armed", { delayMs });
    await publishStage();

    let delayTimer: number | undefined;
    try {
      await awaitAbortable(
        new Promise<void>((resolve) => {
          delayTimer = window.setTimeout(resolve, delayMs);
        }),
      );
    } finally {
      window.clearTimeout(delayTimer);
    }
    checkAbort();
    const clickAt = performance.now();
    click(currentTaskButton);
    mark("scenario-current-click", { clickAt });
    await waitFor(() =>
      (expectedTaskPath == null
        ? location.pathname.startsWith(`/${CURRENT_TASK_PATH_SEGMENT}/`)
        : location.pathname === expectedTaskPath) &&
      document.querySelector(drawerSelector) == null &&
      document.querySelector(editorSelector) != null
        ? true
        : null,
    );
    // Completion means navigation finished; scroll physics and long content require external evidence.
    mark("scenario-complete");
    await publishStage();
  } catch (error: unknown) {
    mark("scenario-failed", {
      category: error instanceof TransitionFailure ? error.category : "unexpected",
    });
  } finally {
    window.clearTimeout(deadlineTimer);
    signal.removeEventListener("abort", onExternalAbort);
    controller.abort();
  }
}
