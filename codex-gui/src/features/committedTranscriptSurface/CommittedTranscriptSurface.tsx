import { memo, useState } from "react";
import { Alert, Button, Card, Chip, Disclosure, Typography } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
  type TranscriptTurn,
} from "@/features/transcriptState/transcriptStateSlice";
import { areTranscriptChunkViewsEqual } from "./committedTranscriptChunkEquality";
import { LiveMarkdownText } from "./LiveMarkdownText";
import { MarkdownText } from "./MarkdownText";
import { TranscriptActivityCard } from "./TranscriptActivityCard";

const isLiveAgentMessage = (item: TranscriptRenderableLiveItem): boolean =>
  item.initialItem.type === "agentMessage";

const TranscriptStatusText = ({
  status,
}: {
  status: Extract<TranscriptEntry, { type: "status" }>["status"];
}) => {
  switch (status) {
    case "interrupted":
      return <Trans comment="Terminal status shown as a transcript entry">Interrupted.</Trans>;
    case "failed":
      return <Trans comment="Terminal status shown as a transcript entry">Failed.</Trans>;
  }

  status satisfies never;
  return null;
};

const TurnStatusText = ({ status }: { status: TranscriptTurn["status"] }) => {
  switch (status) {
    case "completed":
      return <Trans comment="Status label for a completed chat turn">Completed</Trans>;
    case "inProgress":
      return <Trans comment="Status label for a chat turn still running">In progress</Trans>;
    case "interrupted":
      return <Trans comment="Status label for an interrupted chat turn">Interrupted</Trans>;
    case "failed":
      return <Trans comment="Status label for a failed chat turn">Failed</Trans>;
  }

  status satisfies never;
  return null;
};

const CommittedTranscriptEntry = ({ entry }: { entry: TranscriptEntry }) => {
  if (entry.type === "activity") {
    return <TranscriptActivityCard entry={entry} />;
  }

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
            {entry.type === "message" ? (
              entry.source
            ) : (
              <TranscriptStatusText status={entry.status} />
            )}
          </Typography>
        )}
      </Card.Content>
    </Card>
  );
};

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
          <Plural
            comment="Disclosure label; count is the number of intermediate transcript entries"
            one="Intermediate updates · # item"
            other="Intermediate updates · # items"
            value={middleEntryCount}
          />
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
  const { t } = useLingui();
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
  const dynamicTurnId = turn.id;

  return (
    <article
      aria-label={t({
        comment: "Accessible name for a chat turn; dynamicTurnId is an untranslated identifier",
        message: `Turn ${dynamicTurnId}`,
      })}
      className="committed-transcript-turn grid min-w-0 gap-3"
      data-turn-status={turn.status}
    >
      <div className="committed-transcript-turn-metadata flex min-w-0 flex-wrap items-center gap-2">
        <Chip className="committed-transcript-turn-status" color="default" size="sm">
          <TurnStatusText status={turn.status} />
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
  const { t } = useLingui();
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
      aria-label={t({
        comment: "Accessible name for the region containing committed chat history",
        message: "Committed transcript",
      })}
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
                <Alert.Title>
                  <Trans comment="Alert shown when transcript projection requires a manual reconnect">
                    Connection interrupted. Reconnect required.
                  </Trans>
                </Alert.Title>
              </Alert.Content>
            </Alert>
          ))}
        </div>
      ) : null}
      {!hasSurfaceContent ? (
        <Card className="committed-transcript-empty">
          <Card.Content>
            <Typography color="muted" type="body-sm">
              <Trans comment="Empty state for the committed chat history">
                No committed messages yet.
              </Trans>
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
