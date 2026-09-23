// Chromium may clip a fixed backdrop's top edge in the Vitest iframe (crbug.com/1334265).
// For overlays with an exposed left strip, click its midpoint outside the dialog.
export const exposedBackdropPosition = (backdrop: HTMLElement) => ({
  x: 2,
  y: backdrop.clientHeight / 2,
});
