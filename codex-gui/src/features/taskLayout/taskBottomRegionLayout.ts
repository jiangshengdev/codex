export function readTaskBottomRegionViewport(main: HTMLElement | null): {
  bottom: number;
  ready: boolean;
} {
  const region = main?.querySelector("[data-task-bottom-region]");
  if (!(region instanceof HTMLElement)) return { bottom: window.innerHeight, ready: true };

  const bounds = region.getBoundingClientRect();
  const space = region.previousElementSibling;
  const ready =
    region.dataset.taskBottomRegion !== "fixed" ||
    (space instanceof HTMLElement &&
      space.hasAttribute("data-task-bottom-region-space") &&
      space.getBoundingClientRect().height >= bounds.height);
  return { bottom: Math.min(window.innerHeight, bounds.top), ready };
}

export function readTaskTopRegionViewport(main: HTMLElement | null, bounds: DOMRect): number {
  const shell = main?.closest("[data-app-shell-content-layout]");
  const regions =
    shell?.querySelectorAll<HTMLElement>(":scope > header, [data-app-shell-top-notices]") ?? [];
  return Array.from(regions).reduce((boundary, element) => {
    const rect = element.getBoundingClientRect();
    const { position } = getComputedStyle(element);
    if (
      (position !== "fixed" && position !== "sticky") ||
      rect.height === 0 ||
      rect.top >= window.innerHeight ||
      rect.right <= bounds.left ||
      rect.left >= bounds.right
    )
      return boundary;
    return Math.max(boundary, rect.bottom);
  }, 0);
}
