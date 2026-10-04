import { useLayoutEffect, useRef } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { TurnPositionRequest } from "@/features/browserLaunch/useTurnPositionRequest";
import { readTaskBottomRegionViewport } from "@/features/taskLayout/taskBottomRegionLayout";

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
        const { bottom } = readTaskBottomRegionViewport(surface.closest("main"));
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
      // Wait for the shared bottom layout to reserve its measured space before
      // positioning; otherwise the browser can clamp the requested scroll.
      if (!readTaskBottomRegionViewport(surface.closest("main")).ready) {
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
