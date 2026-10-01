import { expect, vi } from "vitest";

/** Run dialog timeouts after the real menu unmounts, before its real restore frame. */
export async function withDialogMenuFocusRace(
  run: (observeMenu: (menu: Element) => void) => Promise<void>,
): Promise<void> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let observer: MutationObserver | undefined;
  let crossedRestoreWindow = false;
  try {
    await run((menu) => {
      observer = new MutationObserver(() => {
        if (!menu.isConnected && !crossedRestoreWindow) {
          crossedRestoreWindow = true;
          // Leave requestAnimationFrame real: FocusScope must restore focus itself.
          vi.advanceTimersByTime(500);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    expect(crossedRestoreWindow).toBe(true);
  } finally {
    observer?.disconnect();
    vi.useRealTimers();
  }
}
