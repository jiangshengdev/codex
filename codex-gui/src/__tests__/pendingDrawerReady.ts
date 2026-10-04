// Keep this function self-contained so Playwright can serialize it into the page.
export function isPendingDrawerReady(): boolean {
  const backdrop = document.querySelector('[data-slot="drawer-backdrop"]');
  const dialog = backdrop?.querySelector('[data-slot="drawer-dialog"]');
  if (!(backdrop instanceof HTMLElement) || !(dialog instanceof HTMLElement)) return false;
  // An offscreen drawer can appear stable before its entry transition starts.
  const bounds = dialog.getBoundingClientRect();
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.left >= 0 &&
    bounds.right <= window.innerWidth &&
    bounds.top >= 0 &&
    bounds.bottom <= window.innerHeight &&
    backdrop.querySelector('[data-entering="true"]') == null &&
    backdrop
      .getAnimations({ subtree: true })
      .every((animation) => animation.playState !== "running" && !animation.pending)
  );
}
