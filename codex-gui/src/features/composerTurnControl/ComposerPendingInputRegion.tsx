import { Button, Chip, Separator, Surface } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Fragment, type ReactNode, useCallback, useState } from "react";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import {
  ComposerInputPreviewContent,
  ComposerPendingInputDrawer,
} from "./ComposerPendingInputDrawer";

export type ComposerPendingInputRegionProps = Readonly<{
  canRecover: boolean;
  composerRole: ActiveThreadComposerRole;
  guardCompositionEndEnter: boolean;
  mutationsEnabled: boolean;
  onFocusComposer: () => void;
  onRecover: () => void;
  onRetrySkillCatalog: () => void;
  recoveryDescriptionId: string;
  sessionRevision: number;
  skillCatalog: SkillCatalogState;
  snapshot: ComposerInputQueueCoordinatorSnapshot;
}>;

export function ComposerPendingInputRegion({
  canRecover,
  composerRole,
  guardCompositionEndEnter,
  mutationsEnabled,
  onFocusComposer,
  onRecover,
  onRetrySkillCatalog,
  recoveryDescriptionId,
  sessionRevision,
  skillCatalog,
  snapshot,
}: ComposerPendingInputRegionProps) {
  const { t } = useLingui();
  const [isDrawerPresent, setIsDrawerPresent] = useState(false);
  const onDrawerPresenceChange = useCallback((isPresent: boolean): void => {
    setIsDrawerPresent(isPresent);
  }, []);
  const groups: { key: string; node: ReactNode }[] = [];
  const hasNormalPending = snapshot.guidingCount > 0 || snapshot.ordinaryQueuedCount > 0;

  if (hasNormalPending || isDrawerPresent) {
    groups.push({
      key: "normal",
      node: (
        <ComposerPendingInputDrawer
          composerRole={composerRole}
          guardCompositionEndEnter={guardCompositionEndEnter}
          mutationsEnabled={mutationsEnabled}
          onFocusComposer={onFocusComposer}
          onPresenceChange={onDrawerPresenceChange}
          onRetrySkillCatalog={onRetrySkillCatalog}
          sessionRevision={sessionRevision}
          skillCatalog={skillCatalog}
          snapshot={snapshot}
        />
      ),
    });
  }

  if (snapshot.hasUnknownSteer) {
    groups.push({
      key: "unknown-steer",
      node: (
        <p className="text-sm text-warning" role="status">
          <Trans>Guide status unknown</Trans>
        </p>
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
                <ComposerInputPreviewContent preview={item.preview} />
              </li>
            ))}
          </ul>
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
