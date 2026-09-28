import { useEffect, type RefObject } from "react";
import { readTaskBottomRegionViewport } from "./taskBottomRegionLayout";

const FOCUS_CLEARANCE_PX = 12;

export function useRevealTaskFocus(regionRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const region = regionRef.current;
    const main = region?.closest("main");
    if (region == null || main == null) return;

    const shell = main.closest("[data-app-shell-content-layout]");
    const topRegions = Array.from(
      shell?.querySelectorAll<HTMLElement>(":scope > header, [data-app-shell-top-notices]") ?? [],
    );

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
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;

      const top = topRegions.reduce((boundary, element) => {
        const rect = element.getBoundingClientRect();
        const { position } = getComputedStyle(element);
        if (
          (position !== "fixed" && position !== "sticky") ||
          rect.height === 0 ||
          rect.top >= window.innerHeight ||
          rect.right <= bounds.left ||
          rect.left >= bounds.right
        ) {
          return boundary;
        }
        return Math.max(boundary, rect.bottom);
      }, 0);
      const visibleBottom =
        bounds.right > obstruction.left && bounds.left < obstruction.right
          ? bottom
          : window.innerHeight;

      const above = bounds.top - top - FOCUS_CLEARANCE_PX;
      const below = bounds.bottom + FOCUS_CLEARANCE_PX - visibleBottom;
      // If the focused surface cannot fit, reveal its start instead of
      // alternating between the two occluded edges on successive frames.
      const distance = above < 0 ? above : Math.min(Math.max(0, below), above);
      if (distance !== 0) {
        window.scrollBy({ top: distance, behavior: "instant" });
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
    for (const topRegion of topRegions) observer.observe(topRegion);
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
