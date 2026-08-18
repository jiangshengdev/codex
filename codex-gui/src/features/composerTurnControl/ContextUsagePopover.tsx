import { Button, Popover, ProgressCircle } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ContextUsageModel } from "./contextUsageModel";

export type ContextUsagePopoverProps = Readonly<{
  usage: ContextUsageModel;
}>;

export function ContextUsagePopover({ usage }: ContextUsagePopoverProps) {
  const { t } = useLingui();
  const usedTokensLabel = usage.usedTokensCompact;
  const contextWindowLabel = usage.modelContextWindowCompact;
  const percentageLabel = usage.percentage == null ? null : `${String(usage.percentage)}%`;
  const accessibleLabel =
    percentageLabel == null || contextWindowLabel == null
      ? t`Context usage details, ${usedTokensLabel} tokens used, context window capacity unknown`
      : t`Context usage details, ${percentageLabel} used, ${usedTokensLabel} of ${contextWindowLabel} tokens`;

  return (
    <Popover>
      <Button aria-label={accessibleLabel} size="sm" variant="tertiary">
        <span aria-hidden="true">
          <ProgressCircle
            aria-label={t`Context usage`}
            color="default"
            isIndeterminate={percentageLabel == null}
            size="sm"
            value={usage.percentage ?? 0}
          >
            <ProgressCircle.Track>
              <ProgressCircle.TrackCircle />
              <ProgressCircle.FillCircle />
            </ProgressCircle.Track>
          </ProgressCircle>
        </span>
        <span>{usedTokensLabel}</span>
      </Button>
      <Popover.Content placement="top">
        <Popover.Dialog>
          <Popover.Heading>
            <Trans>Context usage</Trans>
          </Popover.Heading>
          <div className="grid gap-1">
            {percentageLabel == null || contextWindowLabel == null ? (
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
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
