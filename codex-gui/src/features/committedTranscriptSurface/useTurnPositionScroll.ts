import { useLayoutEffect, useRef } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { TurnPositionRequest } from "@/features/browserLaunch/useTurnPositionRequest";

export function useTurnPositionScroll({
  request,
  targetFound,
  onComplete,
}: Readonly<{
  request: TurnPositionRequest | null;
  targetFound: boolean;
  onComplete?: (request: TurnPositionRequest) => void;
}>) {
  const { t } = useLingui();
  const surfaceRef = useRef<HTMLElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef<TurnPositionRequest | null>(null);

  useLayoutEffect(() => {
    if (request == null || completedRef.current === request) return;
    const surface = surfaceRef.current;
    if (surface == null || (targetFound && targetRef.current == null)) return;
    const align = () => {
      if (targetFound) {
        const target = targetRef.current;
        if (target == null) return;
        const shell = surface.closest("main")?.querySelector(".task-bottom-shell");
        const bottom =
          shell instanceof HTMLElement
            ? Math.min(window.innerHeight, shell.getBoundingClientRect().top)
            : window.innerHeight;
        window.scrollBy({
          top: target.getBoundingClientRect().bottom - bottom + 12,
          behavior: "instant",
        });
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      }
    };
    let frame: number;
    const positionWhenReady = () => {
      const main = surface.closest("main");
      const actionSpace = main?.querySelector("[data-thread-history-continuation-action-space]");
      const shell = main?.querySelector(".task-bottom-shell");
      // History's fixed action reserves space asynchronously after measuring its
      // height. Until that space exists the browser clamps the requested scroll.
      if (
        actionSpace instanceof HTMLElement &&
        shell instanceof HTMLElement &&
        actionSpace.getBoundingClientRect().height < shell.getBoundingClientRect().height
      ) {
        frame = requestAnimationFrame(positionWhenReady);
        return;
      }
      align();
      // Scrolling can change sticky geometry and browser scroll anchoring. Measure
      // that layout before releasing this one navigation's positioning request.
      frame = requestAnimationFrame(() => {
        align();
        if (!targetFound)
          toast.info(
            t({
              comment:
                "Temporary notification when a URL targets a turn absent from the complete conversation history",
              message: "The specified turn was not found.",
            }),
          );
        completedRef.current = request;
        onComplete?.(request);
      });
    };
    frame = requestAnimationFrame(positionWhenReady);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [onComplete, request, t, targetFound]);

  return { surfaceRef, targetRef };
}
