import { Alert, AlertDialog, Button, Chip, Drawer, TextArea } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState, type Ref, type ReactNode } from "react";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ComposerEditorController } from "@/features/composerEditor/ComposerEditor";
import type {
  ComposerPendingInputDetailResult,
  ComposerPendingInputLane,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { ComposerPendingInputEditorAdapter } from "./ComposerPendingInputEditorAdapter";
import {
  ComposerPendingInputList,
  type ComposerPendingInputListPages,
} from "./ComposerPendingInputList";
import type {
  ComposerPendingInputAlert,
  ComposerPendingInputCurrentFacts,
  ComposerPendingInputSession,
  ComposerPendingInputSessionSnapshot,
} from "./composerPendingInputSession";

export type ComposerPendingInputDrawerProps = Readonly<{
  composerRole: ActiveThreadComposerRole;
  guardCompositionEndEnter: boolean;
  mutationsEnabled: boolean;
  onFocusComposer: () => void;
  onFocusTrigger: () => void;
  onRetrySkillCatalog: () => void;
  pendingInputSession: ComposerPendingInputSession;
  pendingInputSnapshot: ComposerPendingInputSessionSnapshot;
  sessionRevision: number;
  skillCatalog: SkillCatalogState;
  snapshot: ComposerInputQueueCoordinatorSnapshot;
  recoveryNotice?: ReactNode;
}>;

export function ComposerPendingInputDrawer({
  composerRole,
  guardCompositionEndEnter,
  mutationsEnabled,
  onFocusComposer,
  onFocusTrigger,
  onRetrySkillCatalog,
  pendingInputSession,
  pendingInputSnapshot,
  sessionRevision,
  skillCatalog,
  snapshot,
  recoveryNotice,
}: ComposerPendingInputDrawerProps) {
  const { t } = useLingui();
  const { guidingCount, ordinaryQueuedCount } = snapshot;
  const retainedRef = useRef<HTMLTextAreaElement | null>(null);
  const [copyStatus, setCopyStatus] = useState<{
    token: number;
    result: "copied" | "failed";
  } | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const editorControllerRef = useRef<Readonly<{
    preparationToken: number;
    controller: ComposerEditorController;
  }> | null>(null);
  const itemFocusTargetsRef = useRef(new Map<string, HTMLElement>());
  const laneHeadingRefs = useRef(new Map<ComposerPendingInputLane, HTMLHeadingElement>());
  const scheduledEffectIdsRef = useRef(new Set<number>());
  const adapterMountedRef = useRef(false);
  const presenceGenerationRef = useRef(pendingInputSnapshot.ownerGeneration);
  const facts: ComposerPendingInputCurrentFacts = {
    composerRole,
    sessionRevision,
    mutationsEnabled,
    snapshot,
  };
  const view = pendingInputSnapshot.view;
  const edit = view?.edit ?? null;
  const copyResult = copyStatus?.token === edit?.preparationToken ? copyStatus?.result : null;
  const visiblePages: ComposerPendingInputListPages | null =
    view?.pages == null ? null : { composerRole, ...view.pages };
  const displayedIsOpen = pendingInputSnapshot.phase === "open";
  const onDrawerPresenceRef = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element == null) {
        pendingInputSession.drawerPresenceEnded(presenceGenerationRef.current);
      }
    },
    [pendingInputSession],
  );

  useEffect(() => {
    presenceGenerationRef.current = pendingInputSnapshot.ownerGeneration;
  }, [pendingInputSnapshot.ownerGeneration]);

  useEffect(() => {
    adapterMountedRef.current = true;
    return () => {
      adapterMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    for (const effect of pendingInputSnapshot.effects) {
      if (scheduledEffectIdsRef.current.has(effect.id)) continue;
      scheduledEffectIdsRef.current.add(effect.id);
      queueMicrotask(() => {
        scheduledEffectIdsRef.current.delete(effect.id);
        if (!adapterMountedRef.current) return;
        const current = pendingInputSession.getSnapshot();
        if (current.ownerGeneration !== effect.ownerGeneration) {
          pendingInputSession.consumeEffect(effect.id);
          return;
        }
        const { target } = effect;
        if (target.type === "composer") {
          onFocusComposer();
        } else if (target.type === "trigger") {
          onFocusTrigger();
        } else if (target.type === "drawerHeading") {
          headingRef.current?.focus();
        } else if (target.type === "editor") {
          const attached = editorControllerRef.current;
          if (attached?.preparationToken === target.preparationToken) attached.controller.focus();
          else (retainedRef.current ?? headingRef.current)?.focus();
        } else if (target.type === "laneHeading") {
          (laneHeadingRefs.current.get(target.lane) ?? headingRef.current)?.focus();
        } else {
          const itemTarget = itemFocusTargetsRef.current.get(target.key);
          const laneTarget = laneHeadingRefs.current.get(target.fallbackLane);
          (itemTarget ?? laneTarget ?? headingRef.current)?.focus();
        }
        pendingInputSession.consumeEffect(effect.id);
      });
    }
  }, [onFocusComposer, onFocusTrigger, pendingInputSession, pendingInputSnapshot.effects]);

  const onOpenChange = (open: boolean): void => {
    if (open) pendingInputSession.open(facts);
    else pendingInputSession.requestClose(facts);
  };

  const beginEdit = (item: ComposerPendingInputPageItem): void => {
    pendingInputSession.beginEdit(facts, item);
  };

  const saveEdit = (): void => {
    if (edit == null) return;
    pendingInputSession.saveEdit(facts, edit.preparationToken);
  };

  const cancelEdit = (): void => {
    if (edit == null) return;
    pendingInputSession.cancelEdit(facts, edit.preparationToken);
  };

  const deleteItem = (item: ComposerPendingInputPageItem): boolean =>
    pendingInputSession.deleteItem(facts, item).type === "applied";

  const handleDetailFailure = (
    result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>,
  ): void => {
    pendingInputSession.detailFailed(facts, result);
  };

  const showMore = (lane: ComposerPendingInputLane): void => {
    pendingInputSession.showMore(facts, lane);
  };

  const moveItem = (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ): void => {
    pendingInputSession.moveItem(facts, item, destination);
  };

  const copyRetained = async (): Promise<void> => {
    if (edit?.phase !== "retained") return;
    try {
      await navigator.clipboard.writeText(edit.text);
      setCopyStatus({ token: edit.preparationToken, result: "copied" });
    } catch {
      setCopyStatus({ token: edit.preparationToken, result: "failed" });
    }
  };
  const movedPosition = pendingInputSnapshot.announcement?.position ?? 0;
  const movedCount = pendingInputSnapshot.announcement?.count ?? 0;

  return (
    <>
      <Drawer.Backdrop isOpen={displayedIsOpen} onOpenChange={onOpenChange}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <span ref={onDrawerPresenceRef} aria-hidden="true" hidden />
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading ref={headingRef} tabIndex={-1}>
                {edit == null || edit.phase === "preparing" ? (
                  <Trans>Pending details</Trans>
                ) : (
                  <Trans>Edit pending message</Trans>
                )}
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              {recoveryNotice}
              {pendingInputSnapshot.alert == null ? null : (
                <PendingManagementAlert alert={pendingInputSnapshot.alert} />
              )}
              {pendingInputSnapshot.announcement == null ? null : (
                <p aria-live="polite" role="status">
                  {pendingInputSnapshot.announcement.lane === "ordinary" ? (
                    <Trans>
                      Queued message moved to position {movedPosition} of {movedCount}.
                    </Trans>
                  ) : (
                    <Trans>
                      Guiding message moved to position {movedPosition} of {movedCount}.
                    </Trans>
                  )}
                </p>
              )}
              {edit == null || edit.phase === "preparing" ? (
                <ComposerPendingInputList
                  actionsDisabled={!pendingInputSnapshot.actionsEnabled}
                  deleteItem={deleteItem}
                  guidingCount={guidingCount}
                  onBeginEdit={beginEdit}
                  onDetailFailure={handleDetailFailure}
                  onMove={moveItem}
                  onShowMore={showMore}
                  ordinaryQueuedCount={ordinaryQueuedCount}
                  pages={visiblePages}
                  registerItemFocusTarget={(key, element) => {
                    if (element == null) itemFocusTargetsRef.current.delete(key);
                    else itemFocusTargetsRef.current.set(key, element);
                  }}
                  registerLaneHeading={(lane, element) => {
                    if (element == null) laneHeadingRefs.current.delete(lane);
                    else laneHeadingRefs.current.set(lane, element);
                  }}
                />
              ) : null}
              {edit?.phase === "retained" ? (
                <div className="grid gap-3">
                  <p>
                    <Trans>Your changes could not be saved. Copy them before discarding.</Trans>
                  </p>
                  <TextArea
                    ref={retainedRef}
                    aria-label={t`Unsaved pending message`}
                    readOnly
                    value={edit.text}
                    fullWidth
                  />
                  {copyResult == null ? null : (
                    <p role="status">
                      {copyResult === "copied" ? (
                        <Trans>Changes copied</Trans>
                      ) : (
                        <Trans>Copy failed. Select the text and copy it manually.</Trans>
                      )}
                    </p>
                  )}
                </div>
              ) : edit == null ? null : (
                <div hidden={edit.phase === "preparing"}>
                  <ComposerPendingInputEditorAdapter
                    controllerRef={editorControllerRef}
                    edit={edit}
                    facts={facts}
                    guardCompositionEndEnter={guardCompositionEndEnter}
                    onRetrySkillCatalog={onRetrySkillCatalog}
                    pendingInputSession={pendingInputSession}
                    skillCatalog={skillCatalog}
                  />
                </div>
              )}
            </Drawer.Body>
            {edit?.phase !== "active" ? null : (
              <Drawer.Footer>
                <Button onPress={cancelEdit} variant="secondary">
                  <Trans>Cancel</Trans>
                </Button>
                <Button isDisabled={!edit.valid} onPress={saveEdit} variant="primary">
                  <Trans>Save</Trans>
                </Button>
              </Drawer.Footer>
            )}
            {edit?.phase === "retained" ? (
              <Drawer.Footer>
                <Button
                  onPress={() => {
                    void copyRetained();
                  }}
                  variant="secondary"
                >
                  <Trans comment="Copy the unsaved pending-message edit to the clipboard">
                    Copy changes
                  </Trans>
                </Button>
                <Button
                  onPress={() => {
                    pendingInputSession.requestClose(facts);
                  }}
                  variant="danger"
                >
                  <Trans comment="Discard only the unsaved edit, not the original queued message">
                    Discard changes
                  </Trans>
                </Button>
              </Drawer.Footer>
            ) : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
      <AlertDialog.Backdrop isOpen={pendingInputSnapshot.confirmDiscard}>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>
                <Trans>Discard unsaved changes?</Trans>
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <Trans>
                Your changes have not been saved. Return to copy them, or discard them to continue.
              </Trans>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                autoFocus
                onPress={() => {
                  pendingInputSession.returnToEdit(facts);
                }}
                variant="secondary"
              >
                <Trans comment="Return to the pending-message edit without discarding it">
                  Return to edit
                </Trans>
              </Button>
              <Button
                onPress={() => {
                  pendingInputSession.discardEdit(facts);
                }}
                variant="danger"
              >
                <Trans comment="Discard only the unsaved edit, not the original queued message">
                  Discard changes
                </Trans>
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}

export function ComposerPendingInputTrigger({
  facts,
  session,
  triggerRef,
}: Readonly<{
  facts: ComposerPendingInputCurrentFacts;
  session: ComposerPendingInputSession;
  triggerRef: Ref<HTMLButtonElement>;
}>) {
  const { t } = useLingui();
  const { guidingCount, ordinaryQueuedCount } = facts.snapshot;
  const triggerLabel =
    guidingCount > 0 && ordinaryQueuedCount > 0
      ? t`Pending: Guide ${guidingCount}, Queued ${ordinaryQueuedCount}`
      : guidingCount > 0
        ? t`Pending: Guide ${guidingCount}`
        : t`Pending: Queued ${ordinaryQueuedCount}`;
  return (
    <Button
      ref={triggerRef}
      aria-label={triggerLabel}
      onPress={() => {
        session.open(facts);
      }}
      variant="secondary"
    >
      <Trans>Pending</Trans>
      {guidingCount > 0 ? (
        <Chip size="sm" variant="secondary">
          <Trans>Guide {guidingCount}</Trans>
        </Chip>
      ) : null}
      {ordinaryQueuedCount > 0 ? (
        <Chip size="sm" variant="tertiary">
          <Trans>Queued {ordinaryQueuedCount}</Trans>
        </Chip>
      ) : null}
    </Button>
  );
}

function PendingManagementAlert({ alert }: Readonly<{ alert: ComposerPendingInputAlert }>) {
  return (
    <Alert
      role="alert"
      status={alert === "empty" || alert === "invalidDraft" ? "danger" : "warning"}
    >
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {alert === "empty" ? (
            <Trans>Message cannot be empty</Trans>
          ) : alert === "moveNotApplied" || alert === "moveNotAppliedRefreshFailed" ? (
            <Trans>Pending message was not reordered</Trans>
          ) : alert === "moveRefreshFailed" ? (
            <Trans>Updated pending order could not be loaded</Trans>
          ) : (
            <Trans>Pending message changed</Trans>
          )}
        </Alert.Title>
        <Alert.Description>
          {alert === "invalidDraft" ? (
            <Trans>This pending message cannot be edited.</Trans>
          ) : alert === "moveNotApplied" ? (
            <Trans>The pending-message order did not change. Refresh complete; try again.</Trans>
          ) : alert === "moveNotAppliedRefreshFailed" ? (
            <Trans>
              The pending-message order did not change, and the refreshed order could not be loaded
              because the queue kept changing.
            </Trans>
          ) : alert === "moveRefreshFailed" ? (
            <Trans>
              The message was moved, but repeated queue changes prevented the updated order from
              loading.
            </Trans>
          ) : alert === "targetInvalidated" ? (
            <Trans>The target turn closed before the edit was saved.</Trans>
          ) : alert === "notManageable" ? (
            <Trans>
              This message has entered the sending process and can no longer be managed.
            </Trans>
          ) : alert === "empty" ? (
            <Trans>Enter a message before saving.</Trans>
          ) : alert === "sessionInvalidated" ? (
            <Trans>This editing session is no longer available.</Trans>
          ) : (
            <Trans>Refresh complete. Try the action again.</Trans>
          )}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
