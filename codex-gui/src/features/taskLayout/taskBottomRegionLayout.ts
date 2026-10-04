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
