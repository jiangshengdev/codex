import { useId } from "react";
import { Separator, Typography } from "@heroui/react";
import { Trans } from "@lingui/react/macro";

export const TranscriptContextBoundary = () => {
  const labelId = useId();

  return (
    <div
      aria-labelledby={labelId}
      className="committed-transcript-context-boundary grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 py-2"
      role="separator"
    >
      <Separator
        aria-hidden
        className="committed-transcript-context-boundary-line"
        variant="tertiary"
      />
      <Typography color="muted" id={labelId} type="body-sm">
        <Trans>Context compressed</Trans>
      </Typography>
      <Separator
        aria-hidden
        className="committed-transcript-context-boundary-line"
        variant="tertiary"
      />
    </div>
  );
};
