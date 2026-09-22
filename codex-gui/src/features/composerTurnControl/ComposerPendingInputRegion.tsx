import { Button, Chip, Modal, Separator, Surface } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Fragment, type ReactNode, type Ref } from "react";
import { RetryActionButton } from "@/feedback/RetryActionButton";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { ComposerInputPreviewContent } from "./ComposerInputPreviewContent";
import { ComposerPendingInputTrigger } from "./ComposerPendingInputDrawer";
import type {
  ComposerPendingInputSession,
  ComposerPendingInputSessionSnapshot,
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
  const hasNormalPending = snapshot.guidingCount > 0 || snapshot.ordinaryQueuedCount > 0;

  if (hasNormalPending || pendingInputSnapshot.phase === "open") {
    groups.push({
      key: "normal",
      node: (
        <ComposerPendingInputTrigger
          facts={{ composerRole, mutationsEnabled, sessionRevision, snapshot }}
          session={pendingInputSession}
          triggerRef={triggerRef}
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
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">
              <Trans>Will send first</Trans>
            </h3>
            <Chip color="accent" size="sm" variant="soft">
              {snapshot.rejectedSteers.length}
            </Chip>
          </div>
          <p className="text-sm text-warning" role="status">
            <Trans>Currently unable to guide; added to queue</Trans>
          </p>
          <ul className="grid max-h-[min(30vh,240px)] min-w-0 gap-2 overflow-y-auto">
            {snapshot.rejectedSteers.map((item) => (
              <li className="flex min-w-0 flex-col gap-2" key={item.key}>
                <ComposerInputPreviewContent preview={item.preview} />
                {item.preview.type === "text" && item.preview.truncated ? (
                  <Modal>
                    <Button className="self-end" size="sm" variant="tertiary">
                      <Trans comment="Open a dialog containing the complete priority queued message">
                        View full message
                      </Trans>
                    </Button>
                    <Modal.Backdrop>
                      <Modal.Container scroll="inside" size="lg">
                        <Modal.Dialog>
                          <Modal.CloseTrigger />
                          <Modal.Header>
                            <Modal.Heading>
                              <Trans>Pending details</Trans>
                            </Modal.Heading>
                          </Modal.Header>
                          <Modal.Body>
                            <p className="min-w-0 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                              {item.text}
                            </p>
                          </Modal.Body>
                        </Modal.Dialog>
                      </Modal.Container>
                    </Modal.Backdrop>
                  </Modal>
                ) : null}
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
            variant="secondary"
          >
            <Trans>Continue sending</Trans>
          </RetryActionButton>
        </div>
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
