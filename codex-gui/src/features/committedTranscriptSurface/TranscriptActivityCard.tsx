import { Card } from "@heroui/react";
import type { TranscriptEntry } from "@/features/transcriptState/transcriptStateSlice";

type TranscriptActivityEntry = Extract<TranscriptEntry, { type: "activity" }>;

const activityTitleId = (entry: TranscriptActivityEntry): string =>
  `transcript-activity-title-${encodeURIComponent(entry.turnId)}:${encodeURIComponent(entry.id)}`;

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
          {entry.title}
        </Card.Title>
        {entry.details.map((detail, index) => (
          <Card.Description
            className="min-w-0 max-w-full whitespace-pre-wrap wrap-break-word text-xs"
            key={`${entry.id}:${String(index)}`}
          >
            {detail}
          </Card.Description>
        ))}
      </Card.Header>
    </Card>
  );
};
