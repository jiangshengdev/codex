import { memo } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  type TranscriptEntry,
  type TranscriptGlobalStatus,
} from "@/features/transcriptState/transcriptStateSlice";
import { areTranscriptChunkViewsEqual } from "./committedTranscriptChunkEquality";

const statusText = (status: TranscriptGlobalStatus): string => {
  switch (status.status) {
    case "subscriptionInterrupted":
      return "Connection interrupted. Reconnect required.";
  }

  const exhaustiveStatus: never = status.status;
  return exhaustiveStatus;
};

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
  <article className={`committed-transcript-entry committed-transcript-entry-${entry.type}`}>
    {entry.type === "message" ? (
      <div className="committed-transcript-entry-role">{entry.role}</div>
    ) : null}
    <div className="committed-transcript-entry-source">{entryText(entry)}</div>
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
    <div className="committed-transcript-chunk">
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
    <article aria-label={`Turn ${turn.id}`} className="committed-transcript-turn">
      <div className="committed-transcript-turn-metadata">
        <span className="committed-transcript-turn-id">{turn.id}</span>
        <span className="committed-transcript-turn-status">{turn.status}</span>
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

  return (
    <section aria-label="Committed transcript" className="committed-transcript-surface">
      {globalStatus.length > 0 ? (
        <div className="committed-transcript-status-list">
          {globalStatus.map((status) => (
            <div className="committed-transcript-status" key={status.id} role="status">
              {statusText(status)}
            </div>
          ))}
        </div>
      ) : null}
      {turnIds.length === 0 ? (
        <p className="committed-transcript-empty">No committed messages yet.</p>
      ) : (
        <div className="committed-transcript-turn-list">
          {turnIds.map((turnId) => (
            <CommittedTranscriptTurn key={turnId} turnId={turnId} />
          ))}
        </div>
      )}
    </section>
  );
};
