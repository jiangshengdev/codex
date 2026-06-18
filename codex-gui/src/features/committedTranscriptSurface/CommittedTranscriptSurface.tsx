import { memo } from "react";
import { Alert, Card, Chip, Typography } from "@heroui/react";
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
  <Card
    className={`committed-transcript-entry committed-transcript-entry-${entry.type}`}
    role="article"
  >
    <Card.Content className="grid gap-2">
      {entry.type === "message" ? (
        <Typography
          className="committed-transcript-entry-role"
          color="muted"
          type="body-xs"
          weight="medium"
        >
          {entry.role}
        </Typography>
      ) : null}
      <Typography
        className="committed-transcript-entry-source whitespace-pre-wrap wrap-break-word leading-6"
        type="body-sm"
      >
        {entryText(entry)}
      </Typography>
    </Card.Content>
  </Card>
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
    <article aria-label={`Turn ${turn.id}`} className="committed-transcript-turn grid gap-3">
      <div className="committed-transcript-turn-metadata flex flex-wrap items-center gap-2">
        <Typography
          className="committed-transcript-turn-id"
          color="muted"
          type="body-xs"
          weight="medium"
        >
          {turn.id}
        </Typography>
        <Chip className="committed-transcript-turn-status" color="default" size="sm">
          {turn.status}
        </Chip>
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
            <Alert
              className="committed-transcript-status"
              key={status.id}
              role="status"
              status="danger"
            >
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{subscriptionInterruptedStatusText}</Alert.Title>
              </Alert.Content>
            </Alert>
          ))}
        </div>
      ) : null}
      {!hasCommittedChunks ? (
        <Card className="committed-transcript-empty">
          <Card.Content>
            <Typography color="muted" type="body-sm">
              No committed messages yet.
            </Typography>
          </Card.Content>
        </Card>
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
