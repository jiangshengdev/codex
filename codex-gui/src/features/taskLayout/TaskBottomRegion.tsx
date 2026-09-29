import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRevealTaskFocus } from "./useRevealTaskFocus";
import "./taskBottomRegion.css";

export function TaskBottomRegion({
  children,
  placement,
  as: Element = "section",
  className,
  label,
  regionRef,
}: Readonly<{
  children: ReactNode;
  placement: "sticky" | "fixed";
  as?: "section" | "aside";
  className?: string;
  label?: string;
  regionRef?: RefObject<HTMLElement | null>;
}>) {
  const localRef = useRef<HTMLElement | null>(null);
  const shellRef = regionRef ?? localRef;
  const [height, setHeight] = useState(0);
  useRevealTaskFocus(shellRef);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (placement !== "fixed" || shell == null) return;

    let animationFrame: number | null = null;
    let pendingHeight: number | null = null;
    const commitHeight = () => {
      animationFrame = null;
      if (pendingHeight != null) setHeight(pendingHeight);
    };
    const observer = new ResizeObserver((entries) => {
      const borderBoxSize = entries[0]?.borderBoxSize[0];
      if (borderBoxSize == null) return;
      pendingHeight = borderBoxSize.blockSize;
      animationFrame ??= requestAnimationFrame(commitHeight);
    });
    observer.observe(shell, { box: "border-box" });
    return () => {
      observer.disconnect();
      if (animationFrame != null) cancelAnimationFrame(animationFrame);
    };
  }, [placement, shellRef]);

  return (
    <>
      {placement === "fixed" ? (
        <div
          aria-hidden="true"
          className="[overflow-anchor:none]"
          data-task-bottom-region-space=""
          style={{ height }}
        />
      ) : null}
      <Element
        aria-label={label}
        className={`task-bottom-shell task-bottom-region${className == null ? "" : ` ${className}`}`}
        data-task-bottom-region={placement}
        ref={shellRef}
      >
        <div
          className={`task-bottom-region__content${placement === "fixed" ? " app-shell-content-boundary" : ""}`}
        >
          {children}
        </div>
      </Element>
    </>
  );
}
