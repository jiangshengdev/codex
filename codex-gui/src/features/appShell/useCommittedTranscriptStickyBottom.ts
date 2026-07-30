import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptLiveScrollPulse,
} from "@/features/transcriptState/transcriptStateSlice";

const documentScroller = (): HTMLElement | null => {
  const scroller = document.scrollingElement;
  return scroller instanceof HTMLElement ? scroller : null;
};

const scrollDocumentToBottom = (): void => {
  const scroller = documentScroller();
  scroller?.scrollTo({ top: scroller.scrollHeight });
};

export function useCommittedTranscriptStickyBottom(): RefObject<HTMLDivElement | null> {
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const scrollAfterResizeRef = useRef(false);
  const scrollTopBeforeResizeRef = useRef<number | null>(null);
  const scrollCommitKey = useAppSelector(selectCommittedTranscriptScrollCommitKey);
  const liveScrollPulse = useAppSelector(selectTranscriptLiveScrollPulse);

  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (sentinel == null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        pinnedToBottomRef.current = entry?.isIntersecting ?? false;
      },
      { root: null, threshold: 1 },
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const main = bottomSentinelRef.current?.parentElement;
    if (main == null) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!scrollAfterResizeRef.current) {
        return;
      }

      scrollAfterResizeRef.current = false;
      const scrollTopBeforeResize = scrollTopBeforeResizeRef.current;
      scrollTopBeforeResizeRef.current = null;
      const scroller = documentScroller();
      if (
        scroller != null &&
        scrollTopBeforeResize != null &&
        scroller.scrollTop < scrollTopBeforeResize - 4
      ) {
        return;
      }

      scrollDocumentToBottom();
    });
    observer.observe(main);

    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const pinnedToBottom = pinnedToBottomRef.current;
    scrollAfterResizeRef.current = pinnedToBottom;
    if (!pinnedToBottom) {
      scrollTopBeforeResizeRef.current = null;
      return;
    }

    scrollDocumentToBottom();
    scrollTopBeforeResizeRef.current = documentScroller()?.scrollTop ?? null;
  }, [liveScrollPulse, scrollCommitKey]);

  return bottomSentinelRef;
}
