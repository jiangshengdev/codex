function normalizedRect(rect, fallback) {
  return {
    x: rect?.x ?? rect?.origin?.x ?? fallback.x,
    y: rect?.y ?? rect?.origin?.y ?? fallback.y,
    width: rect?.width ?? rect?.size?.width ?? fallback.width,
    height: rect?.height ?? rect?.size?.height ?? fallback.height,
  };
}

export function visibleFrame(screen) {
  return normalizedRect(screen.visible, {
    x: -1920,
    y: 0,
    width: 1920,
    height: 1080,
  });
}

export function screenFrame(screen) {
  return normalizedRect(screen.frame ?? screen.visible, visibleFrame(screen));
}

export function screenContainingX(screens, x) {
  return screens.find((screen) => {
    const visible = visibleFrame(screen);
    return x >= visible.x && x < visible.x + visible.width;
  }) ?? null;
}

export function targetScreen(screens, codexPosition) {
  const sorted = [...screens].sort((a, b) => visibleFrame(a).x - visibleFrame(b).x);
  if (sorted.length === 0) {
    return {
      screen: {
        frame: { x: -1920, y: 0, width: 1920, height: 1080 },
        visible: { x: -1920, y: 0, width: 1920, height: 1080 },
      },
      reason: 'fallback-fixed-left-screen',
    };
  }
  const codexScreen = codexPosition ? screenContainingX(sorted, codexPosition.x) : null;
  const nonCodex = codexScreen ? sorted.find((screen) => screen.i !== codexScreen.i) : null;
  if (nonCodex) {
    return { screen: nonCodex, reason: `non-codex-screen-${nonCodex.i}` };
  }
  const fallback = sorted[0];
  return {
    screen: fallback,
    reason: codexScreen ? 'single-screen-fallback' : 'codex-screen-undetected-fallback',
  };
}

export function targetLayout(screens, codexPosition) {
  const { screen, reason } = targetScreen(screens, codexPosition);
  const primary = screenFrame(screens[0] ?? screen);
  const visible = visibleFrame(screen);
  const x = Math.trunc(visible.x);
  const y = Math.trunc(primary.y + primary.height - visible.y - visible.height);
  const width = Math.trunc(visible.width);
  const height = Math.trunc(visible.height);
  const half = Math.trunc(width / 2);
  return {
    reason,
    browser: { x, y, width: half, height },
    devtools: { x: x + half, y, width: width - half, height },
  };
}
