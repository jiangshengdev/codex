import { memo, useId, useState, type ReactNode } from "react";
import { Alert, Button, Card, Chip, Disclosure, Typography } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useAppSelector } from "@/app/hooks";
import { selectThreadRuntimeThreadId } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  transcriptEntryIdFor,
  type TranscriptEntryId,
  type TranscriptEntryView,
  type TranscriptMessageRendering,
  type TranscriptState,
  type TranscriptTurn,
} from "@/features/transcriptState/transcriptStateSlice";
import {
  selectTranscriptChunkFromTranscriptState,
  selectTranscriptEntryFromTranscriptState,
  selectTranscriptTurnFragmentFromTranscriptState,
  selectTranscriptTurnFromTranscriptState,
} from "@/features/transcriptState/transcriptStateSelectors";
import {
  CommittedTranscriptSurfaceRenderer,
  type CommittedTranscriptTurnFragmentRendererProps,
} from "./CommittedTranscriptSurfaceRenderer";
import { LiveMarkdownText } from "./LiveMarkdownText";
import { MarkdownText } from "./MarkdownText";
import {
  presentSubAgentActivityGroup,
  type SubAgentActivityGroupPresentation,
  type SubAgentActivityPresentationInput,
} from "./subAgentActivityPresentation";
import { useTranscriptSelector } from "./TranscriptReadContext";
import { TranscriptReadProvider } from "./TranscriptReadProvider";

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

type RenderedActivityDetail = {
  key: string;
  content: ReactNode;
};

const ActivityEntryRow = ({
  title,
  details,
}: {
  title: ReactNode;
  details: readonly RenderedActivityDetail[];
}) => {
  const titleId = useId();

  return (
    <article
      aria-labelledby={titleId}
      className="committed-transcript-entry committed-transcript-entry-activity grid min-w-0 gap-2"
    >
      <Card.Title
        className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm leading-6 font-normal"
        id={titleId}
      >
        {title}
      </Card.Title>
      {details.length > 0 ? (
        <Card.Description className="grid min-w-0 gap-1 pl-5">
          {details.map((detail) => (
            <span
              className="min-w-0 max-w-full whitespace-pre-wrap wrap-break-word"
              key={detail.key}
            >
              {detail.content}
            </span>
          ))}
        </Card.Description>
      ) : null}
    </article>
  );
};

type TranscriptActivityEntryView = Extract<
  TranscriptEntryView,
  { type: "collabAgent" | "subAgentActivity" }
>;

type TranscriptActivityCopy = TranscriptActivityEntryView["title"];

type TranscriptCollabAgentEntryView = Extract<TranscriptActivityEntryView, { type: "collabAgent" }>;

type TranscriptTextActivityCopy = TranscriptCollabAgentEntryView["title"];

