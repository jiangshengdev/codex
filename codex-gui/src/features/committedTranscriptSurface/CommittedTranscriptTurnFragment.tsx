import { memo, useState } from "react";
import { Alert, Button, Chip, Disclosure } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  transcriptEntryIdFor,
  type TranscriptEntryId,
  type TranscriptEntryView,
  type TranscriptTurn,
} from "@/features/transcriptState/transcriptStateSlice";
import {
  selectTranscriptChunkFromTranscriptState,
  selectTranscriptEntryFromTranscriptState,
  selectTranscriptTurnFragmentFromTranscriptState,
  selectTranscriptTurnFromTranscriptState,
} from "@/features/transcriptState/transcriptStateSelectors";
import type { CommittedTranscriptTurnFragmentRendererProps } from "./CommittedTranscriptSurfaceRenderer";
import { TranscriptEntryGroups, TranscriptEntryRenderer } from "./TranscriptEntryRenderer";
import { useTranscriptSelector } from "./TranscriptReadContext";

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
  const entry = useTranscriptSelector((state) =>
    entryId == null ? null : selectTranscriptEntryFromTranscriptState(state, entryId),
  );

  if (entry == null) {
    return null;
  }

  return <TranscriptEntryRenderer entry={entry} />;
};

const MiddleTranscriptChunk = memo(({ chunkId }: { chunkId: string }) => {
  const chunk = useTranscriptSelector((state) =>
    selectTranscriptChunkFromTranscriptState(state, chunkId),
  );

  if (chunk == null || chunk.entries.length === 0) {
    return null;
  }

  return (
    <div className="committed-transcript-middle-chunk grid min-w-0 gap-3">
      <TranscriptEntryGroups entries={chunk.entries} />
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
            comment="Disclosure label showing how many intermediate transcript updates it contains"
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

const FinalAssistantMessages = ({ entryIds }: { entryIds: TranscriptEntryId[] }) => {
  const entries = useTranscriptSelector(
    (state) =>
      entryIds.flatMap((entryId) => {
        const entry = selectTranscriptEntryFromTranscriptState(state, entryId);
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

const TurnErrorAlert = ({ error }: { error: NonNullable<TranscriptTurn["error"]> }) => (
  <Alert className="committed-transcript-turn-error min-w-0" role="alert" status="danger">
    <Alert.Indicator />
    <Alert.Content className="min-w-0">
      <Alert.Title>
        <Trans>Request failed</Trans>
      </Alert.Title>
      <Alert.Description className="min-w-0 max-w-full whitespace-pre-wrap wrap-break-word">
        {error.message}
      </Alert.Description>
    </Alert.Content>
  </Alert>
);

export const CommittedTranscriptTurnFragment = memo(
  ({ fragmentId, lastFragmentIdsByTurnId }: CommittedTranscriptTurnFragmentRendererProps) => {
    const { t } = useLingui();
    const fragment = useTranscriptSelector((state) =>
      selectTranscriptTurnFragmentFromTranscriptState(state, fragmentId),
    );
    const turn = useTranscriptSelector((state) =>
      fragment == null ? null : selectTranscriptTurnFromTranscriptState(state, fragment.turnId),
    );

    if (turn == null || fragment == null) {
      return null;
    }
    const isLastFragment = lastFragmentIdsByTurnId[fragment.turnId] === fragment.id;

    const hasEntries =
      fragment.leadingPromptEntryId != null ||
      fragment.middleEntryCount > 0 ||
      fragment.finalAssistantEntryIds.length > 0 ||
      (isLastFragment && turn.error != null);

    if (!hasEntries) {
      return null;
    }

    const turnStatusText = (status: TranscriptTurn["status"]): string => {
      switch (status) {
        case "completed":
          return t({
            comment: "Status chip for a completed turn",
            message: "Completed",
          });
        case "interrupted":
          return t({
            comment: "Status chip for an interrupted turn",
            message: "Interrupted",
          });
        case "failed":
          return t({
            comment: "Status chip for a failed turn",
            message: "Failed",
          });
        case "inProgress":
          return t({
            comment: "Status chip for a turn that is still in progress",
            message: "In progress",
          });
      }

      const exhaustiveStatus: never = status;
      return exhaustiveStatus;
    };

    const resolvedTurnId = turn.id;
    const turnLabel = t({
      comment: "Accessible label for a transcript turn identified by its raw turn ID",
      message: `Turn ${resolvedTurnId}`,
    });

    return (
      <article aria-label={turnLabel} className="committed-transcript-turn grid min-w-0 gap-3">
        {isLastFragment ? (
          <div className="committed-transcript-turn-metadata flex min-w-0 flex-wrap items-center gap-2">
            <Chip className="committed-transcript-turn-status" color="default" size="sm">
              {turnStatusText(turn.status)}
            </Chip>
          </div>
        ) : null}
        <div className="committed-transcript-chunk grid min-w-0 gap-3">
          <LeadingPromptEntry entryId={fragment.leadingPromptEntryId} />
          <MiddleTranscriptModule
            chunkIds={fragment.middleChunkIds}
            hasFinalAnswer={fragment.finalAssistantEntryIds.length > 0}
            middleEntryCount={fragment.middleEntryCount}
          />
          <FinalAssistantMessages entryIds={fragment.finalAssistantEntryIds} />
          {!isLastFragment || turn.error == null ? null : <TurnErrorAlert error={turn.error} />}
        </div>
      </article>
    );
  },
);

CommittedTranscriptTurnFragment.displayName = "CommittedTranscriptTurnFragment";
