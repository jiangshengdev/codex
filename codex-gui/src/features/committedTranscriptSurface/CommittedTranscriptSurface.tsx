import { memo } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  type TranscriptEntry,
} from "@/features/transcriptState/transcriptStateSlice";
import { areTranscriptChunkViewsEqual } from "./committedTranscriptChunkEquality";

const subscriptionInterruptedStatusText = "Connection interrupted. Reconnect required.";

const entryText = (entry: TranscriptEntry): string => {
  switch (entry.type) {
    case "message":
      return entry.source;
    case "status":
      switch (entry.status) {
        case "interrupted":
          return "Interrupted.";
        case "failed":
          return "Failed.";
      }
  }

  const exhaustiveEntry: never = entry;
  return exhaustiveEntry;
};

const CommittedTranscriptEntry = ({ entry }: { entry: TranscriptEntry }) => (
  <article
    className={`committed-transcript-entry committed-transcript-entry-${entry.type} rounded-md border border-foreground/10 bg-background px-4 py-3 text-sm shadow-sm`}
  >
    {entry.type === "message" ? (
      <div className="committed-transcript-entry-role mb-2 text-xs font-medium uppercase tracking-normal text-muted">
        {entry.role}
      </div>
    ) : null}
    <div className="committed-transcript-entry-source whitespace-pre-wrap wrap-break-word leading-6 text-foreground">
      {entryText(entry)}
    </div>
  </article>
);

const CommittedTranscriptChunk = memo(({ chunkId }: { chunkId: string }) => {
  const chunk = useAppSelector(
    (state) => selectTranscriptChunk(state, chunkId),
    areTranscriptChunkViewsEqual,
  );

  if (chunk == null || chunk.entries.length === 0) {
    return null;
  }

  return (
    <div className="committed-transcript-chunk grid gap-3">
      {chunk.entries.map((entry) => (
        <CommittedTranscriptEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
});

CommittedTranscriptChunk.displayName = "CommittedTranscriptChunk";

const areStringArraysEqual = (previous: string[], next: string[]): boolean => {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((value, index) => value === next[index]);
};

const CommittedTranscriptTurn = memo(({ turnId }: { turnId: string }) => {
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));
  const chunkIds = useAppSelector(
    (state) => selectTranscriptChunkIdsForTurn(state, turnId),
    areStringArraysEqual,
  );

  if (turn == null || chunkIds.length === 0) {
    return null;
  }

  return (
    <article
      aria-label={`Turn ${turn.id}`}
      className="committed-transcript-turn grid gap-3"
    >
      <div className="committed-transcript-turn-metadata flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="committed-transcript-turn-id font-medium">{turn.id}</span>
        <span className="committed-transcript-turn-status rounded-sm bg-foreground/5 px-2 py-0.5">
          {turn.status}
        </span>
      </div>
      {chunkIds.map((chunkId) => (
        <CommittedTranscriptChunk key={chunkId} chunkId={chunkId} />
      ))}
    </article>
  );
});

CommittedTranscriptTurn.displayName = "CommittedTranscriptTurn";

export const CommittedTranscriptSurface = () => {
  const turnIds = useAppSelector(selectTranscriptTurnIds);
  const globalStatus = useAppSelector(selectTranscriptGlobalStatus);
  const hasCommittedChunks = useAppSelector((state) =>
    selectTranscriptTurnIds(state).some(
      (turnId) => selectTranscriptChunkIdsForTurn(state, turnId).length > 0,
    ),
  );

  return (
    <section
      aria-label="Committed transcript"
      className="committed-transcript-surface mx-auto grid w-full max-w-5xl gap-4"
    >
      {globalStatus.length > 0 ? (
        <div className="committed-transcript-status-list grid gap-2">
          {globalStatus.map((status) => (
            <div
              className="committed-transcript-status rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
              key={status.id}
              role="status"
            >
              {subscriptionInterruptedStatusText}
            </div>
          ))}
        </div>
      ) : null}
      {!hasCommittedChunks ? (
        <p className="committed-transcript-empty rounded-md border border-dashed border-foreground/20 px-4 py-6 text-sm text-muted">
          No committed messages yet.
        </p>
      ) : (
        <div className="committed-transcript-turn-list grid gap-6">
          {turnIds.map((turnId) => (
            <CommittedTranscriptTurn key={turnId} turnId={turnId} />
          ))}
        </div>
      )}
    </section>
  );
};