const ActivityEntryRenderer = ({ entry }: { entry: TranscriptCollabAgentEntryView }) => {
  const { t } = useLingui();

  const agentStateText = (
    copy: Extract<TranscriptActivityCopy, { kind: "agentState" }>,
  ): string => {
    let stateText: string;
    switch (copy.status) {
      case "pendingInit":
        stateText = t({
          comment: "Status of a collaborating agent before initialization finishes",
          message: "Pending init",
        });
        break;
      case "running":
        stateText = t({
          comment: "Status of a collaborating agent that is currently working",
          message: "Running",
        });
        break;
      case "interrupted":
        stateText = t({
          comment: "Status of a collaborating agent whose work was interrupted",
          message: "Interrupted",
        });
        break;
      case "completed": {
        const messagePreview = copy.messagePreview;
        stateText =
          messagePreview == null || messagePreview.length === 0
            ? t({
                comment: "Status of a collaborating agent that completed its work",
                message: "Completed",
              })
            : t({
                comment:
                  "Status of a collaborating agent followed by its raw completion-message preview",
                message: `Completed - ${messagePreview}`,
              });
        break;
      }
      case "errored": {
        const messagePreview = copy.messagePreview;
        if (messagePreview == null) {
          stateText = t({
            comment: "Status of a collaborating agent that failed without an error preview",
            message: "Error - Agent errored",
          });
        } else {
          stateText =
            messagePreview.length === 0
              ? t({
                  comment: "Status of a collaborating agent that failed",
                  message: "Error",
                })
              : t({
                  comment:
                    "Status of a collaborating agent followed by its raw error-message preview",
                  message: `Error - ${messagePreview}`,
                });
        }
        break;
      }
      case "shutdown":
        stateText = t({
          comment: "Status of a collaborating agent that has shut down",
          message: "Shutdown",
        });
        break;
      case "notFound":
        stateText = t({
          comment: "Status indicating that a collaborating agent could not be found",
          message: "Not found",
        });
        break;
      default: {
        const exhaustiveStatus: never = copy.status;
        return exhaustiveStatus;
      }
    }

    const threadId = copy.threadId;
    if (threadId == null) {
      return stateText;
    }

    const agentState = stateText;
    return t({
      comment:
        "Activity detail showing a raw collaborating-agent thread ID followed by its translated status",
      message: `${threadId}: ${agentState}`,
    });
  };

  const copyText = (copy: TranscriptTextActivityCopy): string => {
    switch (copy.kind) {
      case "agentResuming": {
        const receiver = copy.receiver;
        return t({
          comment: "Collaboration activity resuming the agent identified by the raw receiver value",
          message: `Resuming ${receiver}`,
        });
      }
      case "agentsWaiting": {
        const receiver = copy.receiver;
        if (copy.receiverCount === 0) {
          return t`Waiting for agents`;
        }
        if (copy.receiverCount === 1 && receiver != null) {
          return t({
            comment:
              "Collaboration activity waiting for the agent identified by the raw receiver value",
            message: `Waiting for ${receiver}`,
          });
        }
        const receiverCount = copy.receiverCount;
        return t`Waiting for ${receiverCount} agents`;
      }
      case "agentSpawnFailed":
        return t({
          comment: "Status shown when creation of a collaborating agent fails",
          message: "Agent spawn failed",
        });
      case "agentSpawned": {
        const receiver = copy.receiver;
        const reasoningEffort = copy.reasoningEffort;
        if (copy.model == null || reasoningEffort == null) {
          return t({
            comment:
              "Collaboration activity showing the raw receiver value of a newly created agent",
            message: `Spawned ${receiver}`,
          });
        }

        const model = copy.model.trim();
        if (model.length > 0) {
          return t({
            comment:
              "Collaboration activity showing raw receiver, model, and reasoning-effort values for a newly created agent",
            message: `Spawned ${receiver} (${model} ${reasoningEffort})`,
          });
        }
        return reasoningEffort === "medium"
          ? t({
              comment:
                "Collaboration activity showing the raw receiver value of a newly created agent",
              message: `Spawned ${receiver}`,
            })
          : t({
              comment:
                "Collaboration activity showing raw receiver and reasoning-effort values for a newly created agent",
              message: `Spawned ${receiver} (${reasoningEffort})`,
            });
      }
      case "inputSent": {
        const receiver = copy.receiver;
        return t({
          comment:
            "Collaboration activity showing the raw receiver value of the agent that received input",
          message: `Sent input to ${receiver}`,
        });
      }
      case "agentResumed": {
        const receiver = copy.receiver;
        return t({
          comment: "Collaboration activity showing the raw receiver value of the resumed agent",
          message: `Resumed ${receiver}`,
        });
      }
      case "agentsFinishedWaiting":
        return t`Finished waiting`;
      case "agentClosed": {
        const receiver = copy.receiver;
        return t({
          comment: "Collaboration activity showing the raw receiver value of the closed agent",
          message: `Closed ${receiver}`,
        });
      }
      case "agentState":
        return agentStateText(copy);
      case "agentResumeFailed":
        return t({
          comment: "Status shown when resuming a collaborating agent fails",
          message: "Error - Agent resume failed",
        });
      case "noAgentsCompletedYet":
        return t({
          comment: "Status shown when waiting finishes before any collaborating agent completes",
          message: "No agents completed yet",
        });
      case "omitted": {
        const count = copy.count;
        return t`... and ${count} more`;
      }
    }

    const exhaustiveCopy: never = copy;
    return exhaustiveCopy;
  };

  const title = copyText(entry.title);
  const details = entry.details.map((detail, index): RenderedActivityDetail => {
    if (detail.kind === "raw") {
      return {
        key: `${String(index)}:raw:${detail.text}`,
        content: detail.text,
      };
    }

    const copy = detail.copy;
    return {
      key: `${String(index)}:copy:${copy.kind}`,
      content: copyText(copy),
    };
  });
  return <ActivityEntryRow details={details} title={title} />;
};

