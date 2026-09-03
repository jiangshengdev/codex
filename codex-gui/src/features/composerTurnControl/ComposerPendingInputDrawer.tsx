import { Alert, Button, Chip, Drawer } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef } from "react";
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
  onRetrySkillCatalog: () => void;
  pendingInputSession: ComposerPendingInputSession;
  pendingInputSnapshot: ComposerPendingInputSessionSnapshot;
  sessionRevision: number;
  skillCatalog: SkillCatalogState;
  snapshot: ComposerInputQueueCoordinatorSnapshot;
}>;

export function ComposerPendingInputDrawer({
  composerRole,
  guardCompositionEndEnter,
  mutationsEnabled,
  onFocusComposer,
  onRetrySkillCatalog,
  pendingInputSession,
  pendingInputSnapshot,
  sessionRevision,
  skillCatalog,
  snapshot,
}: ComposerPendingInputDrawerProps) {
  const { t } = useLingui();
  const { guidingCount, ordinaryQueuedCount } = snapshot;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
  const hasPendingInputs = guidingCount > 0 || ordinaryQueuedCount > 0;
  const facts: ComposerPendingInputCurrentFacts = {
    composerRole,
    sessionRevision,
    mutationsEnabled,
    snapshot,
  };
  const view = pendingInputSnapshot.view;
  const edit = view?.edit ?? null;
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
          const trigger = triggerRef.current;
          if (trigger == null) onFocusComposer();
          else trigger.focus();
        } else if (target.type === "drawerHeading") {
          headingRef.current?.focus();
        } else if (target.type === "editor") {
          const attached = editorControllerRef.current;
          if (attached?.preparationToken === target.preparationToken) attached.controller.focus();
          else headingRef.current?.focus();
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
  }, [onFocusComposer, pendingInputSession, pendingInputSnapshot.effects]);

  const openDrawer = (): void => {
    pendingInputSession.open(facts);
  };

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

  const triggerLabel =
    guidingCount > 0 && ordinaryQueuedCount > 0
      ? t`Pending: Guide ${guidingCount}, Queued ${ordinaryQueuedCount}`
      : guidingCount > 0
        ? t`Pending: Guide ${guidingCount}`
        : t`Pending: Queued ${ordinaryQueuedCount}`;
  const renderTrigger =
    pendingInputSnapshot.phase !== "closing" && (hasPendingInputs || displayedIsOpen);
  const movedPosition = pendingInputSnapshot.announcement?.position ?? 0;
  const movedCount = pendingInputSnapshot.announcement?.count ?? 0;

  return (
    <>
      {renderTrigger ? (
        <Button ref={triggerRef} aria-label={triggerLabel} onPress={openDrawer} variant="secondary">
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
      ) : null}
      <Drawer.Backdrop isOpen={displayedIsOpen} onOpenChange={onOpenChange}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <span ref={onDrawerPresenceRef} aria-hidden="true" hidden />
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading ref={headingRef} tabIndex={-1}>
                {edit?.phase !== "active" ? (
                  <Trans>Pending details</Trans>
                ) : (
                  <Trans>Edit pending message</Trans>
                )}
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
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
              {edit?.phase !== "active" ? (
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
              {edit == null ? null : (
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
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
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
          ) : (
            <Trans>Refresh complete. Try the action again.</Trans>
          )}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
