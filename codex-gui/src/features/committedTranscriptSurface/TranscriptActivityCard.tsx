import { Card } from "@heroui/react";
import { Plural, Trans } from "@lingui/react/macro";
import type { TranscriptEntry } from "@/features/transcriptState/transcriptStateSlice";

type TranscriptActivityEntry = Extract<TranscriptEntry, { type: "activity" }>;
type TranscriptActivityCopy = TranscriptActivityEntry["copy"];
type TranscriptActivityDetail = TranscriptActivityEntry["details"][number];
type TranscriptAgentStatusCopy = Extract<TranscriptActivityCopy, { kind: "agentStatus" }>;

const activityTitleId = (entry: TranscriptActivityEntry): string =>
  `transcript-activity-title-${encodeURIComponent(entry.turnId)}:${encodeURIComponent(entry.id)}`;

const AgentStatusValue = ({ copy }: { copy: TranscriptAgentStatusCopy }) => {
  const { message, status } = copy;
  switch (status) {
    case "pendingInit":
      return <Trans comment="Agent status while its runtime is initializing">Pending init</Trans>;
    case "running":
      return <Trans comment="Agent status while it is actively working">Running</Trans>;
    case "interrupted":
      return <Trans comment="Agent status after it was interrupted">Interrupted</Trans>;
    case "completed":
      return message == null ? (
        <Trans comment="Agent status after successful completion">Completed</Trans>
      ) : (
        <Trans comment="Agent completion status followed by an untranslated agent message">
          Completed - {message}
        </Trans>
      );
    case "errored":
      if (message == null) {
        return (
          <Trans comment="Agent error status when no backend error message is available">
            Error - Agent errored
          </Trans>
        );
      }
      return message.length === 0 ? (
        <Trans comment="Agent status after an error">Error</Trans>
      ) : (
        <Trans comment="Agent error status followed by an untranslated error message">
          Error - {message}
        </Trans>
      );
    case "shutdown":
      return <Trans comment="Agent status after it shut down">Shutdown</Trans>;
    case "notFound":
      return <Trans comment="Agent status when the requested agent thread was not found">Not found</Trans>;
  }

  status satisfies never;
  return null;
};

const AgentStatusText = ({ copy }: { copy: TranscriptAgentStatusCopy }) =>
  copy.receiver == null ? (
    <AgentStatusValue copy={copy} />
  ) : (
    <Trans comment="Agent status prefixed by an untranslated receiver thread identifier">
      {copy.receiver}: <AgentStatusValue copy={copy} />
    </Trans>
  );

const ActivityCopyText = ({ copy }: { copy: TranscriptActivityCopy }) => {
  switch (copy.kind) {
    case "agentStarted":
      return (
        <Trans comment="Activity title; agentPath is an untranslated agent path">
          Started {copy.agentPath}
        </Trans>
      );
    case "agentInteracted":
      return (
        <Trans comment="Activity title; agentPath is an untranslated agent path">
          Interacted with {copy.agentPath}
        </Trans>
      );
    case "agentInterrupted":
      return (
        <Trans comment="Activity title; agentPath is an untranslated agent path">
          Interrupted {copy.agentPath}
        </Trans>
      );
    case "agentSpawnFailed":
      return <Trans>Agent spawn failed</Trans>;
    case "agentSpawned": {
      const { model, reasoningEffort, receiver } = copy;
      if (model == null && reasoningEffort == null) {
        return (
          <Trans comment="Activity title; receiver is an untranslated agent thread identifier">
            Spawned {receiver}
          </Trans>
        );
      }
      if (model == null) {
        return (
          <Trans comment="Activity title; receiver and reasoningEffort are untranslated identifiers">
            Spawned {receiver} ({reasoningEffort})
          </Trans>
        );
      }
      if (reasoningEffort == null) {
        return (
          <Trans comment="Activity title; receiver and model are untranslated identifiers">
            Spawned {receiver} ({model})
          </Trans>
        );
      }
      return (
        <Trans comment="Activity title; receiver, model, and reasoningEffort are untranslated identifiers">
          Spawned {receiver} ({model} {reasoningEffort})
        </Trans>
      );
    }
    case "inputSent":
      return (
        <Trans comment="Activity title; receiver is an untranslated agent thread identifier">
          Sent input to {copy.receiver}
        </Trans>
      );
    case "agentResuming":
      return (
        <Trans comment="Activity title; receiver is an untranslated agent thread identifier">
          Resuming {copy.receiver}
        </Trans>
      );
    case "agentResumed":
      return (
        <Trans comment="Activity title; receiver is an untranslated agent thread identifier">
          Resumed {copy.receiver}
        </Trans>
      );
    case "agentsWaiting":
      if (copy.receiver != null) {
        return (
          <Trans comment="Activity title; receiver is an untranslated agent thread identifier">
            Waiting for {copy.receiver}
          </Trans>
        );
      }
      if (copy.receiverCount === 0) {
        return <Trans>Waiting for agents</Trans>;
      }
      return (
        <Plural
          comment="Activity title; count is the number of agent threads being awaited"
          one="Waiting for # agent"
          other="Waiting for # agents"
          value={copy.receiverCount}
        />
      );
    case "agentsFinishedWaiting":
      return <Trans>Finished waiting</Trans>;
    case "agentClosed":
      return (
        <Trans comment="Activity title; Closed is a verb and receiver is an untranslated agent thread identifier">
          Closed {copy.receiver}
        </Trans>
      );
    case "agentStatus":
      return <AgentStatusText copy={copy} />;
    case "agentResumeFailed":
      return <Trans>Error - Agent resume failed</Trans>;
    case "noAgentsCompletedYet":
      return <Trans>No agents completed yet</Trans>;
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
      className="committed-transcript-entry committed-transcript-entry-activity min-w-0"
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
