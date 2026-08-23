import {
  Alert,
  Button,
  Chip,
  Disclosure,
  Drawer,
  Dropdown,
  Label,
  Separator,
} from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { ComposerEditorController } from "@/features/composerEditor/ComposerEditor";
import type {
  ComposerPendingInputDetailResult,
  ComposerPendingInputLane,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ComposerInputPreview } from "@/features/composerInputQueue/composerInputPreview";
import type {
  ComposerInputQueueCoordinator,
  ComposerInputQueueCoordinatorSnapshot,
  ComposerPendingInputCoordinatorEditReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { ComposerPendingInputEditor } from "./ComposerPendingInputEditor";
import {
  createComposerPendingInputLoadBudgets,
  readInitialComposerPendingInputPrefixes,
  refreshComposerPendingInputPrefixes,
  showMoreComposerPendingInputLane,
  type ComposerPendingInputLoadBudgets,
  type ComposerPendingInputPrefixes,
} from "./composerPendingInputPages";

type PendingInputPages = ComposerPendingInputPrefixes &
  Readonly<{
    controller: ComposerInputQueueCoordinator;
  }>;

type EditSession =
  | Readonly<{
      phase: "preparing";
      item: ComposerPendingInputPageItem;
      outcomeAtBegin: ComposerInputQueueCoordinatorSnapshot["pendingInputManagementOutcome"];
    }>
  | Readonly<{
      phase: "active";
      item: ComposerPendingInputPageItem;
      outcomeAtBegin: ComposerInputQueueCoordinatorSnapshot["pendingInputManagementOutcome"];
      reservation: ComposerPendingInputCoordinatorEditReservation;
    }>;

type OpenedOwner = Readonly<{
  controller: ComposerInputQueueCoordinator;
  threadId: string;
}>;

type DrawerAlert =
  | "empty"
  | "invalidDraft"
  | "moveNotApplied"
  | "moveNotAppliedRefreshFailed"
  | "moveRefreshFailed"
  | "notManageable"
  | "sessionInvalidated"
  | "stale"
  | "targetInvalidated";

type MoveAnnouncement = Readonly<{
  lane: ComposerPendingInputLane;
  position: number;
  count: number;
}>;

type ExhaustedMoveRefresh = Readonly<{
  controller: ComposerInputQueueCoordinator;
  throughRevision: number;
}>;

export type ComposerPendingInputDrawerProps = Readonly<{
  controller: ComposerInputQueueCoordinator | null;
  guardCompositionEndEnter: boolean;
  onFocusComposer: () => void;
  onPresenceChange: (isPresent: boolean) => void;
  onRetrySkillCatalog: () => void;
  skillCatalog: SkillCatalogState;
  snapshot: ComposerInputQueueCoordinatorSnapshot;
}>;

export function ComposerPendingInputDrawer({
  controller,
  guardCompositionEndEnter,
  onFocusComposer,
  onPresenceChange,
  onRetrySkillCatalog,
  skillCatalog,
  snapshot,
}: ComposerPendingInputDrawerProps) {
  const { t } = useLingui();
  const { detailRevision, guidingCount, ordinaryQueuedCount, pendingInputManagementOutcome } =
    snapshot;
  const [isOpen, setIsOpen] = useState(false);
  const [openedOwner, setOpenedOwner] = useState<OpenedOwner | null>(null);
  const [closingSession, setClosingSession] = useState<OpenedOwner | null>(null);
  const [pages, setPages] = useState<PendingInputPages | null>(null);
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [alert, setAlert] = useState<DrawerAlert | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState<MoveAnnouncement | null>(null);
  const [exhaustedMoveRefresh, setExhaustedMoveRefresh] =
    useState<ExhaustedMoveRefresh | null>(null);
  const [managementCompletionHold, setManagementCompletionHold] = useState(false);
  const [editorValid, setEditorValid] = useState(true);
  const focusAfterCloseRef = useRef<"composer" | "trigger" | null>(null);
  const managementCompletionPendingRef = useRef(false);
  const preparingEditRef = useRef<Extract<EditSession, { phase: "preparing" }> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const pendingEditorControllerRef = useRef<ComposerEditorController | null>(null);
  const itemFocusTargetsRef = useRef(new Map<string, HTMLElement>());
  const laneHeadingRefs = useRef(new Map<ComposerPendingInputLane, HTMLHeadingElement>());
  const hasPendingInputs = controller != null && (guidingCount > 0 || ordinaryQueuedCount > 0);
  const ownerMatches =
    openedOwner == null ||
    (controller === openedOwner.controller && controller.ownerThreadId === openedOwner.threadId);
  const matchingManagementOutcome =
    isOpen &&
    editSession != null &&
    pendingInputManagementOutcome != null &&
    pendingInputManagementOutcome !== editSession.outcomeAtBegin &&
    pendingInputManagementOutcome.key === editSession.item.key;
  const displayedEditSession = matchingManagementOutcome ? null : editSession;
  const displayedAlert = matchingManagementOutcome ? "targetInvalidated" : alert;
  const completionHold = managementCompletionHold || matchingManagementOutcome;
  const moveRefreshIsSuppressed =
    exhaustedMoveRefresh?.controller === controller &&
    detailRevision <= exhaustedMoveRefresh.throughRevision;
  const projectedPages =
    isOpen && ownerMatches && controller != null
      ? moveRefreshIsSuppressed
        ? null
        : pages?.controller === controller && pages.revision === detailRevision
          ? pages
          : readInitialPages(controller, detailRevision)
      : null;
  const pagesUnavailable =
    isOpen &&
    ownerMatches &&
    controller != null &&
    !moveRefreshIsSuppressed &&
    projectedPages == null;
  const shouldCloseExternally =
    isOpen &&
    (!ownerMatches ||
      controller == null ||
      pagesUnavailable ||
      (!matchingManagementOutcome && !completionHold && !hasPendingInputs));
  const sessionIsClosing = openedOwner != null && closingSession === openedOwner;
  if (shouldCloseExternally && openedOwner != null && !sessionIsClosing) {
    setClosingSession(openedOwner);
  }
  const externallyClosed = shouldCloseExternally || sessionIsClosing;
  const displayedIsOpen = isOpen && !externallyClosed;
  const visiblePages = displayedIsOpen ? projectedPages : null;

  const closeInvalidDrawer = useCallback((): void => {
    focusAfterCloseRef.current = "composer";
    onPresenceChange(true);
    setIsOpen(false);
    setPages(null);
    preparingEditRef.current = null;
    setEditSession(null);
    setAlert(null);
    setMoveAnnouncement(null);
    setExhaustedMoveRefresh(null);
    setManagementCompletionHold(false);
  }, [onPresenceChange]);

  const focusHeading = useCallback((): void => {
    queueMicrotask(() => headingRef.current?.focus());
  }, []);

  const runManagementCompletion = <Result,>(operation: () => Result): Result => {
    managementCompletionPendingRef.current = true;
    try {
      return operation();
    } finally {
      managementCompletionPendingRef.current = false;
    }
  };

  const refreshPages = useCallback(
    (
      revision: number,
      budgets: ComposerPendingInputLoadBudgets =
        pages?.controller === controller
          ? pages.budgets
          : createComposerPendingInputLoadBudgets(),
    ): PendingInputPages | null => {
      if (controller == null) return null;
      const result = refreshComposerPendingInputPrefixes(controller, revision, budgets);
      if (result.type === "unavailable") {
        closeInvalidDrawer();
        return null;
      }
      const nextPrefixes = result.type === "ready" ? result.prefixes : result.fallback;
      if (nextPrefixes == null) return null;
      const nextPages = { controller, ...nextPrefixes };
      setExhaustedMoveRefresh(null);
      setPages(nextPages);
      return nextPages;
    },
    [closeInvalidDrawer, controller, pages],
  );

  const closeAfterExplicitRequest = useCallback((): void => {
    if (hasPendingInputs) {
      focusAfterCloseRef.current = "trigger";
      onPresenceChange(false);
    } else {
      focusAfterCloseRef.current = "composer";
      onPresenceChange(true);
    }
    setExhaustedMoveRefresh(null);
    setIsOpen(false);
  }, [hasPendingInputs, onPresenceChange]);

  const handleLiveFailure = useCallback(
    (nextAlert: Exclude<DrawerAlert, "empty">, revision: number): void => {
      setManagementCompletionHold(true);
      preparingEditRef.current = null;
      setEditSession(null);
      setAlert(nextAlert);
      setMoveAnnouncement(null);
      refreshPages(revision);
      focusHeading();
    },
    [focusHeading, refreshPages],
  );

  const settleResult = useCallback(
    (
      result:
        | ReturnType<ComposerPendingInputCoordinatorEditReservation["save"]>
        | ReturnType<ComposerPendingInputCoordinatorEditReservation["cancel"]>,
      closeAfterSettlement: boolean,
      focusKey: string,
    ): boolean => {
      if (result.type === "unavailable") {
        if (result.scope === "ownerGone") {
          closeInvalidDrawer();
          return false;
        }
        handleLiveFailure(
          result.reason === "targetInvalidated" ? "targetInvalidated" : "sessionInvalidated",
          result.revision,
        );
        return false;
      }
      if (result.type === "invalidInput") {
        setAlert("empty");
        return false;
      }
      preparingEditRef.current = null;
      setEditSession(null);
      setAlert(null);
      setMoveAnnouncement(null);
      if (closeAfterSettlement) {
        closeAfterExplicitRequest();
      } else {
        const nextPages = refreshPages(result.revision);
        setManagementCompletionHold(nextPages != null && pendingInputPagesAreEmpty(nextPages));
        queueMicrotask(() => {
          const focusTarget = itemFocusTargetsRef.current.get(focusKey);
          if (focusTarget == null) focusHeading();
          else focusTarget.focus();
        });
      }
      return true;
    },
    [closeAfterExplicitRequest, closeInvalidDrawer, focusHeading, handleLiveFailure, refreshPages],
  );

  const cancelEdit = useCallback(
    (closeAfterSettlement: boolean): boolean => {
      if (displayedEditSession?.phase !== "active") return false;
      const result = closeAfterSettlement
        ? displayedEditSession.reservation.cancel()
        : runManagementCompletion(displayedEditSession.reservation.cancel);
      return settleResult(result, closeAfterSettlement, displayedEditSession.item.key);
    },
    [displayedEditSession, settleResult],
  );

  const requestClose = useCallback((): void => {
    if (displayedEditSession?.phase === "active" && !cancelEdit(true)) return;
    if (displayedEditSession?.phase === "preparing") {
      preparingEditRef.current = null;
      setEditSession(null);
    }
    if (displayedEditSession?.phase !== "active") closeAfterExplicitRequest();
  }, [cancelEdit, closeAfterExplicitRequest, displayedEditSession]);

  const onDrawerPresenceRef = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element != null) return;
      const focusTarget = focusAfterCloseRef.current;
      if (focusTarget == null && triggerRef.current != null) return;
      focusAfterCloseRef.current = null;
      setIsOpen(false);
      setOpenedOwner(null);
      setClosingSession(null);
      setPages(null);
      preparingEditRef.current = null;
      setEditSession(null);
      setAlert(null);
      setMoveAnnouncement(null);
      setExhaustedMoveRefresh(null);
      setManagementCompletionHold(false);
      onPresenceChange(false);
      queueMicrotask(() => {
        const trigger = triggerRef.current;
        if (focusTarget === "trigger" && trigger != null) {
          trigger.focus();
        } else {
          onFocusComposer();
        }
      });
    },
    [onFocusComposer, onPresenceChange],
  );

  useEffect(() => {
    if (!isOpen || openedOwner == null || controller == null) return;
    return controller.subscribe(() => {
      const nextSnapshot = controller.getSnapshot();
      const nextOutcome = nextSnapshot.pendingInputManagementOutcome;
      const nextOutcomeMatches =
        editSession != null &&
        nextOutcome != null &&
        nextOutcome !== editSession.outcomeAtBegin &&
        nextOutcome.key === editSession.item.key;
      const nextOwnerMatches =
        controller === openedOwner.controller && controller.ownerThreadId === openedOwner.threadId;
      const nextHasPendingInputs =
        nextSnapshot.guidingCount > 0 || nextSnapshot.ordinaryQueuedCount > 0;
      if (
        !nextOwnerMatches ||
        (!nextOutcomeMatches &&
          !completionHold &&
          !managementCompletionPendingRef.current &&
          !nextHasPendingInputs)
      ) {
        if (!nextOwnerMatches) setExhaustedMoveRefresh(null);
        setClosingSession((current) => current ?? openedOwner);
      }
    });
  }, [completionHold, controller, editSession, isOpen, openedOwner]);

  useEffect(() => {
    if (matchingManagementOutcome) headingRef.current?.focus();
  }, [matchingManagementOutcome, pendingInputManagementOutcome]);

  useEffect(() => {
    if (
      exhaustedMoveRefresh != null &&
      (controller !== exhaustedMoveRefresh.controller ||
        detailRevision > exhaustedMoveRefresh.throughRevision)
    ) {
      setExhaustedMoveRefresh(null);
    }
  }, [controller, detailRevision, exhaustedMoveRefresh]);

  const openDrawer = (): void => {
    if (!hasPendingInputs) return;
    const nextPages = readInitialPages(controller, detailRevision);
    if (nextPages == null) return;
    setOpenedOwner({ controller, threadId: controller.ownerThreadId });
    setClosingSession(null);
    setPages(nextPages);
    preparingEditRef.current = null;
    setEditSession(null);
    setAlert(null);
    setMoveAnnouncement(null);
    setExhaustedMoveRefresh(null);
    setManagementCompletionHold(false);
    focusAfterCloseRef.current = null;
    onPresenceChange(true);
    setIsOpen(true);
  };

  const onOpenChange = (open: boolean): void => {
    if (open) {
      onPresenceChange(true);
      setIsOpen(true);
    } else {
      requestClose();
    }
  };

  const beginEdit = (item: ComposerPendingInputPageItem): void => {
    if (displayedEditSession != null || preparingEditRef.current != null) return;
    const preparingSession: Extract<EditSession, { phase: "preparing" }> = {
      phase: "preparing",
      item,
      outcomeAtBegin: pendingInputManagementOutcome,
    };
    preparingEditRef.current = preparingSession;
    setAlert(null);
    setMoveAnnouncement(null);
    setEditorValid(true);
    setEditSession(preparingSession);
  };

  const onEditorControllerChange = (editor: ComposerEditorController | null): void => {
    pendingEditorControllerRef.current = editor;
    if (editor == null) {
      preparingEditRef.current = null;
      return;
    }
    const currentEditSession = preparingEditRef.current;
    if (currentEditSession == null || controller == null) return;
    const result = controller.beginPendingInputEdit(
      { key: currentEditSession.item.key, revision: visiblePages?.revision ?? detailRevision },
      editor.restore,
    );
    if (result.type === "begun") {
      const activeSession: EditSession = {
        phase: "active",
        item: currentEditSession.item,
        outcomeAtBegin: currentEditSession.outcomeAtBegin,
        reservation: result.reservation,
      };
      preparingEditRef.current = null;
      setEditSession(activeSession);
      setExhaustedMoveRefresh(null);
      setPages((current) =>
        current == null ? current : { ...current, revision: result.revision },
      );
      queueMicrotask(() => {
        editor.focus();
      });
      return;
    }
    if (result.type === "unavailable" && result.scope === "ownerGone") {
      closeInvalidDrawer();
      return;
    }
    const nextAlert: Exclude<DrawerAlert, "empty"> =
      result.type === "stale"
        ? "stale"
        : result.type === "notManageable"
          ? "notManageable"
          : result.type === "invalidDraft"
            ? "invalidDraft"
            : "sessionInvalidated";
    handleLiveFailure(nextAlert, result.revision);
  };

  const saveEdit = (): void => {
    if (displayedEditSession?.phase !== "active" || pendingEditorControllerRef.current == null)
      return;
    const capture = pendingEditorControllerRef.current.capture();
    const result = runManagementCompletion(() => displayedEditSession.reservation.save(capture));
    settleResult(result, false, displayedEditSession.item.key);
  };

  const deleteItem = (item: ComposerPendingInputPageItem): boolean => {
    if (controller == null || visiblePages == null) return false;
    setMoveAnnouncement(null);
    const visibleKeys = visiblePages[item.lane].items.map(({ key }) => key);
    const deletedIndex = visibleKeys.indexOf(item.key);
    const focusKey =
      visibleKeys[deletedIndex + 1] ?? (deletedIndex > 0 ? visibleKeys[deletedIndex - 1] : null);
    const result = runManagementCompletion(() =>
      controller.deletePendingInput({
        key: item.key,
        revision: visiblePages.revision,
      }),
    );
    if (result.type === "deleted") {
      setAlert(null);
      const nextPages = refreshPages(result.revision);
      setManagementCompletionHold(nextPages != null && pendingInputPagesAreEmpty(nextPages));
      queueMicrotask(() => {
        const itemTarget = focusKey == null ? null : itemFocusTargetsRef.current.get(focusKey);
        const laneHeading = laneHeadingRefs.current.get(item.lane);
        if (itemTarget != null) itemTarget.focus();
        else if (laneHeading != null) laneHeading.focus();
        else focusHeading();
      });
      return true;
    }
    if (result.type === "unavailable" && result.scope === "ownerGone") {
      closeInvalidDrawer();
      return false;
    }
    handleLiveFailure(
      result.type === "stale"
        ? "stale"
        : result.type === "notManageable"
          ? "notManageable"
          : "sessionInvalidated",
      result.revision,
    );
    return false;
  };

  const handleDetailFailure = (
    result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>,
  ): void => {
    if (result.type === "missing") return;
    if (result.type === "unavailable") {
      closeInvalidDrawer();
    } else {
      handleLiveFailure("stale", result.revision);
    }
  };

  const showMore = (lane: ComposerPendingInputLane): void => {
    if (visiblePages == null) return;
    const result = showMoreComposerPendingInputLane(
      visiblePages.controller,
      visiblePages,
      lane,
    );
    if (result.type === "unavailable") {
      closeInvalidDrawer();
      return;
    }
    if (result.type === "stale") {
      handleLiveFailure("stale", result.revision);
      return;
    }
    setExhaustedMoveRefresh(null);
    setPages({ controller: visiblePages.controller, ...result.prefixes });
  };

  const moveItem = (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ): void => {
    if (controller == null || visiblePages == null) return;
    setMoveAnnouncement(null);
    const budgets = visiblePages.budgets;
    const result = runManagementCompletion(() =>
      controller.movePendingInput({ key: item.key, revision: visiblePages.revision, destination }),
    );
    if (result.type === "noOp") return;
    if (result.type === "unavailable" && result.scope === "ownerGone") {
      closeInvalidDrawer();
      return;
    }

    const revision = result.revision;
    const refreshed = refreshComposerPendingInputPrefixes(controller, revision, budgets);
    if (refreshed.type === "unavailable") {
      closeInvalidDrawer();
      return;
    }
    const nextPrefixes =
      refreshed.type === "ready" ? refreshed.prefixes : refreshed.fallback;
    if (nextPrefixes != null) {
      setExhaustedMoveRefresh(null);
      setPages({ controller, ...nextPrefixes });
    } else if (refreshed.type === "stale") {
      setExhaustedMoveRefresh({ controller, throughRevision: refreshed.revision });
    }

    if (result.type !== "moved") {
      setManagementCompletionHold(true);
      setAlert(
        refreshed.type === "ready" ? "moveNotApplied" : "moveNotAppliedRefreshFailed",
      );
      focusHeading();
      return;
    }

    if (refreshed.type === "stale") {
      setManagementCompletionHold(true);
      setAlert("moveRefreshFailed");
      focusHeading();
      return;
    }
    setManagementCompletionHold(false);
    setMoveAnnouncement({ lane: result.lane, position: result.position, count: result.count });
    setAlert(null);
    queueMicrotask(() => {
      const itemStillVisible = nextPrefixes?.[result.lane].items.some(
        ({ key }) => key === item.key,
      );
      const itemTarget = itemStillVisible ? itemFocusTargetsRef.current.get(item.key) : null;
      if (itemTarget != null) itemTarget.focus();
      else laneHeadingRefs.current.get(result.lane)?.focus();
    });
  };

  const triggerLabel =
    guidingCount > 0 && ordinaryQueuedCount > 0
      ? t`Pending: Guide ${guidingCount}, Queued ${ordinaryQueuedCount}`
      : guidingCount > 0
        ? t`Pending: Guide ${guidingCount}`
        : t`Pending: Queued ${ordinaryQueuedCount}`;
  const renderTrigger = !externallyClosed && (hasPendingInputs || displayedIsOpen);

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
                {displayedEditSession?.phase !== "active" ? (
                  <Trans>Pending details</Trans>
                ) : (
                  <Trans>Edit pending message</Trans>
                )}
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              {displayedAlert == null ? null : <PendingManagementAlert alert={displayedAlert} />}
              {moveAnnouncement == null ? null : (
                <p aria-live="polite" role="status">
                  {moveAnnouncement.lane === "ordinary" ? (
                    <Trans>
                      Queued message moved to position {moveAnnouncement.position} of {moveAnnouncement.count}.
                    </Trans>
                  ) : (
                    <Trans>
                      Guiding message moved to position {moveAnnouncement.position} of {moveAnnouncement.count}.
                    </Trans>
                  )}
                </p>
              )}
              {displayedEditSession?.phase !== "active" ? (
                <PendingInputList
                  actionsDisabled={displayedEditSession?.phase === "preparing"}
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
              {displayedEditSession == null ? null : (
                <div hidden={displayedEditSession.phase === "preparing"}>
                  <ComposerPendingInputEditor
                    guardCompositionEndEnter={guardCompositionEndEnter}
                    onControllerChange={onEditorControllerChange}
                    onRetrySkillCatalog={onRetrySkillCatalog}
                    onSave={saveEdit}
                    onValidityChange={setEditorValid}
                    skillCatalog={skillCatalog}
                  />
                </div>
              )}
            </Drawer.Body>
            {displayedEditSession?.phase !== "active" ? null : (
              <Drawer.Footer>
                <Button onPress={() => cancelEdit(false)} variant="secondary">
                  <Trans>Cancel</Trans>
                </Button>
                <Button isDisabled={!editorValid} onPress={saveEdit} variant="primary">
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

function PendingManagementAlert({ alert }: Readonly<{ alert: DrawerAlert }>) {
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
              The pending-message order did not change, and the refreshed order could not be loaded because the queue kept changing.
            </Trans>
          ) : alert === "moveRefreshFailed" ? (
            <Trans>
              The message was moved, but repeated queue changes prevented the updated order from loading.
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

function PendingInputList({
  actionsDisabled,
  deleteItem,
  guidingCount,
  onBeginEdit,
  onDetailFailure,
  onMove,
  onShowMore,
  ordinaryQueuedCount,
  pages,
  registerItemFocusTarget,
  registerLaneHeading,
}: Readonly<{
  actionsDisabled: boolean;
  deleteItem: (item: ComposerPendingInputPageItem) => boolean;
  guidingCount: number;
  onBeginEdit: (item: ComposerPendingInputPageItem) => void;
  onDetailFailure: (result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>) => void;
  onMove: (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ) => void;
  onShowMore: (lane: ComposerPendingInputLane) => void;
  ordinaryQueuedCount: number;
  pages: PendingInputPages | null;
  registerItemFocusTarget: (key: string, element: HTMLElement | null) => void;
  registerLaneHeading: (lane: ComposerPendingInputLane, element: HTMLHeadingElement | null) => void;
}>) {
  if (pages == null) return null;
  if (guidingCount === 0 && ordinaryQueuedCount === 0)
    return (
      <p className="text-sm">
        <Trans>No pending messages</Trans>
      </p>
    );
  return (
    <div className="grid min-w-0 gap-4">
      {guidingCount > 0 ? (
        <PendingInputGroup
          actionsDisabled={actionsDisabled}
          controller={pages.controller}
          count={guidingCount}
          items={pages.steer.items}
          lane="steer"
          nextCursorAvailable={pages.steer.nextCursor != null}
          onBeginEdit={onBeginEdit}
          onDetailFailure={onDetailFailure}
          onDelete={deleteItem}
          onMove={onMove}
          onShowMore={onShowMore}
          registerItemFocusTarget={registerItemFocusTarget}
          registerLaneHeading={registerLaneHeading}
          revision={pages.revision}
        />
      ) : null}
      {guidingCount > 0 && ordinaryQueuedCount > 0 ? <Separator variant="tertiary" /> : null}
      {ordinaryQueuedCount > 0 ? (
        <PendingInputGroup
          actionsDisabled={actionsDisabled}
          controller={pages.controller}
          count={ordinaryQueuedCount}
          items={pages.ordinary.items}
          lane="ordinary"
          nextCursorAvailable={pages.ordinary.nextCursor != null}
          onBeginEdit={onBeginEdit}
          onDetailFailure={onDetailFailure}
          onDelete={deleteItem}
          onMove={onMove}
          onShowMore={onShowMore}
          registerItemFocusTarget={registerItemFocusTarget}
          registerLaneHeading={registerLaneHeading}
          revision={pages.revision}
        />
      ) : null}
    </div>
  );
}

function PendingInputGroup({
  actionsDisabled,
  controller,
  count,
  items,
  lane,
  nextCursorAvailable,
  onBeginEdit,
  onDetailFailure,
  onDelete,
  onMove,
  onShowMore,
  registerItemFocusTarget,
  registerLaneHeading,
  revision,
}: Readonly<{
  actionsDisabled: boolean;
  controller: ComposerInputQueueCoordinator;
  count: number;
  items: readonly ComposerPendingInputPageItem[];
  lane: ComposerPendingInputLane;
  nextCursorAvailable: boolean;
  onBeginEdit: (item: ComposerPendingInputPageItem) => void;
  onDetailFailure: (result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>) => void;
  onDelete: (item: ComposerPendingInputPageItem) => boolean;
  onMove: (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ) => void;
  onShowMore: (lane: ComposerPendingInputLane) => void;
  revision: number;
  registerItemFocusTarget: (key: string, element: HTMLElement | null) => void;
  registerLaneHeading: (lane: ComposerPendingInputLane, element: HTMLHeadingElement | null) => void;
}>) {
  const { t } = useLingui();
  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-sm font-medium outline-none"
          ref={(element) => {
            registerLaneHeading(lane, element);
          }}
          tabIndex={-1}
        >
          {lane === "steer" ? <Trans>Guiding</Trans> : <Trans>Queued</Trans>}
        </h3>
        <Chip size="sm" variant={lane === "steer" ? "secondary" : "tertiary"}>
          {count}
        </Chip>
      </div>
      <ul className="grid min-w-0 gap-2">
        {items.map((item) => (
          <li className="min-w-0" key={`${String(revision)}:${item.key}`}>
            <PendingInputItem
              actionsDisabled={actionsDisabled}
              controller={controller}
              item={item}
              onBeginEdit={onBeginEdit}
              onDetailFailure={onDetailFailure}
              onDelete={onDelete}
              onMove={onMove}
              registerItemFocusTarget={registerItemFocusTarget}
              revision={revision}
            />
          </li>
        ))}
      </ul>
      {!nextCursorAvailable ? null : (
        <Button
          aria-label={
            lane === "steer" ? t`Show more guiding messages` : t`Show more queued messages`
          }
          onPress={() => {
            onShowMore(lane);
          }}
          variant="tertiary"
        >
          <Trans>Show more</Trans>
        </Button>
      )}
    </section>
  );
}

function PendingInputItem({
  actionsDisabled,
  controller,
  item,
  onBeginEdit,
  onDetailFailure,
  onDelete,
  onMove,
  registerItemFocusTarget,
  revision,
}: Readonly<{
  actionsDisabled: boolean;
  controller: ComposerInputQueueCoordinator;
  item: ComposerPendingInputPageItem;
  onBeginEdit: (item: ComposerPendingInputPageItem) => void;
  onDetailFailure: (result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>) => void;
  onDelete: (item: ComposerPendingInputPageItem) => boolean;
  onMove: (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ) => void;
  revision: number;
  registerItemFocusTarget: (key: string, element: HTMLElement | null) => void;
}>) {
  const { t } = useLingui();
  const [isExpanded, setIsExpanded] = useState(false);
  const [detailText, setDetailText] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const preview = item.preview;
  const previewText = preview.type === "text" ? preview.text : t`Structured input`;
  const onExpandedChange = (expanded: boolean): void => {
    if (!expanded) {
      setIsExpanded(false);
      setDetailText(null);
      return;
    }
    const detail = controller.readPendingInputDetail({ key: item.key, revision });
    if (detail.type !== "detail") {
      setIsExpanded(false);
      setDetailText(null);
      onDetailFailure(detail);
      return;
    }
    setDetailText(detail.text);
    setIsExpanded(true);
  };
  const content =
    preview.type === "text" && preview.truncated ? (
      <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
        <Disclosure.Heading>
          <Button
            aria-label={
              isExpanded
                ? t`Collapse pending message: ${previewText}`
                : t`Expand pending message: ${previewText}`
            }
            className="h-auto min-w-0 justify-between whitespace-normal"
            slot="trigger"
            variant="tertiary"
          >
            <ComposerInputPreviewContent preview={preview} />
            <span>{isExpanded ? <Trans>Collapse</Trans> : <Trans>Expand</Trans>}</span>
            <Disclosure.Indicator />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="pt-2">
            {detailText == null ? null : (
              <p className="min-w-0 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                {detailText}
              </p>
            )}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    ) : (
      <ComposerInputPreviewContent preview={preview} />
    );
  return (
    <div
      aria-label={previewText}
      className="grid min-w-0 gap-2 rounded-medium border border-separator p-3 outline-none"
      ref={(element) => {
        registerItemFocusTarget(item.key, element);
      }}
      role="group"
      tabIndex={-1}
    >
      {content}
      {item.management.type === "manageable" ? (
        confirmingDelete ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-sm">
              <Trans>Delete this pending message?</Trans>
            </span>
            <Button
              onPress={() => {
                setConfirmingDelete(false);
              }}
              size="sm"
              variant="secondary"
            >
              <Trans>Keep</Trans>
            </Button>
            <Button
              isDisabled={actionsDisabled}
              onPress={() => {
                if (!onDelete(item)) setConfirmingDelete(false);
              }}
              size="sm"
              variant="danger"
            >
              <Trans>Delete</Trans>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {!actionsDisabled && item.movement != null ? (
              <>
                <Button
                  aria-label={t`Move up pending message: ${previewText}`}
                  isDisabled={!item.movement.canMoveEarlier}
                  onPress={() => {
                    onMove(item, "earlier");
                  }}
                  size="sm"
                  variant="tertiary"
                >
                  <Trans>Move up</Trans>
                </Button>
                <Button
                  aria-label={t`Move down pending message: ${previewText}`}
                  isDisabled={!item.movement.canMoveLater}
                  onPress={() => {
                    onMove(item, "later");
                  }}
                  size="sm"
                  variant="tertiary"
                >
                  <Trans>Move down</Trans>
                </Button>
                <Dropdown>
                  <Button
                    aria-label={t`More move options for pending message: ${previewText}`}
                    size="sm"
                    variant="tertiary"
                  >
                    <Trans>Move to</Trans>
                  </Button>
                  <Dropdown.Popover>
                    <Dropdown.Menu
                      disabledKeys={[
                        ...(item.movement.canMoveEarlier ? [] : ["first"]),
                        ...(item.movement.canMoveLater ? [] : ["last"]),
                      ]}
                      onAction={(key) => {
                        if (key === "first" || key === "last") onMove(item, key);
                      }}
                    >
                      <Dropdown.Item id="first" textValue={t`Move pending message to first`}>
                        <Label>
                          <Trans>Move to first</Trans>
                        </Label>
                      </Dropdown.Item>
                      <Dropdown.Item id="last" textValue={t`Move pending message to last`}>
                        <Label>
                          <Trans>Move to last</Trans>
                        </Label>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </>
            ) : null}
            <Button
              isDisabled={actionsDisabled}
              onPress={() => {
                onBeginEdit(item);
              }}
              size="sm"
              variant="tertiary"
            >
              <Trans>Edit</Trans>
            </Button>
            <Button
              isDisabled={actionsDisabled}
              onPress={() => {
                setConfirmingDelete(true);
              }}
              size="sm"
              variant="danger-soft"
            >
              <Trans>Delete</Trans>
            </Button>
          </div>
        )
      ) : (
        <p className="text-sm text-muted">
          {item.management.type === "editing" ? (
            <Trans>This message is being edited.</Trans>
          ) : (
            <Trans>This message has entered the sending process.</Trans>
          )}
        </p>
      )}
    </div>
  );
}

export function ComposerInputPreviewContent({
  preview,
}: Readonly<{ preview: ComposerInputPreview }>) {
  if (preview.type === "text")
    return (
      <p className="min-w-0 line-clamp-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
        {preview.text}
      </p>
    );
  const counts: ReactNode[] = [];
  if (preview.imageCount > 0)
    counts.push(<Plural key="images" value={preview.imageCount} one="# image" other="# images" />);
  if (preview.audioCount > 0)
    counts.push(
      <Plural key="audio" value={preview.audioCount} one="# audio item" other="# audio items" />,
    );
  if (preview.skillCount > 0)
    counts.push(<Plural key="skills" value={preview.skillCount} one="# skill" other="# skills" />);
  if (preview.mentionCount > 0)
    counts.push(
      <Plural key="mentions" value={preview.mentionCount} one="# mention" other="# mentions" />,
    );
  return (
    <p className="flex min-w-0 flex-wrap gap-x-2 text-sm [overflow-wrap:anywhere]">
      {counts.length === 0 ? <Trans>Structured input</Trans> : counts}
    </p>
  );
}

function readInitialPages(
  controller: ComposerInputQueueCoordinator,
  revision: number,
): PendingInputPages | null {
  const result = readInitialComposerPendingInputPrefixes(controller, revision);
  return result.type === "ready" ? { controller, ...result.prefixes } : null;
}

function pendingInputPagesAreEmpty(pages: PendingInputPages): boolean {
  return pages.steer.items.length === 0 && pages.ordinary.items.length === 0;
}
