import { useLayoutEffect, useRef } from "react";

// Track the reader's position before content grows. The one-pixel allowance
// covers the integer rounding of scrollHeight/clientHeight versus scrollTop.
export function useMarkdownTableScroll(isAnimating: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const following = useRef(true);
  const previousScrollTop = useRef(0);
  // Apply React content growth before the browser dispatches a delayed scroll
  // event from the preceding frame; otherwise that event sees the new height
  // and incorrectly classifies the reader as having scrolled away from bottom.
  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    const table = tableRef.current;
    if (!isAnimating || !viewport || !table) return;
    const followContent = () => {
      // scrollTop changes immediately, but its scroll event may arrive after
      // this render. Respect that user movement before applying content growth.
      if (viewport.scrollTop < previousScrollTop.current - 1) following.current = false;
      if (following.current) viewport.scrollTop = viewport.scrollHeight;
      previousScrollTop.current = viewport.scrollTop;
    };
    followContent();
    const resize = new ResizeObserver(followContent);
    resize.observe(table);
    return () => {
      resize.disconnect();
    };
  });
  const onScroll = () => {
    const viewport = scrollRef.current;
    if (viewport) {
      following.current = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1;
      previousScrollTop.current = viewport.scrollTop;
    }
  };
  return { scrollRef, tableRef, onScroll };
}
