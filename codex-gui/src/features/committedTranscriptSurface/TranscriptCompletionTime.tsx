import { Typography } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { TranscriptTurn } from "@/features/transcriptState/transcriptStateModel";

export function TranscriptCompletionTime({ completedAt }: Pick<TranscriptTurn, "completedAt">) {
  const { i18n } = useLingui();
  if (completedAt == null) return null;
  const date = new Date(completedAt * 1000);
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return (
    <Typography type="body-xs" color="muted" className="tabular-nums">
      <time dateTime={date.toISOString()}>{time}</time>
    </Typography>
  );
}
