import { Alert, Chip, Separator, Surface } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Fragment, type ReactNode, type Ref } from "react";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import { FailureLayout } from "@/feedback/FailureLayout";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { ComposerPendingInputTrigger } from "./ComposerPendingInputDrawer";
import {
  hasPendingInputs,
  type ComposerPendingInputSession,
  type ComposerPendingInputSessionSnapshot,
} from "./composerPendingInputSession";

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
  pendingInputSession: ComposerPendingInputSession;
  pendingInputSnapshot: ComposerPendingInputSessionSnapshot;
  triggerRef: Ref<HTMLButtonElement>;
}>;

export function ComposerPendingInputRegion({
  canRecover,
  composerRole,
  mutationsEnabled,
  onRecover,
  recoveryDescriptionId,
  sessionRevision,
  snapshot,
  pendingInputSession,
  pendingInputSnapshot,
  triggerRef,
}: ComposerPendingInputRegionProps) {
  const { t } = useLingui();
  const groups: { key: string; node: ReactNode }[] = [];
  const showPendingTrigger = hasPendingInputs(snapshot) || pendingInputSnapshot.phase === "open";

  if (showPendingTrigger || snapshot.hasUnknownSteer) {
    groups.push({
      key: "normal",
      node: (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {showPendingTrigger ? (
            <ComposerPendingInputTrigger
              facts={{ composerRole, mutationsEnabled, sessionRevision, snapshot }}
              session={pendingInputSession}
              triggerRef={triggerRef}
            />
          ) : null}
          {snapshot.hasUnknownSteer ? (
            <Chip color="warning" size="sm" variant="soft" role="status">
              <Chip.Label>
                <Trans>Guide status unknown</Trans>
              </Chip.Label>
            </Chip>
          ) : null}
        </div>
      ),
    });
  }

  if (snapshot.recoveryCount > 0) {
    groups.push({
      key: "recovery",
      node: (
        <Alert status="warning" role="status">
          <Alert.Indicator />
          <FailureLayout
            actions={
              <RetryActionButton
                aria-describedby={recoveryDescriptionId}
                isDisabled={!canRecover}
                isPending={snapshot.isRecovering}
                pendingChildren={
                  <Trans comment="Pending state of Continue sending while recovering previously unsent messages">
                    Resuming sending
                  </Trans>
                }
                onPress={onRecover}
                size="sm"
                variant="primary"
              >
                <Trans>Continue sending</Trans>
              </RetryActionButton>
            }
          >
            <Alert.Content>
              <Alert.Title id={recoveryDescriptionId}>
                <Plural
                  value={snapshot.recoveryCount}
                  one="# message has not been sent"
                  other="# messages have not been sent"
                />
              </Alert.Title>
            </Alert.Content>
          </FailureLayout>
        </Alert>
      ),
    });
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <section aria-label={t`Pending messages`}>
      <Surface className="grid min-w-0 gap-3" variant="transparent">
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
