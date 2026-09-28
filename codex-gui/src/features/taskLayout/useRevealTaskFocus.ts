import { useEffect, type RefObject } from "react";
import { readTaskBottomRegionViewport } from "./taskBottomRegionLayout";

const FOCUS_CLEARANCE_PX = 12;

export function useRevealTaskFocus(regionRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const region = regionRef.current;
    const main = region?.closest("main");
    if (region == null || main == null) return;

    let frame: number | null = null;
    const reveal = () => {
      const target = document.activeElement;
      if (
        !(target instanceof HTMLElement) ||
        target === main ||
        !main.contains(target) ||
        region.contains(target)
      ) {
        return;
      }

      const { bottom, ready } = readTaskBottomRegionViewport(main);
      if (!ready) return;
      const bounds = target.getBoundingClientRect();
      const obstruction = region.getBoundingClientRect();
      if (
        bounds.bottom <= 0 ||
        bounds.top >= window.innerHeight ||
        bounds.right <= obstruction.left ||
        bounds.left >= obstruction.right
      ) {
        return;
      }

      const overlap = bounds.bottom + FOCUS_CLEARANCE_PX - bottom;
      if (overlap > 0) {
        window.scrollBy({ top: overlap, behavior: "instant" });
      }
    };
    const schedule = () => {
      if (frame != null) cancelAnimationFrame(frame);
      // Let native focus scrolling finish first. A second frame accounts for
      // sticky geometry and the fixed region's measured spacer being committed.
      frame = requestAnimationFrame(() => {
        reveal();
        frame = requestAnimationFrame(() => {
          frame = null;
          reveal();
        });
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(region);
    main.addEventListener("focusin", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      main.removeEventListener("focusin", schedule);
      window.removeEventListener("resize", schedule);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [regionRef]);
}
