export function installTestVisualViewport<T extends { height: number; offsetTop: number }>(
  geometry: T,
) {
  const viewport = Object.assign(new EventTarget(), geometry);
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  return {
    viewport,
    dispatchResize: () => viewport.dispatchEvent(new Event("resize")),
  };
}
