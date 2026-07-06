import { useEffect, type RefObject } from "react";

const COMPOSER_KEYBOARD_CLEARANCE_PX = 8;

export function useRevealComposerOnViewportResize(
  composerShellRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const composerShell = composerShellRef.current;
    const visualViewport = window.visualViewport;
    const textarea = composerShell?.querySelector("textarea") ?? null;

    if (
      composerShell == null ||
      visualViewport == null ||
      !(textarea instanceof HTMLTextAreaElement)
    ) {
      return;
    }

    let armed = false;
    let animationFrameId: number | null = null;

    const cancelPendingFrame = (): void => {
      if (animationFrameId == null) {
        return;
      }
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    };

    const disarm = (): void => {
      armed = false;
      cancelPendingFrame();
    };

    const revealIfCovered = (): void => {
      animationFrameId = null;

      if (!armed) {
        return;
      }
      armed = false;

      if (document.activeElement !== textarea) {
        return;
      }

      if (visualViewport.height >= document.documentElement.clientHeight) {
        return;
      }

      const visualBottom = visualViewport.offsetTop + visualViewport.height;
      const overlap = composerShell.getBoundingClientRect().bottom - visualBottom;

      if (overlap <= 0) {
        return;
      }

      window.scrollBy({ top: overlap + COMPOSER_KEYBOARD_CLEARANCE_PX });
    };

    const onFocus = (): void => {
      cancelPendingFrame();
      armed = true;
    };

    const onBlur = (): void => {
      disarm();
    };

    const onVisualViewportResize = (): void => {
      if (!armed) {
        return;
      }
      cancelPendingFrame();
      animationFrameId = requestAnimationFrame(revealIfCovered);
    };

    textarea.addEventListener("focus", onFocus);
    textarea.addEventListener("blur", onBlur);
    visualViewport.addEventListener("resize", onVisualViewportResize);

    return () => {
      textarea.removeEventListener("focus", onFocus);
      textarea.removeEventListener("blur", onBlur);
      visualViewport.removeEventListener("resize", onVisualViewportResize);
      cancelPendingFrame();
    };
  }, [composerShellRef]);
}