type TranscriptActivityEntryGroup = {
  type: "activity";
  entries: readonly [TranscriptActivityEntryView, ...TranscriptActivityEntryView[]];
};

type TranscriptSingletonEntryGroup = {
  type: "entry";
  entry: Exclude<TranscriptEntryView, TranscriptActivityEntryView>;
};

type TranscriptEntryRenderGroup = TranscriptActivityEntryGroup | TranscriptSingletonEntryGroup;

type TranscriptSubAgentActivityEntryView = Extract<
  TranscriptActivityEntryView,
  { type: "subAgentActivity" }
>;

type TranscriptActivityRow =
  | {
      type: "collabAgent";
      entry: Extract<TranscriptActivityEntryView, { type: "collabAgent" }>;
    }
  | {
      type: "subAgentActivity";
      kind: SubAgentActivityPresentationInput["title"]["kind"];
      identityKey: string;
      presentation: SubAgentActivityGroupPresentation;
    };

const subAgentActivityPresentationInput = (
  entry: TranscriptSubAgentActivityEntryView,
): SubAgentActivityPresentationInput => ({
  id: entry.id,
  turnId: entry.turnId,
  title: entry.title,
});

const groupActivityEntries = (
  entries: TranscriptActivityEntryGroup["entries"],
): TranscriptActivityRow[] => {
  const rows: TranscriptActivityRow[] = [];
  let pendingSubAgentActivities: SubAgentActivityPresentationInput[] = [];

  const flushSubAgentActivities = () => {
    const firstActivity = pendingSubAgentActivities[0];
    if (firstActivity == null) {
      return;
    }

    const presentation = presentSubAgentActivityGroup(pendingSubAgentActivities);
    const firstItem = presentation.items[0];
    if (firstItem == null) {
      throw new Error("Expected sub-agent activity presentation to contain an item");
    }
    rows.push({
      type: "subAgentActivity",
      kind: firstActivity.title.kind,
      identityKey: firstItem.identityKey,
      presentation,
    });
    pendingSubAgentActivities = [];
  };

  for (const entry of entries) {
    if (entry.type === "collabAgent") {
      flushSubAgentActivities();
      rows.push({ type: "collabAgent", entry });
      continue;
    }

    const activity = subAgentActivityPresentationInput(entry);
    if (
      pendingSubAgentActivities.length > 0 &&
      pendingSubAgentActivities[0]?.title.kind !== activity.title.kind
    ) {
      flushSubAgentActivities();
    }
    pendingSubAgentActivities.push(activity);
  }

  flushSubAgentActivities();
  return rows;
};

const SubAgentActivityChips = ({
  presentation,
}: {
  presentation: SubAgentActivityGroupPresentation;
}) => (
  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
    {presentation.items.map((item) => (
      <Chip color="default" key={item.identityKey} size="sm" variant="secondary">
        <Chip.Label className="block max-w-48 overflow-hidden text-ellipsis whitespace-nowrap">
          {item.label}
        </Chip.Label>
      </Chip>
    ))}
  </span>
);

