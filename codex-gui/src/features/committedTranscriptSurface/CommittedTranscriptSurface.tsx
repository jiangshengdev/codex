import { memo, useState } from "react";
import { Alert, Button, Card, Chip, Disclosure, Typography } from "@heroui/react";
import { useAppSelector } from "@/app/hooks";
import {
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  transcriptEntryIdFor,
  type TranscriptEntryId,
  type TranscriptEntryView,
  type TranscriptMessageRendering,
} from "@/features/transcriptState/transcriptStateSlice";
import { LiveMarkdownText } from "./LiveMarkdownText";
import { MarkdownText } from "./MarkdownText";

const subscriptionInterruptedStatusText = "Connection interrupted. Reconnect required.";

const statusText = (status: Extract<TranscriptEntryView, { type: "status" }>["status"]): string => {
  switch (status) {
    case "interrupted":
      return "Interrupted.";
    case "failed":
      return "Failed.";
  }

  const exhaustiveStatus: never = status;
  return exhaustiveStatus;
};

const MessageEntryBody = ({ rendering }: { rendering: TranscriptMessageRendering }) => {
  switch (rendering.mode) {
    case "plainText":
      return (
        <Typography
          className="committed-transcript-entry-source min-w-0 max-w-full whitespace-pre-wrap wrap-break-word leading-6"
          type="body-sm"
        >
          {rendering.source}
        </Typography>
      );
    case "staticMarkdown":
      return <MarkdownText source={rendering.source} />;
    case "streamingMarkdown":
      return <LiveMarkdownText source={rendering.source} />;
  }

  const exhaustiveRendering: never = rendering;
  return exhaustiveRendering;
};

const ActivityEntryShell = ({ title, details }: { title: string; details: readonly string[] }) => (
  <Card
    aria-label={title}
    className="committed-transcript-entry committed-transcript-entry-activity min-w-0"
    role="article"
    variant="transparent"
  >
    <Card.Header className="grid min-w-0 gap-1">
      <Card.Title className="flex min-w-0 items-start gap-2 text-sm leading-6 font-normal">
        <span aria-hidden="true">•</span>
        <span className="min-w-0 max-w-full whitespace-pre-wrap wrap-break-word">{title}</span>
      </Card.Title>
      {details.length > 0 ? (
        <Card.Description className="grid min-w-0 gap-1">
          {details.map((detail, index) => (
            <span className="flex min-w-0 items-start gap-2" key={`${String(index)}:${detail}`}>
              <span aria-hidden="true" className="w-3 shrink-0">
                {index === 0 ? "└" : ""}
              </span>
              <span className="min-w-0 max-w-full whitespace-pre-wrap wrap-break-word">
                {detail}
              </span>
            </span>
          ))}
        </Card.Description>
      ) : null}
    </Card.Header>
  </Card>
);

const TranscriptEntryRenderer = ({ entry }: { entry: TranscriptEntryView }) => {
  switch (entry.type) {
    case "message": {
      const isStreaming = entry.rendering.mode === "streamingMarkdown";

      return (
        <Card
          className={
            isStreaming
              ? "committed-transcript-live-entry committed-transcript-live-assistant-message min-w-0"
              : "committed-transcript-entry committed-transcript-entry-message min-w-0"
          }
          role="article"
          variant={isStreaming ? undefined : entry.role === "user" ? "secondary" : "default"}
        >
          <Card.Content className="grid min-w-0 gap-2">
            <MessageEntryBody rendering={entry.rendering} />
          </Card.Content>
        </Card>
      );
    }
    case "status":
      return (
        <Card
          className="committed-transcript-entry committed-transcript-entry-status min-w-0"
          role="article"
          variant="default"
        >
          <Card.Content className="grid min-w-0 gap-2">
            <Typography
              className="committed-transcript-entry-source min-w-0 max-w-full whitespace-pre-wrap wrap-break-word leading-6"
              type="body-sm"
            >
              {statusText(entry.status)}
            </Typography>
          </Card.Content>
        </Card>
      );
    case "subAgentActivity":
      return <ActivityEntryShell details={entry.details} title={entry.title} />;
  }

  const exhaustiveEntry: never = entry;
  return exhaustiveEntry;
};

const intermediateUpdatesLabel = (count: number): string =>
  `Intermediate updates · ${String(count)} ${count === 1 ? "item" : "items"}`;

const areTranscriptEntryArraysEqual = (
  previous: TranscriptEntryView[],
  next: TranscriptEntryView[],
): boolean => {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((entry, index) => entry === next[index]);
};

