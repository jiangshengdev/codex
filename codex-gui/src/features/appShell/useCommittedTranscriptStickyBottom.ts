import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptLiveScrollPulse,
} from "@/features/transcriptState/transcriptStateSlice";

const documentScroller = (): HTMLElement | null => {
  const scroller = document.scrollingElement;
  return scroller instanceof HTMLElement ? scroller : null;
};

export function useCommittedTranscriptStickyBottom(): RefObject<HTMLDivElement | null> {
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const previousMaxScrollTopRef = useRef<number | null>(null);
  const scrollCommitKey = useAppSelector(selectCommittedTranscriptScrollCommitKey);
  const liveScrollPulse = useAppSelector(selectTranscriptLiveScrollPulse);

  const reconcileStickyBottom = useCallback(() => {
    const scroller = documentScroller();
    if (scroller == null) {
      return;
    }

    const currentMaxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const previousMaxScrollTop = previousMaxScrollTopRef.current;
    const pinnedToBottom =
      previousMaxScrollTop == null ||
      scroller.scrollTop >= Math.min(previousMaxScrollTop, currentMaxScrollTop) - 4;
    previousMaxScrollTopRef.current = currentMaxScrollTop;

    if (!pinnedToBottom) {
      return;
    }

    scroller.scrollTo({ top: scroller.scrollHeight });
    previousMaxScrollTopRef.current = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  }, []);

  useEffect(() => {
    const main = bottomSentinelRef.current?.parentElement;
    if (main == null) {
      return;
    }

    const observer = new ResizeObserver(() => {
      reconcileStickyBottom();
    });
    observer.observe(main);

    return () => {
      observer.disconnect();
    };
  }, [reconcileStickyBottom]);

  useLayoutEffect(() => {
    reconcileStickyBottom();
  }, [liveScrollPulse, reconcileStickyBottom, scrollCommitKey]);

  return bottomSentinelRef;
}