const SubAgentOmittedCount = ({ omittedCount }: { omittedCount: number }) =>
  omittedCount === 0 ? null : (
    <Plural value={omittedCount} one="and # more sub-agent" other="and # more sub-agents" />
  );

const SubAgentActivityRow = ({
  kind,
  presentation,
}: {
  kind: Extract<TranscriptActivityRow, { type: "subAgentActivity" }>["kind"];
  presentation: SubAgentActivityGroupPresentation;
}) => {
  let title: ReactNode;
  switch (kind) {
    case "agentStarted":
      title = (
        <Trans comment="Activity showing sub-agents that started and any omitted count">
          Started <SubAgentActivityChips presentation={presentation} />{" "}
          <SubAgentOmittedCount omittedCount={presentation.omittedCount} />
        </Trans>
      );
      break;
    case "agentInteracted":
      title = (
        <Trans comment="Activity showing sub-agents that were contacted and any omitted count">
          Interacted with <SubAgentActivityChips presentation={presentation} />{" "}
          <SubAgentOmittedCount omittedCount={presentation.omittedCount} />
        </Trans>
      );
      break;
    case "agentInterrupted":
      title = (
        <Trans comment="Activity showing sub-agents that were interrupted and any omitted count">
          Interrupted <SubAgentActivityChips presentation={presentation} />{" "}
          <SubAgentOmittedCount omittedCount={presentation.omittedCount} />
        </Trans>
      );
      break;
    case "agentCompleted":
      title = (
        <Trans comment="Activity showing sub-agents that completed work and any omitted count">
          Completed <SubAgentActivityChips presentation={presentation} />{" "}
          <SubAgentOmittedCount omittedCount={presentation.omittedCount} />
        </Trans>
      );
      break;
  }

  return <ActivityEntryRow details={[]} title={title} />;
};

const groupTranscriptEntries = (
  entries: readonly TranscriptEntryView[],
): TranscriptEntryRenderGroup[] => {
  const groups: TranscriptEntryRenderGroup[] = [];
  let activityEntries: TranscriptActivityEntryView[] = [];

  const flushActivityEntries = () => {
    const firstEntry = activityEntries[0];
    if (firstEntry == null) {
      return;
    }

    groups.push({ type: "activity", entries: [firstEntry, ...activityEntries.slice(1)] });
    activityEntries = [];
  };

  for (const entry of entries) {
    switch (entry.type) {
      case "collabAgent":
      case "subAgentActivity":
        activityEntries.push(entry);
        break;
      case "message":
      case "reasoning":
      case "status":
        flushActivityEntries();
        groups.push({ type: "entry", entry });
        break;
      default: {
        const exhaustiveEntry: never = entry;
        return exhaustiveEntry;
      }
    }
  }

  flushActivityEntries();
  return groups;
};

const ActivityEntryGroup = ({ entries }: { entries: TranscriptActivityEntryGroup["entries"] }) => {
  const rows = groupActivityEntries(entries);
  return (
    <Card className="committed-transcript-activity-group min-w-0" variant="default">
      <Card.Content className="grid min-w-0 gap-2">
        {rows.map((row) =>
          row.type === "collabAgent" ? (
            <ActivityEntryRenderer
              entry={row.entry}
              key={transcriptEntryIdFor(row.entry.turnId, row.entry.id)}
            />
          ) : (
            <SubAgentActivityRow
              key={row.identityKey}
              kind={row.kind}
              presentation={row.presentation}
            />
          ),
        )}
      </Card.Content>
    </Card>
  );
};

