import { Card, Typography } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  transcriptEntryIdFor,
  type TranscriptEntryView,
  type TranscriptMessageRendering,
} from "@/features/transcriptState/transcriptStateSlice";
import {
  ActivityEntryGroup,
  ActivityEntryRenderer,
  SubAgentActivityRow,
  type TranscriptActivityEntryGroup,
} from "./TranscriptActivityEntries";
import { LiveMarkdownText } from "./LiveMarkdownText";
import { MarkdownText } from "./MarkdownText";
import {
  presentSubAgentActivityGroup,
  subAgentActivityPresentationInput,
} from "./subAgentActivityPresentation";

type TranscriptActivityEntryView = TranscriptActivityEntryGroup["entries"][number];

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

export const TranscriptEntryRenderer = ({ entry }: { entry: TranscriptEntryView }) => {
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

export const TranscriptEntryGroups = ({ entries }: { entries: readonly TranscriptEntryView[] }) => {
  const entryGroups = groupTranscriptEntries(entries);

  return (
    <>
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
    </>
  );
};
