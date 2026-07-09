import { memo, useState } from "react";
import { Alert, Button, Card, Chip, Disclosure, Typography } from "@heroui/react";
import { useAppSelector } from "@/app/hooks";
import {
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  type TranscriptEntry,
  type TranscriptRenderableLiveItem,
} from "@/features/transcriptState/transcriptStateSlice";
import { areTranscriptChunkViewsEqual } from "./committedTranscriptChunkEquality";
import { LiveMarkdownText } from "./LiveMarkdownText";
import { MarkdownText } from "./MarkdownText";

const subscriptionInterruptedStatusText = "Connection interrupted. Reconnect required.";

const isLiveAgentMessage = (item: TranscriptRenderableLiveItem): boolean =>
  item.initialItem.type === "agentMessage";

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

const areTranscriptEntryArraysEqual = (
  previous: TranscriptEntry[],
  next: TranscriptEntry[],
): boolean => {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((entry, index) => entry === next[index]);
};

const LeadingPromptEntry = ({ entryId }: { entryId: string | null }) => {
  const entry = useAppSelector((state) =>
    entryId == null ? null : selectTranscriptEntry(state, entryId),
  );

  if (entry == null) {
    return null;
  }

  return <CommittedTranscriptEntry entry={entry} />;
};

const MiddleTranscriptChunk = memo(({ chunkId }: { chunkId: string }) => {
  const chunk = useAppSelector(
    (state) => selectTranscriptChunk(state, chunkId),
    areTranscriptChunkViewsEqual,
  );

  if (chunk == null || chunk.entries.length === 0) {
    return null;
  }

  return (
    <div className="committed-transcript-middle-chunk grid min-w-0 gap-3">
      {chunk.entries.map((entry) => (
        <CommittedTranscriptEntry key={entry.id} entry={entry} />
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

const FinalAssistantMessages = ({ entryIds }: { entryIds: string[] }) => {
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
        <CommittedTranscriptEntry key={entry.id} entry={entry} />
      ))}
    </>
  );
};

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

const LiveAssistantMessages = ({
  liveItems,
}: {
  liveItems: readonly TranscriptRenderableLiveItem[];
}) => {
  const liveAssistantItems = liveItems.filter(isLiveAgentMessage);

  if (liveAssistantItems.length === 0) {
    return null;
  }

  return (
    <div className="committed-transcript-live-assistant-list grid min-w-0 gap-3">
      {liveAssistantItems.map((item) => (
        <LiveAssistantMessageEntry item={item} key={item.key} />
      ))}
    </div>
  );
};

const CommittedTranscriptTurn = memo(({ turnId }: { turnId: string }) => {
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));
  const liveItems = useAppSelector((state) => selectTranscriptLiveItemsForTurn(state, turnId));

  if (turn == null) {
    return null;
  }

  const hasLiveAssistantMessages = liveItems.some(isLiveAgentMessage);
  const hasEntries =
    turn.leadingPromptEntryId != null ||
    turn.middleChunkIds.length > 0 ||
    turn.finalAssistantEntryIds.length > 0 ||
    hasLiveAssistantMessages;

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
        <LiveAssistantMessages liveItems={liveItems} />
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
          turn.middleChunkIds.length > 0 ||
          turn.finalAssistantEntryIds.length > 0 ||
          selectTranscriptLiveItemsForTurn(state, turnId).some(isLiveAgentMessage))
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