const StatusEntryRenderer = ({
  status,
}: {
  status: Extract<TranscriptEntryView, { type: "status" }>["status"];
}) => {
  const { t } = useLingui();
  let text: string;
  switch (status) {
    case "interrupted":
      text = t({
        comment: "Status entry indicating that transcript processing was interrupted",
        message: "Interrupted.",
      });
      break;
    case "failed":
      text = t({
        comment: "Status entry indicating that transcript processing failed",
        message: "Failed.",
      });
      break;
    default: {
      const exhaustiveStatus: never = status;
      return exhaustiveStatus;
    }
  }

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
          {text}
        </Typography>
      </Card.Content>
    </Card>
  );
};

const ReasoningEntryRenderer = ({
  entry,
}: {
  entry: Extract<TranscriptEntryView, { type: "reasoning" }>;
}) => {
  switch (entry.lifecycle) {
    case "streaming":
      return (
        <Card
          className="committed-transcript-entry committed-transcript-entry-reasoning min-w-0"
          variant="default"
        >
          <Card.Content className="min-w-0">
            <Typography
              aria-atomic="true"
              aria-live="polite"
              className="min-w-0 max-w-full wrap-break-word leading-6"
              color="muted"
              role="status"
              type="body-sm"
            >
              {entry.title}
            </Typography>
          </Card.Content>
        </Card>
      );
    case "completed":
      return (
        <Card
          className="committed-transcript-entry committed-transcript-entry-reasoning min-w-0 text-sm text-muted italic"
          role="article"
          variant="default"
        >
          <Card.Content className="min-w-0">
            <MarkdownText source={entry.source} />
          </Card.Content>
        </Card>
      );
  }

  const exhaustiveEntry: never = entry;
  return exhaustiveEntry;
};

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
    case "reasoning":
      return <ReasoningEntryRenderer entry={entry} />;
    case "status":
      return <StatusEntryRenderer status={entry.status} />;
    case "collabAgent":
      return <ActivityEntryRenderer entry={entry} />;
    case "subAgentActivity": {
      const activity = subAgentActivityPresentationInput(entry);
      return (
        <SubAgentActivityRow
          kind={activity.title.kind}
          presentation={presentSubAgentActivityGroup([activity])}
        />
      );
    }
  }

  const exhaustiveEntry: never = entry;
  return exhaustiveEntry;
};

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

  const entryGroups = groupTranscriptEntries(chunk.entries);

  return (
    <div className="committed-transcript-middle-chunk grid min-w-0 gap-3">
      {entryGroups.map((group) => {
        switch (group.type) {
          case "activity": {
            const firstEntry = group.entries[0];
            return (
              <ActivityEntryGroup
                entries={group.entries}
                key={`activity-group:${transcriptEntryIdFor(firstEntry.turnId, firstEntry.id)}`}
              />
            );
          }
          case "entry":
            return (
              <TranscriptEntryRenderer
                entry={group.entry}
                key={transcriptEntryIdFor(group.entry.turnId, group.entry.id)}
              />
            );
        }

        const exhaustiveGroup: never = group;
        return exhaustiveGroup;
      })}
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

const CommittedTranscriptTurnFragment = memo(
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

export const CommittedTranscriptSurface = () => {
  const threadId = useAppSelector(selectThreadRuntimeThreadId);
  const surfaceKey = threadId ?? "no-thread";
  return (
    <TranscriptReadProvider transcriptState={null}>
      <CommittedTranscriptSurfaceRenderer
        key={surfaceKey}
        turnFragmentRenderer={CommittedTranscriptTurnFragment}
      />
    </TranscriptReadProvider>
  );
};

export const ReadOnlyCommittedTranscriptSurface = ({
  surfaceKey,
  transcriptState,
}: Readonly<{ surfaceKey: string; transcriptState: TranscriptState }>) => (
  <TranscriptReadProvider transcriptState={transcriptState}>
    <CommittedTranscriptSurfaceRenderer
      key={surfaceKey}
      turnFragmentRenderer={CommittedTranscriptTurnFragment}
    />
  </TranscriptReadProvider>
);
