import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Typography } from "@heroui/react";

export const TranscriptTimeLabel = ({ startedAt }: { startedAt: number }) => {
  const { t, i18n } = useLingui();
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const timer = window.setTimeout(
      () => {
        setToday(new Date());
      },
      Math.max(0, midnight.getTime() - Date.now()),
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [today]);

  const date = new Date(startedAt * 1000);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const fullDate = new Intl.DateTimeFormat(i18n.locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  const label =
    date.toDateString() === today.toDateString()
      ? t({
          comment: "Transcript time label using today's actual local turn start time",
          message: `Today ${time}`,
        })
      : date.toDateString() === yesterday.toDateString()
        ? t({
            comment: "Transcript time label using yesterday's actual local turn start time",
            message: `Yesterday ${time}`,
          })
        : `${fullDate} ${time}`;
  return (
    <Typography
      type="body-xs"
      color="muted"
      align="center"
      className="committed-transcript-time-label tabular-nums"
    >
      <time dateTime={date.toISOString()}>{label}</time>
    </Typography>
  );
};
