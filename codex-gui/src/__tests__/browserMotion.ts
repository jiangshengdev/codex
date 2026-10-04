const DISABLE_MOTION_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`;

let motionStyle: HTMLStyleElement | undefined;

/** Owned by the Browser setup, once per test, including portal content. */
export function installBrowserMotionPolicy(): () => void {
  const style = document.createElement("style");
  style.textContent = DISABLE_MOTION_CSS;
  document.head.append(style);
  motionStyle = style;
  return () => {
    style.remove();
    motionStyle = undefined;
  };
}

/** Opt into real CSS motion before rendering a test that verifies animation timing. */
export function enableMotionForTest(): void {
  if (!motionStyle) throw new Error("Browser motion policy must be installed before opting in");
  motionStyle.disabled = true;
}
