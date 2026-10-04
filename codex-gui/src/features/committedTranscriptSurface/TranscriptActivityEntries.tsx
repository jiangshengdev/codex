import { useId, type ReactNode } from "react";
import { Card, Chip } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  transcriptEntryIdFor,
  type TranscriptEntryView,
} from "@/features/transcriptState/transcriptStateSlice";
import {
  presentSubAgentActivityGroup,
  subAgentActivityPresentationInput,
  type SubAgentActivityGroupPresentation,
  type SubAgentActivityPresentationInput,
} from "./subAgentActivityPresentation";

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

export const ActivityEntryRenderer = ({ entry }: { entry: TranscriptCollabAgentEntryView }) => {
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

export type TranscriptActivityEntryGroup = {
  type: "activity";
  entries: readonly [TranscriptActivityEntryView, ...TranscriptActivityEntryView[]];
};

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

export const SubAgentActivityRow = ({
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

export const ActivityEntryGroup = ({
  entries,
}: {
  entries: TranscriptActivityEntryGroup["entries"];
}) => {
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
