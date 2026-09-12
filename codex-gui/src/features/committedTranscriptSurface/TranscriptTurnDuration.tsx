import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { TranscriptTurn } from "@/features/transcriptState/transcriptStateModel";
import { Separator, Typography } from "@heroui/react";

export const TranscriptTurnDuration = ({
  startedAt,
  durationMs,
  status,
}: Pick<TranscriptTurn, "startedAt" | "durationMs" | "status">) => {
  const { t } = useLingui();
  const [now, setNow] = useState(Date.now);
  const running = status === "inProgress";
  useEffect(() => {
    if (!running || startedAt == null) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [running, startedAt]);

  const elapsedMs = running
    ? startedAt == null
      ? null
      : Math.max(0, now - startedAt * 1000)
    : durationMs;
  if (elapsedMs == null) return null;

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const totalSeconds = String(elapsedSeconds);
  const hours = String(Math.floor(elapsedSeconds / 3600));
  const minutes = String(Math.floor(elapsedSeconds / 60) % 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  const paddedMinutes = minutes.padStart(2, "0");
  const duration =
    elapsedSeconds >= 3600
      ? t({
          comment: "Turn duration; subordinate minutes and seconds have two digits",
          message: `${hours}h ${paddedMinutes}m ${seconds}s`,
        })
      : elapsedSeconds >= 60
        ? t({
            comment: "Turn duration; seconds have two digits",
            message: `${minutes}m ${seconds}s`,
          })
        : t({ comment: "Turn duration in whole seconds", message: `${totalSeconds}s` });

  return (
    <>
      <Typography
        type="body-xs"
        color="muted"
        className="committed-transcript-turn-duration tabular-nums"
      >
        <time dateTime={`PT${totalSeconds}S`}>
          {running
            ? t({
                comment:
                  "Elapsed wall time below the first user input of a running turn, including waits",
                message: `Elapsed ${duration}`,
              })
            : t({
                comment:
                  "Final authoritative duration below the first user input of a finished turn",
                message: `Duration ${duration}`,
              })}
        </time>
      </Typography>
      <Separator orientation="horizontal" variant="tertiary" />
    </>
  );
};
