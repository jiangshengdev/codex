import { memo, useId, useState, type ReactNode } from "react";
import { Alert, Button, Card, Chip, Disclosure, Tag, TagGroup, Typography } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
  type TranscriptTurn,
} from "@/features/transcriptState/transcriptStateSlice";
import { LiveMarkdownText } from "./LiveMarkdownText";
import { MarkdownText } from "./MarkdownText";

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
      className="committed-transcript-entry committed-transcript-entry-activity grid min-w-0 gap-1"
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

type TranscriptTextActivityCopy = Exclude<
  TranscriptActivityCopy,
  { kind: "agentStarted" | "agentInteracted" | "agentInterrupted" }
>;

const AgentPathTag = ({ agentPath }: { agentPath: string }) => (
  <TagGroup aria-label={agentPath} selectionMode="none" size="sm" variant="default">
    <TagGroup.List>
      <Tag id={agentPath} textValue={agentPath}>
        {agentPath}
      </Tag>
    </TagGroup.List>
  </TagGroup>
);

const ActivityEntryRenderer = ({ entry }: { entry: TranscriptActivityEntryView }) => {
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

  const renderCopy = (copy: TranscriptActivityCopy): ReactNode => {
    switch (copy.kind) {
      case "agentStarted": {
        const agentPath = copy.agentPath;
        return (
          <Trans comment="Activity showing the raw path of a sub-agent that started">
            Started <AgentPathTag agentPath={agentPath} />
          </Trans>
        );
      }
      case "agentInteracted": {
        const agentPath = copy.agentPath;
        return (
          <Trans comment="Activity showing the raw path of a sub-agent that was contacted">
            Interacted with <AgentPathTag agentPath={agentPath} />
          </Trans>
        );
      }
      case "agentInterrupted": {
        const agentPath = copy.agentPath;
        return (
          <Trans comment="Activity showing the raw path of a sub-agent that was interrupted">
            Interrupted <AgentPathTag agentPath={agentPath} />
          </Trans>
        );
      }
      default:
        return copyText(copy);
    }
  };

  const title = renderCopy(entry.title);
  const details = entry.details.map((detail, index): RenderedActivityDetail => {
    if (detail.kind === "raw") {
      return {
        key: `${String(index)}:raw:${detail.text}`,
        content: detail.text,
      };
    }

    const copy = detail.copy;
    return {
      key:
        "agentPath" in copy
          ? `${String(index)}:copy:${copy.kind}:${copy.agentPath}`
          : `${String(index)}:copy:${copy.kind}`,
      content: renderCopy(copy),
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

const ActivityEntryGroup = ({ entries }: { entries: TranscriptActivityEntryGroup["entries"] }) => (
  <Card className="committed-transcript-activity-group min-w-0" variant="transparent">
    <Card.Content className="grid min-w-0 gap-1">
      {entries.map((entry) => (
        <ActivityEntryRenderer entry={entry} key={transcriptEntryIdFor(entry.turnId, entry.id)} />
      ))}
    </Card.Content>
  </Card>
);

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
      return <StatusEntryRenderer status={entry.status} />;
    case "collabAgent":
      return <ActivityEntryRenderer entry={entry} />;
    case "subAgentActivity":
      return <ActivityEntryRenderer entry={entry} />;
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
  const { t } = useLingui();
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
      <div className="committed-transcript-turn-metadata flex min-w-0 flex-wrap items-center gap-2">
        <Chip className="committed-transcript-turn-status" color="default" size="sm">
          {turnStatusText(turn.status)}
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
  const { t } = useLingui();
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
      aria-label={t({
        comment: "Accessible name for the region containing committed transcript turns",
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
                  <Trans>Connection interrupted. Reconnect required.</Trans>
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
              <Trans>No committed messages yet.</Trans>
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
