import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import {
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptTurnIds,
} from "@/features/transcriptState/transcriptStateSlice";

const selectCommittedTranscriptScrollRevision = (state: RootState): string =>
  selectTranscriptTurnIds(state)
    .map((turnId) => {
      const chunkRevisionKey = selectTranscriptChunkIdsForTurn(state, turnId)
        .map((chunkId) => {
          const chunk = selectTranscriptChunk(state, chunkId);
          return `${chunkId}:${String(chunk?.revision ?? "missing")}:${String(chunk?.entries.length ?? 0)}`;
        })
        .join(",");

      return `${turnId}[${chunkRevisionKey}]`;
    })
    .join("|");

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
  const scrollRevision = useAppSelector(selectCommittedTranscriptScrollRevision);

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
  }, [scrollRevision]);

  return bottomSentinelRef;
}
