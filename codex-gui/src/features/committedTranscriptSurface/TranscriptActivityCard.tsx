import { Card } from "@heroui/react";
import { Plural, useLingui } from "@lingui/react/macro";
import type { TranscriptEntry } from "@/features/transcriptState/transcriptStateSlice";

type TranscriptActivityEntry = Extract<TranscriptEntry, { type: "activity" }>;
type TranscriptActivityCopy = TranscriptActivityEntry["copy"];
type TranscriptActivityDetail = TranscriptActivityEntry["details"][number];
type TranscriptAgentStatusCopy = Extract<TranscriptActivityCopy, { kind: "agentStatus" }>;

const activityTitleId = (entry: TranscriptActivityEntry): string =>
  `transcript-activity-title-${encodeURIComponent(entry.turnId)}:${encodeURIComponent(entry.id)}`;

const AgentStatusText = ({ copy }: { copy: TranscriptAgentStatusCopy }) => {
  const { t } = useLingui();
  const { message, receiver, status } = copy;
  let value: string;
  switch (status) {
    case "pendingInit":
      value = t`Pending init`;
      break;
    case "running":
      value = t`Running`;
      break;
    case "interrupted":
      value = t`Interrupted`;
      break;
    case "completed":
      value = message == null ? t`Completed` : t`Completed - ${message}`;
      break;
    case "errored":
      value =
        message == null
          ? t`Error - Agent errored`
          : message.length === 0
            ? t`Error`
            : t`Error - ${message}`;
      break;
    case "shutdown":
      value = t`Shutdown`;
      break;
    case "notFound":
      value = t`Not found`;
      break;
    default:
      status satisfies never;
      return null;
  }

  return receiver == null ? value : t`${receiver}: ${value}`;
};

const ActivityCopyText = ({ copy }: { copy: TranscriptActivityCopy }) => {
  const { t } = useLingui();
  const agentPath = "agentPath" in copy ? copy.agentPath : "";
  const receiver = "receiver" in copy ? copy.receiver : null;
  const receiverCount = copy.kind === "agentsWaiting" ? copy.receiverCount : 0;
  switch (copy.kind) {
    case "agentStarted":
      return t`Started ${agentPath}`;
    case "agentInteracted":
      return t`Interacted with ${agentPath}`;
    case "agentInterrupted":
      return t`Interrupted ${agentPath}`;
    case "agentSpawnFailed":
      return t`Agent spawn failed`;
    case "agentSpawned": {
      if (copy.model == null || copy.reasoningEffort == null) {
        return t`Spawned ${receiver}`;
      }

      const model = copy.model.trim();
      const reasoningEffort = copy.reasoningEffort.trim();
      if (model.length === 0 && reasoningEffort.length === 0) {
        return t`Spawned ${receiver}`;
      }
      if (model.length === 0) {
        return t`Spawned ${receiver} (${reasoningEffort})`;
      }
      if (reasoningEffort.length === 0) {
        return t`Spawned ${receiver} (${model})`;
      }
      return t`Spawned ${receiver} (${model} ${reasoningEffort})`;
    }
    case "inputSent":
      return t`Sent input to ${receiver}`;
    case "agentResuming":
      return t`Resuming ${receiver}`;
    case "agentResumed":
      return t`Resumed ${receiver}`;
    case "agentsWaiting":
      if (receiver != null) {
        return t`Waiting for ${receiver}`;
      }
      if (receiverCount === 0) {
        return t`Waiting for agents`;
      }
      return (
        <Plural
          comment="Activity title; count is the number of agent threads being awaited"
          one="Waiting for # agent"
          other="Waiting for # agents"
          value={receiverCount}
        />
      );
    case "agentsFinishedWaiting":
      return t`Finished waiting`;
    case "agentClosed":
      return t`Closed ${receiver}`;
    case "agentStatus":
      return <AgentStatusText copy={copy} />;
    case "agentResumeFailed":
      return t`Error - Agent resume failed`;
    case "noAgentsCompletedYet":
      return t`No agents completed yet`;
  }

  copy satisfies never;
  return null;
};

const ActivityDetailText = ({ detail }: { detail: TranscriptActivityDetail }) => {
  switch (detail.kind) {
    case "raw":
      return detail.text;
    case "copy":
      return <ActivityCopyText copy={detail.copy} />;
  }

  detail satisfies never;
  return null;
};

export const TranscriptActivityCard = ({ entry }: { entry: TranscriptActivityEntry }) => {
  const titleId = activityTitleId(entry);

  return (
    <Card
      aria-labelledby={titleId}
      className="committed-transcript-entry committed-transcript-entry-activity min-w-0 px-4 py-1"
      role="article"
      variant="transparent"
    >
      <Card.Header className="min-w-0 gap-1">
        <Card.Title className="min-w-0 max-w-full wrap-break-word text-sm" id={titleId}>
          <ActivityCopyText copy={entry.copy} />
        </Card.Title>
        {entry.details.map((detail, index) => (
          <Card.Description
            className="min-w-0 max-w-full whitespace-pre-wrap wrap-break-word text-xs"
            key={`${entry.id}:${String(index)}`}
          >
            <ActivityDetailText detail={detail} />
          </Card.Description>
        ))}
      </Card.Header>
    </Card>
  );
};
