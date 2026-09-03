import { Button, Popover, ProgressCircle, Spinner } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ActiveThreadCompactionView } from "@/features/activeThreadSession/activeThreadSessionContracts";
import type { ContextUsageModel } from "./contextUsageModel";

export type ContextUsagePopoverProps = Readonly<{
  compaction: ActiveThreadCompactionView;
  onRequestCompaction: () => void;
  usage: ContextUsageModel | null;
}>;

export function ContextUsagePopover({
  compaction,
  onRequestCompaction,
  usage,
}: ContextUsagePopoverProps) {
  const { t } = useLingui();
  if (usage?.percentage == null) return null;

  const usedTokensLabel = usage.usedTokensCompact;
  const contextWindowLabel = usage.modelContextWindowCompact;
  const percentageLabel = `${String(usage.percentage)}%`;
  const accessibleLabel =
    contextWindowLabel == null
      ? t({
          comment: "Accessible name for context controls when capacity is unknown",
          message: `Context usage details, ${usedTokensLabel} tokens used, context window capacity unknown`,
        })
      : t({
          comment: "Accessible name for context controls with current token usage",
          message: `Context usage details, ${percentageLabel} used, ${usedTokensLabel} of ${contextWindowLabel} tokens`,
        });
  const isCompressing = compaction.phase !== "idle";
  const triggerLabel = isCompressing
    ? t({
        comment: "Accessible name for context controls while compression is active",
        message: "Context compression in progress",
      })
    : accessibleLabel;

  return (
    <Popover>
      <Button aria-label={triggerLabel} isIconOnly={!isCompressing} size="sm" variant="ghost">
        {isCompressing ? (
          <>
            <Spinner aria-hidden color="current" size="sm" />
            <Trans comment="Status shown while the current conversation context is compressed">
              Compressing
            </Trans>
          </>
        ) : (
          <span aria-hidden="true">
            <ProgressCircle
              aria-label={t({
                comment: "Accessible label for the context usage progress indicator",
                message: "Context usage",
              })}
              color="default"
              size="sm"
              value={usage.percentage}
            >
              <ProgressCircle.Track>
                <ProgressCircle.TrackCircle />
                <ProgressCircle.FillCircle />
              </ProgressCircle.Track>
            </ProgressCircle>
          </span>
        )}
      </Button>
      <Popover.Content placement="top">
        <Popover.Dialog>
          <Popover.Heading>
            <Trans comment="Heading for context usage and compression controls">
              Context usage
            </Trans>
          </Popover.Heading>
          <div className="mt-2 grid gap-1 text-sm text-muted">
            {contextWindowLabel == null ? (
              <p>
                <Trans>{usedTokensLabel} tokens used; context window capacity unknown</Trans>
              </p>
            ) : (
              <>
                <p>
                  <Trans>{percentageLabel} used</Trans>
                </p>
                <p>
                  <Trans>
                    {usedTokensLabel} tokens used of {contextWindowLabel}
                  </Trans>
                </p>
              </>
            )}
          </div>
          <div className="mt-3 grid gap-2">
            <Button
              isDisabled={!compaction.canRequest}
              isPending={isCompressing}
              onPress={onRequestCompaction}
              size="sm"
              variant="secondary"
            >
              {isCompressing ? (
                <>
                  <Spinner aria-hidden color="current" size="sm" />
                  <Trans comment="Status shown while the current conversation context is compressed">
                    Compressing
                  </Trans>
                </>
              ) : (
                <Trans comment="Button that starts compression for the current conversation context">
                  Compress context
                </Trans>
              )}
            </Button>
            {compaction.phase === "idle" && compaction.startFailure != null ? (
              <p className="text-sm text-danger" role="alert">
                <Trans>Context compression could not be started.</Trans>
              </p>
            ) : null}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
