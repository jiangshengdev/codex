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

export function useCommittedTranscriptStickyBottom(
  threadId: string,
  enabled = true,
): RefObject<HTMLDivElement | null> {
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const previousMaxScrollTopRef = useRef<number | null>(null);
  const suspendedRef = useRef(!enabled);
  const scrollCommitKey = useAppSelector((state) =>
    selectCommittedTranscriptScrollCommitKey(state, threadId),
  );
  const liveScrollPulse = useAppSelector((state) =>
    selectTranscriptLiveScrollPulse(state, threadId),
  );

  const reconcileStickyBottom = useCallback(() => {
    if (!enabled) {
      suspendedRef.current = true;
      return;
    }
    const scroller = documentScroller();
    if (scroller == null) {
      return;
    }

    const currentMaxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (suspendedRef.current) {
      suspendedRef.current = false;
      previousMaxScrollTopRef.current = currentMaxScrollTop;
      return;
    }
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
  }, [enabled]);

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