const LeadingPromptEntry = ({ entryId }: { entryId: TranscriptEntryId | null }) => {
  const entry = useAppSelector((state) =>
    entryId == null ? null : selectTranscriptEntry(state, entryId),
  );

  if (entry == null) {
    return null;
  }

  return <TranscriptEntryRenderer entry={entry} />;
};

const MiddleTranscriptChunk = memo(({ chunkId }: { chunkId: string }) => {
  const chunk = useAppSelector((state) => selectTranscriptChunk(state, chunkId));

  if (chunk == null || chunk.entries.length === 0) {
    return null;
  }

  return (
    <div className="committed-transcript-middle-chunk grid min-w-0 gap-3">
      {chunk.entries.map((entry) => (
        <TranscriptEntryRenderer entry={entry} key={transcriptEntryIdFor(entry.turnId, entry.id)} />
      ))}
    </div>
  );
});

MiddleTranscriptChunk.displayName = "MiddleTranscriptChunk";

const MiddleTranscriptModule = ({
  chunkIds,
  hasFinalAnswer,
  middleEntryCount,
}: {
  chunkIds: string[];
  hasFinalAnswer: boolean;
  middleEntryCount: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = intermediateUpdatesLabel(middleEntryCount);
  const shouldShowEntries = !hasFinalAnswer || isExpanded;

  if (middleEntryCount === 0) {
    return null;
  }

  return (
    <Disclosure
      className="committed-transcript-temporary-module grid min-w-0"
      isDisabled={!hasFinalAnswer}
      isExpanded={shouldShowEntries}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading>
        <Button
          className="committed-transcript-temporary-trigger justify-between"
          slot="trigger"
          variant="outline"
        >
          {label}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pt-3">
          {shouldShowEntries ? (
            <div className="grid min-w-0 gap-3">
              {chunkIds.map((chunkId) => (
                <MiddleTranscriptChunk chunkId={chunkId} key={chunkId} />
              ))}
            </div>
          ) : null}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
};

const FinalAssistantMessages = ({ entryIds }: { entryIds: TranscriptEntryId[] }) => {
  const entries = useAppSelector(
    (state) =>
      entryIds.flatMap((entryId) => {
        const entry = selectTranscriptEntry(state, entryId);
        return entry == null ? [] : [entry];
      }),
    areTranscriptEntryArraysEqual,
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <>
      {entries.map((entry) => (
        <TranscriptEntryRenderer entry={entry} key={transcriptEntryIdFor(entry.turnId, entry.id)} />
      ))}
    </>
  );
};

const CommittedTranscriptTurn = memo(({ turnId }: { turnId: string }) => {
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));

  if (turn == null) {
    return null;
  }

  const hasEntries =
    turn.leadingPromptEntryId != null ||
    turn.middleEntryCount > 0 ||
    turn.finalAssistantEntryIds.length > 0;

  if (!hasEntries) {
    return null;
  }

  return (
    <article
      aria-label={`Turn ${turn.id}`}
      className="committed-transcript-turn grid min-w-0 gap-3"
    >
      <div className="committed-transcript-turn-metadata flex min-w-0 flex-wrap items-center gap-2">
        <Chip className="committed-transcript-turn-status" color="default" size="sm">
          {turn.status}
        </Chip>
      </div>
      <div className="committed-transcript-chunk grid min-w-0 gap-3">
        <LeadingPromptEntry entryId={turn.leadingPromptEntryId} />
        <MiddleTranscriptModule
          chunkIds={turn.middleChunkIds}
          hasFinalAnswer={turn.finalAssistantEntryIds.length > 0}
          middleEntryCount={turn.middleEntryCount}
        />
        <FinalAssistantMessages entryIds={turn.finalAssistantEntryIds} />
      </div>
    </article>
  );
});

CommittedTranscriptTurn.displayName = "CommittedTranscriptTurn";

export const CommittedTranscriptSurface = () => {
  const turnIds = useAppSelector(selectTranscriptTurnIds);
  const globalStatus = useAppSelector(selectTranscriptGlobalStatus);
  const hasSurfaceContent = useAppSelector((state) =>
    selectTranscriptTurnIds(state).some((turnId) => {
      const turn = selectTranscriptTurn(state, turnId);
      return (
        turn != null &&
        (turn.leadingPromptEntryId != null ||
          turn.middleEntryCount > 0 ||
          turn.finalAssistantEntryIds.length > 0)
      );
    }),
  );

  return (
    <section
      aria-label="Committed transcript"
      className="committed-transcript-surface mx-auto grid min-w-0 w-full max-w-3xl gap-4"
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
      {!hasSurfaceContent ? (
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
