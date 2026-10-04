import { useLayoutEffect, useRef, type CSSProperties } from "react";

const MAX_MENU_HEIGHT_PX = 360;
const MENU_VIEWPORT_HEIGHT_RATIO = 0.4;
const MENU_GAP_PX = 8;

export type ComposerSkillMenuLayerProps = Readonly<{
  onPortalParentChange: (portalParent: HTMLElement | null) => void;
}>;

export function ComposerSkillMenuLayer({ onPortalParentChange }: ComposerSkillMenuLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    onPortalParentChange(host);
    return () => {
      onPortalParentChange(null);
    };
  }, [onPortalParentChange]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host == null) {
      return;
    }
    const panel = host.parentElement;
    if (!(panel instanceof HTMLElement)) {
      return;
    }

    let animationFrame: number | null = null;
    const updateMaxHeight = (): void => {
      const visualViewport = window.visualViewport;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const availableHeight = Math.max(
        0,
        panel.getBoundingClientRect().top - viewportTop - MENU_GAP_PX,
      );
      const maxHeight = Math.min(
        viewportHeight * MENU_VIEWPORT_HEIGHT_RATIO,
        MAX_MENU_HEIGHT_PX,
        availableHeight,
      );
      host.style.setProperty("--composer-skill-menu-max-height", `${String(maxHeight)}px`);
    };
    const scheduleUpdate = (): void => {
      if (animationFrame != null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateMaxHeight();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(panel);
    window.addEventListener("resize", scheduleUpdate);
    document.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);
    updateMaxHeight();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      document.removeEventListener("scroll", scheduleUpdate, true);
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
      if (animationFrame != null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-20 max-h-[var(--composer-skill-menu-max-height)]"
      ref={hostRef}
      style={initialLayerStyle}
    />
  );
}

const initialLayerStyle = {
  "--composer-skill-menu-max-height": "0px",
} as CSSProperties;
