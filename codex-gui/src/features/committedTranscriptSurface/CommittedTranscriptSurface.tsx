import { memo, useMemo, useState } from "react";
import { Alert, Button, Card, Chip, Disclosure, Typography } from "@heroui/react";
import { useAppSelector } from "@/app/hooks";
import {
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  type TranscriptChunkView,
  type TranscriptEntry,
} from "@/features/transcriptState/transcriptStateSlice";
import { areTranscriptChunkViewsEqual } from "./committedTranscriptChunkEquality";
import { groupTranscriptEntriesForDisplay } from "./committedTranscriptDisplayGroups";

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
    className={`committed-transcript-entry committed-transcript-entry-${entry.type} min-w-0`}
    role="article"
  >
    <Card.Content className="grid min-w-0 gap-2">
      {entry.type === "message" ? (
        <Typography
          className="committed-transcript-entry-role min-w-0 max-w-full"
          color="muted"
          type="body-xs"
          weight="medium"
        >
          {entry.role}
        </Typography>
      ) : null}
      <Typography
        className="committed-transcript-entry-source min-w-0 max-w-full whitespace-pre-wrap wrap-break-word leading-6"
        type="body-sm"
      >
        {entryText(entry)}
      </Typography>
    </Card.Content>
  </Card>
);

const temporaryUpdatesLabel = (count: number): string =>
  `Temporary updates · ${String(count)} ${count === 1 ? "item" : "items"}`;

const TemporaryTranscriptModule = ({
  entries,
  hasFinalAnswer,
}: {
  entries: TranscriptEntry[];
  hasFinalAnswer: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = temporaryUpdatesLabel(entries.length);
  const shouldShowEntries = !hasFinalAnswer || isExpanded;

  return (
    <Disclosure
      className="committed-transcript-temporary-module grid min-w-0 gap-2"
      isDisabled={!hasFinalAnswer}
      isExpanded={!hasFinalAnswer || isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading>
        <Button
          className="committed-transcript-temporary-trigger justify-between"
          slot="trigger"
          variant="secondary"
        >
          {label}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pt-3">
          <div
            className="grid min-w-0 gap-3"
            style={{ display: shouldShowEntries ? undefined : "none" }}
          >
            {entries.map((entry) => (
              <CommittedTranscriptEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
};

const areStringArraysEqual = (previous: string[], next: string[]): boolean => {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((value, index) => value === next[index]);
};

const areTranscriptChunkViewArraysEqual = (
  previous: (TranscriptChunkView | null)[],
  next: (TranscriptChunkView | null)[],
): boolean => {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((chunk, index) => areTranscriptChunkViewsEqual(chunk, next[index] ?? null));
};

const CommittedTranscriptTurn = memo(({ turnId }: { turnId: string }) => {
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));
  const chunkIds = useAppSelector(
    (state) => selectTranscriptChunkIdsForTurn(state, turnId),
    areStringArraysEqual,
  );
  const chunks = useAppSelector(
    (state) => chunkIds.map((chunkId) => selectTranscriptChunk(state, chunkId)),
    areTranscriptChunkViewArraysEqual,
  );
  const entries = useMemo(() => chunks.flatMap((chunk) => chunk?.entries ?? []), [chunks]);
  const displayItems = useMemo(() => groupTranscriptEntriesForDisplay(entries), [entries]);

  if (turn == null || chunkIds.length === 0) {
    return null;
  }

  return (
    <article
      aria-label={`Turn ${turn.id}`}
      className="committed-transcript-turn grid min-w-0 gap-3"
    >
      <div className="committed-transcript-turn-metadata flex min-w-0 flex-wrap items-center gap-2">
        <Typography
          className="committed-transcript-turn-id min-w-0 max-w-full wrap-break-word"
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
      <div className="committed-transcript-chunk grid min-w-0 gap-3">
        {displayItems.map((item) => {
          switch (item.type) {
            case "entry":
            case "finalAnswer":
              return <CommittedTranscriptEntry key={item.entry.id} entry={item.entry} />;
            case "temporaryModule":
              return (
                <TemporaryTranscriptModule
                  entries={item.entries}
                  hasFinalAnswer={item.hasFinalAnswer}
                  key={item.id}
                />
              );
          }

          const exhaustiveItem: never = item;
          return exhaustiveItem;
        })}
      </div>
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
      className="committed-transcript-surface mx-auto grid min-w-0 w-full max-w-5xl gap-4"
    >
      {globalStatus.length > 0 ? (
        <div className="committed-transcript-status-list grid min-w-0 gap-2">
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
        <div className="committed-transcript-turn-list grid min-w-0 gap-6">
          {turnIds.map((turnId) => (
            <CommittedTranscriptTurn key={turnId} turnId={turnId} />
          ))}
        </div>
      )}
    </section>
  );
};
