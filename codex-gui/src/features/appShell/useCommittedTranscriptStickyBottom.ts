import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppSelector } from "@/app/hooks";
import { selectCommittedTranscriptScrollCommitKey } from "@/features/transcriptState/transcriptStateSlice";

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
  const scrollCommitKey = useAppSelector(selectCommittedTranscriptScrollCommitKey);

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

  useLayoutEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollDocumentToBottom();
    }
  }, [scrollCommitKey]);

  return bottomSentinelRef;
}
