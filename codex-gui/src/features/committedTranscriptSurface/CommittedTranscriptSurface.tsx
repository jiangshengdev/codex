import { memo, useState } from "react";
import { Alert, Button, Card, Chip, Disclosure, Typography } from "@heroui/react";
import { useAppSelector } from "@/app/hooks";
import {
  selectTranscriptGlobalStatus,
  selectTranscriptMessageChunk,
  selectTranscriptMessagePresentation,
  selectTranscriptMiddleMessagePresentation,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  type TranscriptEntry,
  type TranscriptMessageKey,
  type TranscriptMessagePresentation,
  type TranscriptRenderableLiveItem,
} from "@/features/transcriptState/transcriptStateSlice";
import { LiveMarkdownText } from "./LiveMarkdownText";
import { MarkdownText } from "./MarkdownText";

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

const CommittedTranscriptEntry = ({ entry }: { entry: TranscriptEntry }) => {
  const shouldRenderMarkdown =
    entry.type === "message" && entry.role === "assistant" && entry.sourceKind === "markdown";

  return (
    <Card
      className={`committed-transcript-entry committed-transcript-entry-${entry.type} min-w-0`}
      role="article"
      variant={entry.type === "message" && entry.role === "user" ? "secondary" : "default"}
    >
      <Card.Content className="grid min-w-0 gap-2">
        {shouldRenderMarkdown ? (
          <MarkdownText source={entry.source} />
        ) : (
          <Typography
            className="committed-transcript-entry-source min-w-0 max-w-full whitespace-pre-wrap wrap-break-word leading-6"
            type="body-sm"
          >
            {entryText(entry)}
          </Typography>
        )}
      </Card.Content>
    </Card>
  );
};

const intermediateUpdatesLabel = (count: number): string =>
  `Intermediate updates · ${String(count)} ${count === 1 ? "item" : "items"}`;

const LiveAssistantMessageEntry = ({ item }: { item: TranscriptRenderableLiveItem }) => (
  <Card
    className="committed-transcript-live-entry committed-transcript-live-assistant-message min-w-0"
    role="article"
  >
    <Card.Content className="grid min-w-0 gap-2">
      <LiveMarkdownText source={item.transientText} />
    </Card.Content>
  </Card>
);

const TranscriptMessageEntry = ({ presentation }: { presentation: TranscriptMessagePresentation }) =>
  "initialItem" in presentation ? (
    <LiveAssistantMessageEntry item={presentation} />
  ) : (
    <CommittedTranscriptEntry entry={presentation} />
  );

const LeadingPromptEntry = ({ messageKey }: { messageKey: TranscriptMessageKey | null }) => {
  const presentation = useAppSelector((state) =>
    messageKey == null ? null : selectTranscriptMessagePresentation(state, messageKey),
  );

  if (presentation == null) {
    return null;
  }

  return <TranscriptMessageEntry presentation={presentation} />;
};

const MiddleTranscriptMessage = ({ messageKey }: { messageKey: TranscriptMessageKey }) => {
  const presentation = useAppSelector((state) =>
    selectTranscriptMiddleMessagePresentation(state, messageKey),
  );
  return presentation == null ? null : <TranscriptMessageEntry presentation={presentation} />;
};

const MiddleTranscriptChunk = memo(({ chunkId }: { chunkId: string }) => {
  const chunk = useAppSelector((state) => selectTranscriptMessageChunk(state, chunkId));

  if (chunk == null) {
    return null;
  }

  return (
    <div className="committed-transcript-middle-chunk grid min-w-0 gap-3">
      {chunk.messageKeys.map((messageKey) => (
        <MiddleTranscriptMessage key={messageKey} messageKey={messageKey} />
      ))}
    </div>
  );
});

MiddleTranscriptChunk.displayName = "MiddleTranscriptChunk";

const MiddleTranscriptModule = ({ turnId }: { turnId: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));
  if (turn == null) {
    return null;
  }
  const hasFinalAnswer = turn.committedFinalMessageKeys.length > 0;
  const label = intermediateUpdatesLabel(turn.middleEntryCount);
  const shouldShowEntries = !hasFinalAnswer || isExpanded;

  if (turn.middleEntryCount === 0) {
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
              {turn.messageChunkIds.map((chunkId) => (
                <MiddleTranscriptChunk chunkId={chunkId} key={chunkId} />
              ))}
            </div>
          ) : null}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
};

const FinalMessage = ({ messageKey }: { messageKey: TranscriptMessageKey }) => {
  const presentation = useAppSelector((state) =>
    selectTranscriptMessagePresentation(state, messageKey),
  );
  return presentation == null ? null : <TranscriptMessageEntry presentation={presentation} />;
};

const FinalAssistantMessages = ({ turn }: { turn: NonNullable<ReturnType<typeof selectTranscriptTurn>> }) => (
  <>
    {turn.liveFinalMessageKeys.map((messageKey) => (
      <FinalMessage key={messageKey} messageKey={messageKey} />
    ))}
    {turn.committedFinalMessageKeys.map((messageKey) => (
      <FinalMessage key={messageKey} messageKey={messageKey} />
    ))}
  </>
);

const CommittedTranscriptTurn = memo(({ turnId }: { turnId: string }) => {
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));

  if (turn == null) {
    return null;
  }

  const hasEntries =
    turn.leadingPromptEntryKey != null ||
    turn.middleEntryCount > 0 ||
    turn.liveFinalMessageKeys.length > 0 ||
    turn.committedFinalMessageKeys.length > 0;

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
        <LeadingPromptEntry messageKey={turn.leadingPromptEntryKey} />
        <MiddleTranscriptModule turnId={turn.id} />
        <FinalAssistantMessages turn={turn} />
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
        (turn.leadingPromptEntryKey != null ||
          turn.middleEntryCount > 0 ||
          turn.liveFinalMessageKeys.length > 0 ||
          turn.committedFinalMessageKeys.length > 0)
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
