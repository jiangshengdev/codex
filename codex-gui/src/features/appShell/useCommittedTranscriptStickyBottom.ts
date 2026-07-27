import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppSelector } from "@/app/hooks";
import { useChatUiSession } from "@/features/chatUiSession/ChatUiSessionProvider";
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

const scrollDocumentTo = (scrollTop: number): void => {
  documentScroller()?.scrollTo({ top: scrollTop });
};

type CommittedTranscriptStickyBottom = Readonly<{
  captureScrollSnapshot: () => void;
  transcriptBottomRef: RefObject<HTMLDivElement | null>;
}>;

export function useCommittedTranscriptStickyBottom(): CommittedTranscriptStickyBottom {
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const {
    captureScrollSnapshot: captureSessionScrollSnapshot,
    completeScrollRestore,
    consumeScrollRestore,
  } = useChatUiSession();
  const scrollCommitKey = useAppSelector(selectCommittedTranscriptScrollCommitKey);
  const liveScrollPulse = useAppSelector(selectTranscriptLiveScrollPulse);

  const captureScrollSnapshot = useCallback((): void => {
    captureSessionScrollSnapshot({
      isStickyBottom: pinnedToBottomRef.current,
      scrollTop: documentScroller()?.scrollTop ?? 0,
    });
  }, [captureSessionScrollSnapshot]);

  useLayoutEffect(() => {
    const restore = consumeScrollRestore();
    if (restore == null) {
      return;
    }

    pinnedToBottomRef.current = restore.type === "stickyBottom";
    if (restore.type === "stickyBottom") {
      scrollDocumentToBottom();
    } else {
      scrollDocumentTo(restore.scrollTop);
    }
    completeScrollRestore();
  }, [completeScrollRestore, consumeScrollRestore]);

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
  }, [liveScrollPulse, scrollCommitKey]);

  return { captureScrollSnapshot, transcriptBottomRef: bottomSentinelRef };
}
