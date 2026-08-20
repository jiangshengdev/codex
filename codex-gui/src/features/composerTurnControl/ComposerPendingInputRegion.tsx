import { Button, Chip, Separator, Surface } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Fragment, type ReactNode } from "react";
import type { ComposerInputPreview } from "@/features/composerInputQueue/composerInputPreview";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";

export type ComposerPendingInputRegionProps = Readonly<{
  canRecover: boolean;
  onRecover: () => void;
  recoveryDescriptionId: string;
  snapshot: ComposerInputQueueCoordinatorSnapshot;
}>;

export function ComposerPendingInputRegion({
  canRecover,
  onRecover,
  recoveryDescriptionId,
  snapshot,
}: ComposerPendingInputRegionProps) {
  const { t } = useLingui();
  const guideItems = [...snapshot.pendingSteers, ...snapshot.queuedSteers];
  const groups: { key: string; node: ReactNode }[] = [];

  if (guideItems.length > 0) {
    groups.push({
      key: "guiding",
      node: (
        <div className="grid min-w-0 gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              <Trans>Guiding</Trans>
            </h3>
            <Chip size="sm" variant="secondary">
              {guideItems.length}
            </Chip>
          </div>
          {snapshot.hasUnknownSteer ? (
            <p className="text-sm text-warning" role="status">
              <Trans>Guide status unknown</Trans>
            </p>
          ) : null}
          <ul className="grid min-w-0 gap-2">
            {guideItems.map((item) => (
              <li className="min-w-0" key={item.key}>
                <Preview preview={item.preview} />
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  if (snapshot.rejectedSteers.length > 0) {
    groups.push({
      key: "rejected",
      node: (
        <div className="grid min-w-0 gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              <Trans>Will send first</Trans>
            </h3>
            <Chip size="sm" variant="tertiary">
              {snapshot.rejectedSteers.length}
            </Chip>
          </div>
          <p className="text-sm text-warning" role="status">
            <Trans>Currently unable to guide; added to queue</Trans>
          </p>
          <ul className="grid min-w-0 gap-2">
            {snapshot.rejectedSteers.map((item) => (
              <li className="min-w-0" key={item.key}>
                <Preview preview={item.preview} />
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  if (snapshot.queuedCount > 0) {
    groups.push({
      key: "ordinary",
      node: (
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="tertiary">
            <Plural value={snapshot.queuedCount} one="# message queued" other="# messages queued" />
          </Chip>
        </div>
      ),
    });
  }

  if (snapshot.recoveryCount > 0) {
    groups.push({
      key: "recovery",
      node: (
        <div className="flex flex-wrap items-center gap-2">
          <span id={recoveryDescriptionId}>
            <Plural
              value={snapshot.recoveryCount}
              one="# message has not been sent"
              other="# messages have not been sent"
            />
          </span>
          <Button
            aria-describedby={recoveryDescriptionId}
            isDisabled={!canRecover}
            isPending={snapshot.isRecovering}
            onPress={onRecover}
            size="sm"
            variant="secondary"
          >
            <Trans>Continue sending</Trans>
          </Button>
        </div>
      ),
    });
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <section aria-label={t`Pending messages`}>
      <Surface className="grid min-w-0 gap-3 p-3" variant="secondary">
        {groups.map((group, index) => (
          <Fragment key={group.key}>
            {index === 0 ? null : <Separator variant="tertiary" />}
            {group.node}
          </Fragment>
        ))}
      </Surface>
    </section>
  );
}

function Preview({ preview }: Readonly<{ preview: ComposerInputPreview }>) {
  if (preview.type === "text") {
    return (
      <p className="min-w-0 line-clamp-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
        {preview.text}
      </p>
    );
  }

  const counts: ReactNode[] = [];
  if (preview.imageCount > 0) {
    counts.push(<Plural key="images" value={preview.imageCount} one="# image" other="# images" />);
  }
  if (preview.audioCount > 0) {
    counts.push(
      <Plural key="audio" value={preview.audioCount} one="# audio item" other="# audio items" />,
    );
  }
  if (preview.skillCount > 0) {
    counts.push(<Plural key="skills" value={preview.skillCount} one="# skill" other="# skills" />);
  }
  if (preview.mentionCount > 0) {
    counts.push(
      <Plural key="mentions" value={preview.mentionCount} one="# mention" other="# mentions" />,
    );
  }

  return (
    <p className="flex min-w-0 flex-wrap gap-x-2 text-sm [overflow-wrap:anywhere]">
      {counts.length === 0 ? <Trans>Structured input</Trans> : counts}
    </p>
  );
}
